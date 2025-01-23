'use client';

import { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import { fetchSchedules, fetchResults } from '@/actions/schedule';
import { ScheduleRecord, ResultsRecord } from '@/types/models';
import { Value } from 'react-calendar/dist/esm/shared/types.js';

export default function CalendarView() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [schedules, setSchedules] = useState<ScheduleRecord[]>([]);
  const [results, setResults] = useState<ResultsRecord[]>([]);

  useEffect(() => {
    async function loadData() {
      const scheduleData = await fetchSchedules();
      const resultData = selectedDate ? await fetchResults(
        selectedDate.toISOString().split('T')[0] + 'T00:00:00Z',
        selectedDate.toISOString().split('T')[0] + 'T23:59:59Z'
      ) : [];
      setSchedules(scheduleData);
      setResults(resultData);
    }
    loadData();
  }, [selectedDate]);

  const handleDateChange = (value: Value) => {
    if (value instanceof Date) {
      setSelectedDate(value);
    } else if (Array.isArray(value) && value.length > 0) {
      setSelectedDate(value[0] as Date);  // Handle range selection, take first date
    } else {
      setSelectedDate(null);
    }
  };

  return (
    <div>
      <h2>Schedule Overview</h2>
      <Calendar
        onChange={handleDateChange}
        value={selectedDate}
        view="month"
        tileContent={({ date }) => {
          const daySchedules = schedules.filter(
            (s) => new Date(s.start_time).toDateString() === date.toDateString()
          );
          const dayResults = results.filter(
            (r) => new Date(r.run_time).toDateString() === date.toDateString()
          );

          return (
            <>
              {daySchedules.length > 0 && <div style={{ color: 'blue' }}>📅</div>}
              {dayResults.length > 0 && <div style={{ color: 'green' }}>✅</div>}
            </>
          );
        }}
      />
    </div>
  );
}
