'use client';

import { fetchSchedules, fetchResults } from '@/actions/schedule';
import { ScheduleRecord, ResultsRecord } from '@/types/models';
import { useState, useEffect } from 'react';
import { Paper, Typography } from '@mui/material';
import { Calendar, Views, momentLocalizer } from 'react-big-calendar';
import "react-big-calendar/lib/css/react-big-calendar.css";
import moment from 'moment';

const localizer = momentLocalizer(moment);

export default function CalendarView() {
  const [events, setEvents] = useState<{ title: string; start: Date; end: Date }[]>([]);

  useEffect(() => {
    async function loadData() {
      const scheduleData = await fetchSchedules();
      const resultData = await fetchResults(
        new Date().toISOString().split('T')[0] + 'T00:00:00Z',
        new Date().toISOString().split('T')[0] + 'T23:59:59Z'
      );

      const formattedSchedules = scheduleData.map((item: ScheduleRecord) => ({
        title: `Task: ${item.task}`,
        start: new Date(item.start_time),
        end: new Date(new Date(item.start_time).getTime() + 60 * 60 * 1000), // 1-hour duration
      }));

      const formattedResults = resultData.map((item: ResultsRecord) => ({
        title: `Result: ${JSON.parse(item.result).status}`,
        start: new Date(item.run_time),
        end: new Date(new Date(item.run_time).getTime() + 30 * 60 * 1000), // 30-min duration
      }));

      setEvents([...formattedSchedules, ...formattedResults]);
    }

    loadData();
  }, []);

  return (
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
      />
    </Paper>
  );
}
