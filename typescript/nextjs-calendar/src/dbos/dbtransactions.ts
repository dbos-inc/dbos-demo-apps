import { v4 as uuidv4 } from 'uuid';
import { ScheduleRecord, ResultsRecord } from '../types/models';

import { KnexDataSource } from '@dbos-inc/knex-datasource';
import { ClientBase, Pool, PoolClient } from 'pg';

import { DBTrigger } from '@dbos-inc/pgnotifier-receiver';

const config = process.env.DBOS_DATABASE_URL 
? { connection: process.env.DBOS_DATABASE_URL }
: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'dbos_next_calendar',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'dbos',
};

const pool = new Pool(config);

export const trig = new DBTrigger({
  connect: async () => {
    const conn = pool.connect();
    return conn;
  },
  disconnect: async (c: ClientBase) => {
    (c as PoolClient).release();
    return Promise.resolve();
  },
  query: async <R>(sql: string, params?: unknown[]) => {
    return (await pool.query(sql, params)).rows as R[];
  },
});

const kconfig = {
  client: 'pg',
  connection: config,
};

const knexds = new KnexDataSource('app-db', kconfig);

export class ScheduleDBOps
{
  @knexds.transaction()
  static async addScheduleItem(task: string, start_time: Date, end_time: Date, repeat: string) {
    const newSchedule: ScheduleRecord = {
      id: uuidv4(),
      task: task,
      start_time: start_time.toISOString(),
      end_time: end_time.toISOString(),
      repeat,
    };

    await knexds.client<ScheduleRecord>('schedule').insert(newSchedule);

    return newSchedule;
  }

  @knexds.transaction()
  static async updateScheduleItem(id: string, start_time: Date, end_time: Date, repeat: string) {
    await knexds.client<ScheduleRecord>('schedule')
      .where({ id })
      .update({
        // Task should not be updated.  Make a new one.
        start_time: start_time.toISOString(),
        end_time: end_time.toISOString(),
        repeat,
        updated_at: knexds.client.fn.now(),
      });
  }

  @knexds.transaction()
  static async deleteScheduleItem(id: string) {
    await knexds.client<ScheduleRecord>('schedule')
      .where({id})
      .del();
  }

  @knexds.transaction()
  static async setResult(schedule_id: string, task: string, time: Date, result: string, error: string) {
    const taskResult: ResultsRecord = {
      schedule_id,
      task,
      run_time: time.toISOString(),
      result,
      error,
    };
    
    await knexds.client<ResultsRecord>('results').insert(taskResult);
  }

  @knexds.transaction({readOnly: true})
  static async getSchedule() {
    return await knexds.client<ScheduleRecord>('schedule').select();
  }

  @knexds.transaction({readOnly: true})
  static async getResultsOverTime(startDate: Date, endDate: Date) {
    return await knexds.client<ResultsRecord>('results')
      .whereBetween('run_time', [startDate, endDate])
      .select();
  }

  @knexds.transaction({readOnly: true})
  static async getResultsForItem(schedule_id: string) {
    return await knexds.client<ResultsRecord>('results')
      .where({schedule_id})
      .select();
  }
}