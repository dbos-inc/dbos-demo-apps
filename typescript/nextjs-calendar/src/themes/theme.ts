import { createTheme, ThemeOptions } from '@mui/material/styles';

// Define light and dark mode palettes
const lightPalette: ThemeOptions['palette'] = {
  mode: 'light',
  primary: {
    main: '#1976d2',  // MUI Blue
    contrastText: '#ffffff',
  },
  secondary: {
    main: '#dc004e',  // Pink
  },
  background: {
    default: '#f5f5f5',
    paper: '#ffffff',
  },
  text: {
    primary: '#333333',
    secondary: '#666666',
  },
};

const darkPalette: ThemeOptions['palette'] = {
  mode: 'dark',
  primary: {
    main: '#90caf9',  // Light blue
    contrastText: '#000000',
  },
  secondary: {
    main: '#f48fb1',  // Pink
  },
  background: {
    default: '#121212',
    paper: '#1e1e1e',
  },
  text: {
    primary: '#ffffff',
    secondary: '#aaaaaa',
  },
};

// Define typography settings
const typography: ThemeOptions['typography'] = {
  fontFamily: "'Roboto', 'Arial', sans-serif",
  h1: { fontSize: '2.5rem', fontWeight: 700 },
  h2: { fontSize: '2rem', fontWeight: 600 },
  h3: { fontSize: '1.75rem', fontWeight: 500 },
  h4: { fontSize: '1.5rem', fontWeight: 500 },
  h5: { fontSize: '1.25rem', fontWeight: 400 },
  h6: { fontSize: '1rem', fontWeight: 400 },
  body1: { fontSize: '1rem' },
  body2: { fontSize: '0.875rem' },
  button: { textTransform: 'none', fontWeight: 600 },
};

// Define component overrides correctly
const componentOverrides: ThemeOptions['components'] = {
  MuiButton: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        padding: '10px 20px',
      },
    },
  },
  MuiPaper: {
    styleOverrides: {
      root: {
        padding: '16px',
        borderRadius: 12,
      },
    },
  },
  MuiAppBar: {
    styleOverrides: {
      root: {
        boxShadow: 'none',
      },
    },
  },
};

// Create the light and dark themes using theme-based functions
export const lightTheme = createTheme({
  palette: lightPalette,
  typography,
  components: {
    ...componentOverrides,
  },
});

export const darkTheme = createTheme({
  palette: darkPalette,
  typography,
  components: {
    ...componentOverrides,
  },
});
