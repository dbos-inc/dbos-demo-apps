'use client';

import ScheduleForm from '@/components/ScheduleForm';
import CalendarView from '@/components/CalendarView';
import { useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';


export default function HomePage() {
  const [refresh, setRefresh] = useState(false);

  return (
    <Box>
      <Typography variant="h4" align="center" gutterBottom>
        Welcome to Task Scheduler
      </Typography>

      <Paper elevation={3} sx={{ p: 3, mb: 4, maxWidth: '600px', mx: 'auto' }}>
        <ScheduleForm onSuccess={() => setRefresh(!refresh)} />
      </Paper>

      <CalendarView key={refresh.toString()} />
    </Box>
  );
}