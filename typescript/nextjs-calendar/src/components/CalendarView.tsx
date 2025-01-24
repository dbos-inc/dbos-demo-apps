'use client';

import { fetchSchedules, fetchResults } from '@/actions/schedule';
import { ScheduleRecord, ResultsRecord } from '@/types/models';
import { useState, useEffect } from 'react';
import { Paper, Typography } from '@mui/material';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { Calendar, Views, momentLocalizer } from 'react-big-calendar';
import "react-big-calendar/lib/css/react-big-calendar.css";
import ScheduleForm from './ScheduleForm';
import moment from 'moment';
import { subDays, addDays } from 'date-fns';

const localizer = momentLocalizer(moment);

export default function CalendarView() {
  const [open, setOpen] = useState(false);
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [selectedEnd, setSelectedEnd] = useState<Date | null>(null);
  const [events, setEvents] = useState<{ title: string; start: Date; end: Date }[]>([]);

  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    async function loadData() {
      const scheduleData = await fetchSchedules();
      const resultData = await fetchResults(
        // This could be optimized by looking at the calendar view range
        subDays(new Date(), 1000),
        addDays(new Date(), 1000)
      );

      const formattedSchedules = scheduleData.map((item: ScheduleRecord) => ({
        title: `Task: ${item.task}`,
        start: new Date(item.start_time),
        end: new Date(new Date(item.start_time).getTime() + 30 * 60 * 1000), // 30-min duration
      }));

      const formattedResults = resultData.map((item: ResultsRecord) => ({
        title: `Result: ${JSON.parse(item.result).status}`,
        start: new Date(item.run_time),
        end: new Date(new Date(item.run_time).getTime() + 1 * 60 * 1000), // 1-min duration
      }));

      setEvents([...formattedSchedules, ...formattedResults]);
    }

    loadData();
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
          onSelectEvent={(event) => alert(`Event selected: ${event.title}`)}
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
    </>
  );
}
