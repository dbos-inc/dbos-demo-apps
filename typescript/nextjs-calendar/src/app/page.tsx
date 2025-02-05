'use client';

import CalendarView from '@/components/CalendarView';
import { useState } from 'react';
import { Box } from '@mui/material';


export default function HomePage() {
  const [refresh, _setRefresh] = useState(false);

  return (
    <Box>
      <CalendarView key={refresh.toString()} />
    </Box>
  );
}