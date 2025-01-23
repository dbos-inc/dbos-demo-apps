'use server';

import { ScheduleDBOps, SchedulerOps } from '@/dbos/operations';
import { ScheduleRecord, ResultsRecord } from '@/types/models';

// Fetch all schedule items
export async function fetchSchedules(): Promise<ScheduleRecord[]> {
  return await ScheduleDBOps.getSchedule();
}

// Fetch results within a date range
export async function fetchResults(startDate: string, endDate: string): Promise<ResultsRecord[]> {
  return await ScheduleDBOps.getResultsOverTime(new Date(startDate), new Date(endDate));
}

// Add a new schedule item
export async function addSchedule(task: string, start: Date, end: Date, repeat: string) {
  return await ScheduleDBOps.addScheduleItem(task, start, end, repeat);
}

// Delete a schedule item
export async function deleteSchedule(id: string) {
  return await ScheduleDBOps.deleteScheduleItem(id);
}

// Get possible tasks
export async function getAllTasks() {
  return Promise.resolve(SchedulerOps.getAllTasks());
}