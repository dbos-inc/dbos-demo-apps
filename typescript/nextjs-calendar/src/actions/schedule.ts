'use server';

import { ScheduleDBOps, SchedulerOps } from '@dbos/operations';
import { schedulableTasks } from '@dbos/tasks';
import { ScheduleUIRecord, ResultsUIRecord } from '@/types/models';

// Fetch all schedule items
export async function fetchSchedules(): Promise<ScheduleUIRecord[]> {
  const sched = await ScheduleDBOps.getSchedule() as ScheduleUIRecord[];
  for (const s of sched) {
    s.name = schedulableTasks.find(t => t.id === s.task)?.name ?? '<UNKNOWN>';
  }
  return sched as ScheduleUIRecord[];
}

// Fetch results within a date range
export async function fetchResults(startDate: Date, endDate: Date): Promise<ResultsUIRecord[]> {
  const res = await ScheduleDBOps.getResultsOverTime(startDate, endDate) as ResultsUIRecord[];
  for (const r of res) {
    const t = schedulableTasks.find(t => t.id === r.task);
    r.name = t?.name ?? '<UNKNOWN>'; 
    r.result_type = t?.type ?? 'string';
  }
  return res;
}

// Add a new schedule item
export async function addSchedule(task: string, start: Date, end: Date, repeat: string) {
  const res = await ScheduleDBOps.addScheduleItem(task, start, end, repeat);
  // Tell attached clients
  SchedulerOps.notifyListeners('schedule');
  return res;
}

// Update a schedule item
export async function updateSchedule(id: string, start: Date, end: Date, repeat: string) {
  const res = await ScheduleDBOps.updateScheduleItem(id, start, end, repeat);
  // Tell attached clients
  SchedulerOps.notifyListeners('schedule');
  return res;
}

// Delete a schedule item
export async function deleteSchedule(id: string) {
  const res = await ScheduleDBOps.deleteScheduleItem(id);
  // Tell attached clients
  SchedulerOps.notifyListeners('schedule');
  return res;
}

// Get possible tasks
export async function getAllTasks() {
  return Promise.resolve(SchedulerOps.getAllTasks());
}

export async function runTaskTest(task: string) {
  return await SchedulerOps.runTask(task);
}

export async function runScheduleTest(sched: string, task: string) {
  return await SchedulerOps.runJob(sched, task, new Date());
}