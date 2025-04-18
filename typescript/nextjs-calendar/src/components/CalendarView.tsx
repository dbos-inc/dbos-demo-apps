'use client';

import "react-big-calendar/lib/css/react-big-calendar.css";
import "../themes/calendarToolbarButtonStyles.css";
import { fetchSchedules, fetchResults, deleteSchedule } from '@/actions/schedule';
import { ScheduleUIRecord, ResultsUIRecord } from '@/types/models';
import { useState, useEffect, useRef } from 'react';
import { Paper, Typography, useTheme } from '@mui/material';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { Calendar, Views, momentLocalizer } from 'react-big-calendar';
import { ScheduleForm, ScheduleFormHandle } from './ScheduleForm';
import ResultsModal from './ResultsModal';
import moment from 'moment';
import { subDays, addDays } from 'date-fns';
import { getOccurrences } from '@/types/taskschedule';
import dayjs from "dayjs";

const localizer = momentLocalizer(moment);

// Function to calculate initial range based on the current view
const getInitialRange = (view: string, date: Date) => {
  switch (view) {
    case 'month':
      return {
        start: moment(date).startOf('month').toDate(),
        end: moment(date).endOf('month').toDate(),
      };
    case 'week':
      return {
        start: moment(date).startOf('week').toDate(),
        end: moment(date).endOf('week').toDate(),
      };
    case 'day':
      return {
        start: moment(date).startOf('day').toDate(),
        end: moment(date).endOf('day').toDate(),
      };
    default:
      return { start: date, end: date };
  }
};

interface CalEvent {
  title: string;
  start: Date;
  end: Date,
  type: string,
  sched?: ScheduleUIRecord,
  res?: ResultsUIRecord,
};


const getIntuitiveStartTime = (selectedStartDate: Date): Date => {
  const selectedStart = dayjs(selectedStartDate);
  const now = dayjs();
  const today = now.startOf("day");

  // If selectedStart is today and in the past, round up to the next 5 minute interval
  if (selectedStart.isSame(today, "day") && selectedStart.isBefore(now)) {
    console.log('Triggered');
    const minutes = now.minute();
    const remainder = minutes % 5;
    return now.add(5 - remainder, "minute").second(0).millisecond(0).toDate();
  }
  return selectedStart.toDate();
};

