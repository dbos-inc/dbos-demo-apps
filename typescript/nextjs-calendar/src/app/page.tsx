'use client';

import CalendarView from '@/components/CalendarView';
import { useState } from 'react';
import { Box, Typography } from '@mui/material';


export default function HomePage() {
  const [refresh, _setRefresh] = useState(false);

  return (
    <Box>
      <Typography variant="h4" align="center" gutterBottom>
        Welcome to Task Scheduler
      </Typography>

      <CalendarView key={refresh.toString()} />
    </Box>
  );
}