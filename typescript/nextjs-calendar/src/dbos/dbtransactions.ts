import { DBOS } from '@dbos-inc/dbos-sdk';

import { v4 as uuidv4 } from 'uuid';
import { ScheduleRecord, ResultsRecord } from '../types/models';

export class ScheduleDBOps
{
  @DBOS.transaction()
  static async addScheduleItem(task: string, start_time: Date, end_time: Date, repeat: string) {
    const newSchedule: ScheduleRecord = {
      id: uuidv4(),
      task: task,
      start_time: start_time.toISOString(),
      end_time: end_time.toISOString(),
      repeat,
    };

    await DBOS.knexClient<ScheduleRecord>('schedule').insert(newSchedule);

    return newSchedule;
  }

  @DBOS.transaction()
  static async updateScheduleItem(id: string, task: string, start_time: Date, end_time: Date, repeat: string) {
    await DBOS.knexClient<ScheduleRecord>('schedule')
      .where({ id })
      .update({
        task,
        start_time: start_time.toISOString(),
        end_time: end_time.toISOString(),
        repeat,  // New repetition rule
        updated_at: DBOS.knexClient.fn.now(),
      });
  }

  @DBOS.transaction()
  static async deleteScheduleItem(id: string) {
    await DBOS.knexClient<ScheduleRecord>('schedule')
      .where({id})
      .del();
  }

  @DBOS.transaction()
  static async setResult(schedule_id: string, task: string, time: Date, result: string) {
    const taskResult: ResultsRecord = {
      schedule_id,
      task,
      run_time: time.toISOString(),
      result,
    };
    
    await DBOS.knexClient<ResultsRecord>('results').insert(taskResult);
  }

  @DBOS.transaction({readOnly: true})
  static async getSchedule() {
    return await DBOS.knexClient<ScheduleRecord>('schedule').select();
  }

  @DBOS.transaction({readOnly: true})
  static async getResultsOverTime(startDate: Date, endDate: Date) {
    return await DBOS.knexClient<ResultsRecord>('results')
      .whereBetween('run_time', [startDate, endDate])
      .select();
  }

  @DBOS.transaction({readOnly: true})
  static async getResultsForItem(schedule_id: string) {
    return await DBOS.knexClient<ResultsRecord>('results')
      .where({schedule_id})
      .select();
  }
}