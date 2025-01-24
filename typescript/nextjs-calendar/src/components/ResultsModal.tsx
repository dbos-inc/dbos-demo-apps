'use client';

import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@mui/material';
import { ResultsRecord } from '../types/models';

type Props = {
  result: ResultsRecord | null;
  onClose: () => void;
};

export default function ResultsModal({ result, onClose }: Props) {
  if (!result) return null;

  return (
    <Dialog open={!!result} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Task Execution Result</DialogTitle>
      <DialogContent>
        <Typography variant="body1">
          <strong>Run Time:</strong> {new Date(result.run_time).toLocaleString()}
        </Typography>
        <Typography variant="body1" sx={{ mt: 2 }}>
          <strong>Result:</strong>
        </Typography>
        <Typography 
          variant="body2" 
          sx={{ bgcolor: 'grey.100', p: 2, borderRadius: 1, fontFamily: 'monospace' }}
        >
          {JSON.stringify(JSON.parse(result.result), null, 2)}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
