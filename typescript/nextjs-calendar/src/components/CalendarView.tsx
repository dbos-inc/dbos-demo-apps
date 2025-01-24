'use client';

import { fetchSchedules, fetchResults, deleteSchedule } from '@/actions/schedule';
import { ScheduleUIRecord, ResultsUIRecord } from '@/types/models';
import { useState, useEffect } from 'react';
import { Paper, Typography, useTheme } from '@mui/material';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { Calendar, Views, momentLocalizer } from 'react-big-calendar';
import "react-big-calendar/lib/css/react-big-calendar.css";
import ScheduleForm from './ScheduleForm';
import ResultsModal from './ResultsModal';
import moment from 'moment';
import { subDays, addDays } from 'date-fns';

const localizer = momentLocalizer(moment);

interface CalEvent {
  title: string;
  start: Date;
  end: Date,
  type: string,
  sched?: ScheduleUIRecord,
  res?: ResultsUIRecord,
};

export default function CalendarView() {
  const theme = useTheme();

  const [addScheduleOpen, setAddScheduleOpen] = useState(false);
  const [editScheduleOpen, setEditScheduleOpen] = useState(false);
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);

  const [selectedResult, setSelectedResult] = useState<ResultsUIRecord | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleUIRecord | null>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);

  const handleEventClick = (event: CalEvent) => {
    if (event.type === 'result') {
      setSelectedResult(event.res ?? null);
      setResultDialogOpen(true);
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
      const resultData = await fetchResults(
        // This could be optimized by looking at the calendar view range
        subDays(new Date(), 1000),
        addDays(new Date(), 1000)
      );

      const formattedSchedules = scheduleData.map((item: ScheduleUIRecord) => ({
        title: `${item.name}`,
        start: new Date(item.start_time),
        end: new Date(Math.max(new Date(item.end_time).getTime(), new Date(new Date(item.start_time).getTime() + 10 * 60 * 1000).getTime())),
        type: 'task',
        sched: item,
      }));

      const formattedResults = resultData.map((item: ResultsUIRecord) => ({
        title: `${item.name} Results`,
        start: new Date(item.run_time),
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
  }, [refreshKey]);

  const handleDoubleClick = (start: Date, end: Date) => {
    setSelectedStart(start);
    setSelectedStart(end);
    setAddScheduleOpen(true);
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
      backgroundColor: event.type === 'task' ? theme.palette.primary.main : theme.palette.secondary.main,
      color: event.type === 'task' ? theme.palette.primary.contrastText : theme.palette.secondary.contrastText,
    },
    title: `${event.title} (${event.type})`,  // Tooltip info
  });

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
          eventPropGetter={eventStyleGetter}
          onSelectEvent={handleEventClick}
          onSelectSlot={(slotInfo) => { if (slotInfo.action === 'doubleClick') handleDoubleClick(slotInfo.start, slotInfo.end)} }
        />
      </Paper>

      <Dialog open={addScheduleOpen} onClose={handleAddScheduleClose} fullWidth maxWidth="sm">
        <DialogTitle>Schedule a New Task</DialogTitle>
        <DialogContent>
          {selectedStart && <ScheduleForm allowTaskSelection={true} initialDate={selectedStart} initialEnd={selectedEnd} onSuccess={handleAddScheduleClose} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleAddScheduleClose} color="primary">
            Cancel
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
          />}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteSchedule} color="primary">
            Delete
          </Button>
          <Button onClick={handleEditScheduleClose} color="primary">
            Cancel
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
