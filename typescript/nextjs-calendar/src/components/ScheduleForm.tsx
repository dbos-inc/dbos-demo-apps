'use client';

import { useState, useEffect } from 'react';
import { addSchedule, getAllTasks } from '@/actions/schedule';
import { TaskOption } from '@/types/models';
import { TextField, Button, MenuItem, Select, FormControl, InputLabel, Box, Typography } from '@mui/material';

type Props = {
  onSuccess: () => void;
};

export default function ScheduleForm({ onSuccess }: Props) {
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
        setSelectedTask(availableTasks[0].id); // Default to first task
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
    await addSchedule(selectedTask, new Date(startTime), new Date(endTime), repeat);
    //window.location.reload();  // Refresh data after adding
    onSuccess();
  };

  return (
    <Box 
      component="form"
      onSubmit={handleSubmit}
      sx={{
        maxWidth: 500,
        mx: 'auto',
        p: 3,
        bgcolor: 'background.paper',
        boxShadow: 3,
        borderRadius: 2,
      }}
    >
      <Typography variant="h5" component="h2" gutterBottom>
        Schedule a Task
      </Typography>

      <FormControl fullWidth margin="normal">
        <InputLabel id="task-select-label">Task</InputLabel>
        <Select
          labelId="task-select-label"
          value={selectedTask}
          onChange={(e) => setSelectedTask(e.target.value)}
          required
        >
          {tasks.map((task) => (
            <MenuItem key={task.id} value={task.id}>
              {task.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        label="Start Time"
        type="datetime-local"
        fullWidth
        margin="normal"
        value={startTime}
        onChange={(e) => setStartTime(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        required
      />

      <TextField
        label="End Time"
        type="datetime-local"
        fullWidth
        margin="normal"
        value={endTime}
        onChange={(e) => setEndTime(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        required
      />

      <FormControl fullWidth margin="normal">
        <InputLabel id="repeat-select-label">Repetition</InputLabel>
        <Select
          labelId="repeat-select-label"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        >
          <MenuItem value="daily">Daily</MenuItem>
          <MenuItem value="weekly">Weekly</MenuItem>
          <MenuItem value="monthly">Monthly</MenuItem>
        </Select>
      </FormControl>

      <Button type="submit" variant="contained" color="primary" fullWidth>
        Add Schedule
      </Button>
    </Box>
  );
}