export default function CalendarView() {
  const theme = useTheme();

  const [calRange, setCalRange] = useState<{ start: Date; end: Date } | null>(null);

  const [addScheduleOpen, setAddScheduleOpen] = useState(false);
  const [editScheduleOpen, setEditScheduleOpen] = useState(false);
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);

  const [selectedResult, setSelectedResult] = useState<ResultsUIRecord | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleUIRecord | null>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);

  const [_socket, setSocket] = useState<WebSocket | null>(null);

  const handleEventClick = (event: CalEvent) => {
    if (event.type === 'result') {
      if (event.res?.error) {
        alert(`${event.title} - ${event.res.error}`);
      }
      else {
        setSelectedResult(event.res ?? null);
        setResultDialogOpen(true);
      }
    }
    if (event.type === 'task') {
      setSelectedSchedule(event.sched ?? null);
      setEditScheduleOpen(true);
    }
  };

  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    async function loadData() {
      const scheduleData = await fetchSchedules();

      if (!calRange) return;

      const resultData = await fetchResults(
        subDays(calRange.start, 1),
        addDays(calRange.end, 1)
      );

      const formattedSchedules: CalEvent[] = [];

      for (const item of scheduleData) {
        if (!calRange) break;
        const occasions = getOccurrences(item, subDays(calRange.start, 1), addDays(calRange.end, 1));
        for (const occasion of occasions) {
          formattedSchedules.push({
            title: `${item.name}`,
            start: occasion,
            end: new Date(occasion.getTime() + 10 * 60 * 1000),
            type: 'task',
            sched: item,
          });
        }
      }

      const formattedResults = resultData.map((item: ResultsUIRecord) => ({
        title: item.error ? `ERROR: ${item.name}` : `${item.name} Results`,
        start: new Date(new Date(item.run_time).getTime()+1),
        end: new Date(new Date(item.run_time).getTime() + 1 * 60 * 1000), // 1-min duration
        type: 'result',
        res: item,
      }));

      setEvents([...formattedSchedules, ...formattedResults]);
    }

    loadData();

    // Set interval to refresh every 60 seconds
    const intervalId = setInterval(() => {
      setRefreshKey((prevKey) => prevKey + 1);
    }, 60000);

    // Cleanup interval on unmount to stop refreshing
    return () => clearInterval(intervalId);
  }, [refreshKey, calRange]);


  useEffect(() => {
    const connectWebSocket = () => {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/ws`;
  
      const ws = new WebSocket(wsUrl);
  
      ws.onopen = () => console.log(`Connected to WebSocket: ${wsUrl}`);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data) as {type?: string};
        if (data.type === 'schedule' || data.type === 'result') {
          setRefreshKey(r => r + 1);
        }
      };
  
      ws.onclose = () => {
        console.log('WebSocket Disconnected. Reconnecting in 5 seconds...');
        setTimeout(connectWebSocket, 5000); // Retry after 5 seconds
      };
  
      setSocket(ws);
    };
  
    connectWebSocket();
  }, []);

  useEffect(() => {
    // Set initial range when the component mounts
    const initialDate = new Date();
    setCalRange(getInitialRange('month', initialDate));
  }, []);

  const handleSlotClick = (start: Date, end: Date) => {
    setSelectedStart(start);
    setSelectedEnd(end);
    setAddScheduleOpen(true);
  };

    const handleRangeChange = (range: { start: Date; end: Date } | Date [] | null) => {
    if (Array.isArray(range)) {
      // Month view: range is an array [startDate, endDate]
      setCalRange({ start: range[0], end: range[range.length - 1] });
    } else if (range?.start && range?.end) {
      // Week/day view: range is an object { start: Date, end: Date }
      setCalRange(range);
    }
    else {
      setCalRange(null);
    }
  };

  const handleAddScheduleClose = () => {
    setAddScheduleOpen(false);
    setSelectedStart(null);
    setSelectedEnd(null);
    setRefreshKey(refreshKey+1);
  };

  const handleEditScheduleClose = () => {
    setEditScheduleOpen(false);
    setSelectedSchedule(null);
    setRefreshKey(refreshKey+1);
  };

  const handleDeleteSchedule = async () => {
    setEditScheduleOpen(false);
    if (selectedSchedule) {
      await deleteSchedule(selectedSchedule.id);
    }
    setSelectedSchedule(null);
    setRefreshKey(refreshKey+1);
  };

  const eventStyleGetter = (event: CalEvent) => ({
    style: {
      backgroundColor: event.type === 'task' ? theme.palette.primary.main
        : event.res?.error ? theme.palette.error.main : theme.palette.secondary.main,
      color: event.type === 'task' ? theme.palette.primary.contrastText
        : event.res?.error ? theme.palette.error.contrastText : theme.palette.secondary.contrastText,
    },
    title: `${event.title} (${event.type})`,  // Tooltip info
  });

  const scheduleFormRef = useRef<ScheduleFormHandle>(null);

  return (
    <>
      <Paper elevation={3} sx={{ p: 3, maxWidth: '99%', mx: 'auto', mt: 4 }}>
        <Typography variant="h5" align="center" gutterBottom>
          <a href={'https://dbos.dev'}> DBOS Task Scheduler </a> - <i>Execution guaranteed or double your workflows back!</i>
        </Typography>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '800px' }}
          views={['month', 'week', 'day']}
          defaultView={Views.MONTH}
          popup
          selectable
          onRangeChange={handleRangeChange}
          eventPropGetter={eventStyleGetter}
          onSelectEvent={handleEventClick}
          onSelectSlot={(slotInfo) => { handleSlotClick(slotInfo.start, slotInfo.end)} }
        />
      </Paper>

      <Dialog open={addScheduleOpen} onClose={handleAddScheduleClose} fullWidth maxWidth="sm">
        <DialogTitle>Schedule a New Task</DialogTitle>
        <DialogContent>
          {selectedStart && <ScheduleForm
            allowTaskSelection={true}
            initialDate={getIntuitiveStartTime(selectedStart)}
            initialEnd={selectedEnd}
            onSuccess={handleAddScheduleClose}
            ref={scheduleFormRef}
          />}
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="outlined" color="secondary" onClick={() => scheduleFormRef.current?.handleTest()}>
            Test
          </Button>
          <Button onClick={handleAddScheduleClose} color="primary">
            Cancel
          </Button>
          <Button onClick={() => scheduleFormRef.current?.handleSubmit()} variant="contained" color="primary">
            Add Schedule
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog key={selectedSchedule?.id} open={editScheduleOpen} onClose={handleEditScheduleClose} fullWidth maxWidth="sm">
        <DialogTitle>Edit / Delete Task</DialogTitle>
        <DialogContent>
          {selectedSchedule && <ScheduleForm
            allowTaskSelection={false}
            initialDate={new Date(selectedSchedule.start_time)}
            initialEnd={new Date(selectedSchedule.end_time)}
            selectedSched={selectedSchedule}
            onSuccess={handleEditScheduleClose}
            ref={scheduleFormRef}
          />}
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="outlined" color="secondary" onClick={() => scheduleFormRef.current?.handleTest()}>
            Test
          </Button>
          <Button onClick={handleDeleteSchedule} color="primary">
            Delete
          </Button>
          <Button onClick={handleEditScheduleClose} color="primary">
            Cancel
          </Button>
          <Button onClick={() => scheduleFormRef.current?.handleSubmit()} variant="contained" color="primary">
            Update Schedule
          </Button>
        </DialogActions>
      </Dialog>

      <ResultsModal
        open={resultDialogOpen} 
        onClose={() => setResultDialogOpen(false)} 
        result={selectedResult} 
      />
    </>
  );
}
