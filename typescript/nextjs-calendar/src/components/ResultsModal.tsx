'use client';

import DOMPurify from 'dompurify';

import { Dialog, DialogTitle, DialogContent, Typography } from '@mui/material';
import { Table, TableBody, TableCell, TableRow } from '@mui/material';
import { ResultsUIRecord } from '../types/models';
import React from 'react';

interface ResultDialogProps {
  open: boolean;
  onClose: () => void;
  result: ResultsUIRecord | null;
}

const ResultsModal: React.FC<ResultDialogProps> = ({ open, onClose, result }) => {
  if (!result) return null;

  const renderContent = () => {
    switch (result.result_type) {
      case 'json':
        try {
          const parsedJson = JSON.parse(result.result);
          if (typeof parsedJson === 'string' || typeof parsedJson === 'number') {
            return <Typography style={{ whiteSpace: 'pre-wrap' }}>{`${parsedJson}`}</Typography>
          }
          if (typeof parsedJson === 'object' && parsedJson !== null) {
            return (
              <Table>
                <TableBody>
                  {Object.entries(parsedJson).map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell><strong>{key}</strong></TableCell>
                      <TableCell>{JSON.stringify(value, null, 2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            );
          }
        } catch (_e) {
          return <Typography color="error">Invalid JSON</Typography>;
        }
        break;

      case 'html':
        return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(result.result) }} />;
      
      case 'text':
      default:
        return <Typography style={{ whiteSpace: 'pre-wrap' }}>{result.result}</Typography>;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Result: {result.name}</DialogTitle>
      <DialogContent>{renderContent()}</DialogContent>
    </Dialog>
  );
};

export default ResultsModal;
