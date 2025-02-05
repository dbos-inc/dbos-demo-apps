import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';

export default function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Welcome to the DBOS Task Scheduler</DialogTitle>
      <DialogContent>
        <p>This app is a UI that allows you to schedule DBOS workflows and see the results.  The DBOS server will make sure the scheduled tasks get executed.</p>
        <p>Here&rsquo;s how to use this app:</p>
        <ul>
          <li><strong>Add New Tasks:</strong> Click on a free spot on the calendar to schedule a task.</li>
            <ul>
              <li><strong>Task:</strong> Pick a task from the avaiable choices.</li>
              <li><strong>Start Time:</strong> Pick a time for the task to be performed.  If this will be a recurring task, this is the time for the first occurrence.</li>
              <li><strong>For Recurring Tasks:</strong> Pick an &quot;End Time&quot;, and set the task &quot;Repetition&quot; to daily, weekly, or monthly, rather than none.</li>
            </ul>
          <li><strong>Edit/Delete Tasks:</strong> Click on a scheduled task item to edit or delete it.  You can also run a &rsquo;Test&rsquo; of the scheduled item from this dialog.</li>
          <li><strong>View Results:</strong> Click on result and error items on the calendar see execution results.</li>
          <li><strong>Navigation:</strong> Use the month/week/day selector to change views.</li>
        </ul>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">Got it!</Button>
      </DialogActions>
    </Dialog>
  );
}