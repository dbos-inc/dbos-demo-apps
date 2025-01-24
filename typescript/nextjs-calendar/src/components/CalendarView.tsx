'use client';

import { fetchSchedules, fetchResults } from '@/actions/schedule';
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

  const [open, setOpen] = useState(false);
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalEvent[]>([]);

  const [selectedResult, setSelectedResult] = useState<ResultsUIRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleEventClick = (event: CalEvent) => {
    if (event.type === 'result') {
      setSelectedResult(event.res ?? null);
      setDialogOpen(true);
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
        end: new Date(new Date(item.start_time).getTime() + 30 * 60 * 1000), // 30-min duration
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
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setSelectedStart(null);
    setSelectedEnd(null);
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
      <Paper elevation={3} sx={{ p: 3, maxWidth: '1000px', mx: 'auto', mt: 4 }}>
        <Typography variant="h5" align="center" gutterBottom>
          Task Scheduler
        </Typography>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 600 }}
          views={['month', 'week', 'day']}
          defaultView={Views.MONTH}
          popup
          selectable
          eventPropGetter={eventStyleGetter}
          onSelectEvent={handleEventClick}
          onSelectSlot={(slotInfo) => { if (slotInfo.action === 'doubleClick') handleDoubleClick(slotInfo.start, slotInfo.end)} }
        />
      </Paper>

      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>Schedule a New Task</DialogTitle>
        <DialogContent>
          {selectedStart && <ScheduleForm initialDate={selectedStart} initialEnd={selectedEnd} onSuccess={handleClose} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} color="primary">
            Cancel
          </Button>
        </DialogActions>
      </Dialog>

      <ResultsModal
        open={dialogOpen} 
        onClose={() => setDialogOpen(false)} 
        result={selectedResult} 
      />
    </>
  );
}
