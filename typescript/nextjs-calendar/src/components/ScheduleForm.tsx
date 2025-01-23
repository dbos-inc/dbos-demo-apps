
'use client';

import { useState, useEffect } from 'react';
import { addSchedule, getAllTasks } from '@/actions/schedule';
import { TaskOption } from '@/types/models';

export default function ScheduleForm() {
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [selectedTask, setSelectedTask] = useState('');
  const [startTime, setStartTime] = useState<string>(new Date().toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState<string>(new Date().toISOString().slice(0, 16));
  const [repeat, setRepeat] = useState('daily');

  useEffect(() => {
    async function loadTasks() {
      const availableTasks = await getAllTasks();
      setTasks(availableTasks);
      if (availableTasks.length > 0) {
        setSelectedTask(availableTasks[0].id);  // Default to first task
      }
    }
    loadTasks();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) {
      alert("Please select a task.");
      return;
    }
    await addSchedule(selectedTask, new Date(startTime), new Date(startTime), repeat);
    window.location.reload();  // Refresh data after adding
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>Task:</label>
      <select value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)} required>
        <option value="" disabled>Select a task...</option>
        {tasks.map((task) => (
          <option key={task.id} value={task.id}>
            {task.name}
          </option>
        ))}
      </select>

      <label>End Time:</label>
      <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />

      <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />

      <label>Repeat:</label>
      <select value={repeat} onChange={(e) => setRepeat(e.target.value)}>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
      <button type="submit">Add Schedule</button>
    </form>
  );
}