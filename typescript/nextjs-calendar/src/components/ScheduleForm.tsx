
'use client';

import { useState } from 'react';
import { addSchedule } from '@/actions/schedule';

export default function ScheduleForm() {
  const [task, setTask] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [repeat, setRepeat] = useState('daily');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addSchedule(task, new Date(startTime), new Date(startTime), repeat);
    window.location.reload();  // Refresh data after adding
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" placeholder="Task Name" value={task} onChange={(e) => setTask(e.target.value)} required />
      <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
      <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
      <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
      <button type="submit">Add Schedule</button>
    </form>
  );
}