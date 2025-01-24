'use client';

import { useState, useEffect } from 'react';
import { addSchedule, getAllTasks } from '@/actions/schedule';
import { TaskOption } from '@/types/models';
import { Button, MenuItem, Select, FormControl, InputLabel, Box, Typography } from '@mui/material';

import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, {Dayjs} from 'dayjs';

type ScheduleFormProps = {
  initialDate?: Date | null;
  initialEnd?: Date | null;
  onSuccess: () => void;
};

export default function ScheduleForm({ initialDate, initialEnd, onSuccess }: ScheduleFormProps) {
  if (!initialEnd) initialEnd = initialDate;
  const [startTime, setStartTime] = useState<Dayjs | null>(
    dayjs()
  );
  const [endTime, setEndTime] = useState<Dayjs | null>(
    dayjs()
  );

  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [selectedTask, setSelectedTask] = useState('');
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
    if (!startTime) {
      alert("Please set a start time.");
      return;
    }
    await addSchedule(selectedTask, startTime.toDate(), (endTime ?? startTime).toDate(), repeat);
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
        <InputLabel id="task-select-label" shrink>Task</InputLabel>
        <Select
          labelId="task-select-label"
          label="Task"
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

      <FormControl fullWidth margin="normal">
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DateTimePicker
            label="Start Time"
            value={startTime}
            onChange={(newValue) => setStartTime(newValue)}
          />
        </LocalizationProvider>
      </FormControl>

      <FormControl fullWidth margin="normal">
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DateTimePicker
            label="End Time"
            value={endTime}
            onChange={(newValue) => setEndTime(newValue)}
          />
        </LocalizationProvider>
      </FormControl>

      <FormControl fullWidth margin="normal">
        <InputLabel id="repeat-select-label" shrink>Repetition</InputLabel>
        <Select
          labelId="repeat-select-label"
          label="Repetition"
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
