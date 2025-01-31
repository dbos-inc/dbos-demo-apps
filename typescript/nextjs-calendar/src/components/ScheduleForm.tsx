'use client';

import { useState, useEffect } from 'react';
import { addSchedule, getAllTasks, runScheduleTest, runTaskTest, updateSchedule } from '@/actions/schedule';
import { ScheduleUIRecord, TaskOption } from '@/types/models';
import { Button, MenuItem, Select, FormControl, InputLabel, Box, Typography } from '@mui/material';

import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs, {Dayjs} from 'dayjs';

type ScheduleFormProps = {
  initialDate?: Date | null;
  initialEnd?: Date | null;
  selectedSched?: ScheduleUIRecord;

  existingId?: string;

  allowTaskSelection: boolean;

  onSuccess: () => void; // Insert or save
  onDelete?: () => void;
};

export default function ScheduleForm({
  initialDate, initialEnd, selectedSched,
  onSuccess, allowTaskSelection,
}: ScheduleFormProps)
{
  if (!initialEnd) initialEnd = initialDate;
  const [startTime, setStartTime] = useState<Dayjs | null>(
    dayjs(initialDate)
  );
  const [endTime, setEndTime] = useState<Dayjs | null>(
    dayjs(initialEnd)
  );

  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [selectedTask, setSelectedTask] = useState(selectedSched?.repeat ?? '');
  const [repeat, setRepeat] = useState('none');

  useEffect(() => {
    async function loadTasks() {
      const availableTasks = await getAllTasks();
      setTasks(availableTasks);
      if (availableTasks.length > 0) {
        if (selectedSched) {
          setSelectedTask(selectedSched.task);
        }
        else {
          setSelectedTask(availableTasks[0].id); // Default to first task
        }
      }
    }
    loadTasks();
  }, [selectedSched]);

  useEffect(() => {
    if (selectedSched) {
      setSelectedTask(selectedSched?.task ?? '');
      setRepeat(selectedSched?.repeat ?? '');
    }
  }, [selectedSched]);

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
    if (selectedSched?.id) {
      await updateSchedule(selectedSched.id, startTime.toDate(), (endTime ?? startTime).toDate(), repeat);
    }
    else {
      await addSchedule(selectedTask, startTime.toDate(), (endTime ?? startTime).toDate(), repeat);
    }
    onSuccess();
  };

  const handleTest = async () => {
    try {
      if (selectedSched) {
        await runScheduleTest(selectedSched.id, selectedSched.task);
        alert (`Check calendar for results...`);
      }
      else {
        const res = await runTaskTest(selectedTask);
        alert(`Result: ${res}`);
      }
    }
    catch (e) {
      const error = e as Error;
      alert(`Error: ${error.message}`);
    }
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
          value={selectedTask || ''}
          onChange={(e) => setSelectedTask(e.target.value)}
          required
          readOnly={!allowTaskSelection}
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
            onChange={
              (newValue) => {
                setStartTime(newValue);
                if (newValue && endTime && newValue > endTime) {
                  setEndTime(newValue);
                }
              }
            }
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
          <MenuItem value="none">None</MenuItem>
          <MenuItem value="daily">Daily</MenuItem>
          <MenuItem value="weekly">Weekly</MenuItem>
          <MenuItem value="monthly">Monthly</MenuItem>
        </Select>
      </FormControl>

      <Button
        type="button"
        variant="outlined"
        color="secondary"
        fullWidth
        onClick={handleTest}
      >
        Test
      </Button>

      <Button type="submit" variant="contained" color="primary" fullWidth>
        {selectedSched ? "Update Schedule" : "Add Schedule"}
      </Button>
    </Box>
  );
}
