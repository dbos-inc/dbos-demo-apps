'use client';

import { useEffect, useState } from 'react';
import { ThemeProvider, CssBaseline, Container, Button } from '@mui/material';
import { lightTheme, darkTheme } from '@/themes/theme';
import { AppBar, Toolbar, Typography, IconButton } from '@mui/material';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import HelpDialog from '@/components/HelpDialog';

export default function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkMode] = useState(false);

  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    // Check local storage for first-time visit
    const hasSeenHelp = localStorage.getItem('hasSeenHelp');
    if (!hasSeenHelp) {
      setHelpOpen(true);
      localStorage.setItem('hasSeenHelp', 'true');  // Store the visit
    }
  }, []);

  return (
    <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>
            DBOS Task Scheduler
          </Typography>
          <Button variant="outlined" color="inherit" onClick={() => setHelpOpen(true)}>Help</Button>
          <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
          <IconButton onClick={() => setDarkMode(!darkMode)} color="inherit">
            {darkMode ? <Brightness7Icon /> : <Brightness4Icon />}
          </IconButton>
        </Toolbar>
      </AppBar>
      <Container maxWidth={false} sx={{ mt: 4 }}>
        {children}
      </Container>
    </ThemeProvider>
  );
}
