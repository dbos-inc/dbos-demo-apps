import {
  addDays,
  addWeeks,
  addMonths,
  isAfter,
  isBefore,
  isEqual,
  isWithinInterval,
  startOfMinute,
  endOfMinute
} from 'date-fns';

import { ScheduleRecord } from '@/types/models';

/**
 * Generate all occurrences of a schedule item within a given date range.
 * @param schedule - The schedule item definition
 * @param from - The start date for the range to check
 * @param to - The end date for the range to check
 * @returns Array of Date objects representing occurrence start times
 */
export function getOccurrences(schedule: ScheduleRecord, from: Date, to: Date): Date[] {
  const occurrences: Date[] = [];
  let current = new Date(schedule.start_time);
  const endTime = new Date(schedule.end_time);

  while (isBefore(current, to) || isEqual(current, to)) {
    // Stop adding occurrences if current time exceeds end_time
    if (isAfter(current, endTime)) {
      break;
    }

    if (isWithinInterval(current, { start: from, end: to })) {
      occurrences.push(current);
    }

    // Determine the next occurrence based on the repetition rule
    switch (schedule.repeat) {
      case 'daily':
        current = addDays(current, 1);
        break;
      case 'weekly':
        current = addWeeks(current, 1);
        break;
      case 'monthly':
        current = addMonths(current, 1);
        break;
      case 'none':
      default:
        // If no repeat, break the loop after the first occurrence
        return occurrences;
    }
  }

  return occurrences;
}
/**
 * Check if an occurrence exists within a specific minute.
 * @param schedule - The schedule item definition
 * @param minute - The minute to check for an occurrence
 * @returns Boolean indicating if an occurrence exists
 */
export function getOccurrencesAt(schedule: ScheduleRecord, minute: Date) {
  const occurrences = getOccurrences(schedule, startOfMinute(minute), endOfMinute(minute));
  return occurrences;
}
