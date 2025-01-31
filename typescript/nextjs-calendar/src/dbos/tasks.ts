import { DBOS } from '@dbos-inc/dbos-sdk';

// Here are some tasks for scheduling in the online calendar...
export interface CalendarTask {
  id: string;
  name: string;
  url: string;
  dataPath?: string;
  type: 'json' | 'text' | 'html';
}

export const schedulableTasks: CalendarTask[] = [
  {
    id: 'fetch_time',
    name: 'Fetch Current Time',
    url: 'http://worldtimeapi.org/api/timezone/Etc/UTC',
    dataPath: 'datetime',
    type: 'json',
  },
  {
    id: 'fetch_weather',
    name: 'Fetch Weather Data (New York)',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&current_weather=true',
    dataPath: 'current_weather',
    type: 'json',
  },
  {
    id: 'check_cloud_status',
    name: 'Make Sure Cloud Is Up',
    url: 'https://demo-guestbook.cloud.dbos.dev/',
    type: 'text',
  },
  {
    id: 'fetch_joke',
    name: 'Fetch Random Joke',
    url: 'https://official-joke-api.appspot.com/random_joke',
    type: 'json',
  },
  {
    id: 'fetch_activity_boredapi',
    name: 'Stave Off Boredom',
    url: 'https://www.boredapi.com/api/activity',
    type: 'html',
  },
  {
    id: 'fetch_activity_dbos',
    name: 'Stave Off Boredom (DBOS)',
    url: 'http://localhost:3000/api/boredactivity',
    type: 'json',
  },
  {
    id: 'throw_error',
    name: 'Impossible Task',
    url: 'http://example.invalid',
    type: 'html',
  },
];

export async function doTaskFetch(id: string): Promise<string> {
  const task = schedulableTasks.find(t => t.id === id);

  if (!task) {
    throw new Error('Invalid task');
  }

  try {
    const response = await fetch(task.url);
    if (task.type === 'text' || task.type === 'html') {
      return await response.text();
    }

    let data = await response.json();

    // Subset it, if required.  (Simple implementation...)
    if (task.dataPath) {
      if (!(task.dataPath in data)) {
        throw new Error(`Key ${task.dataPath} not found in response to task ${task.name}`);
      }

      data = data[task.dataPath];
    }

    return JSON.stringify(data);
  } catch (e) {
    DBOS.logger.error(`Error running task ${task.id}: ${e}`);
    throw e;
  }
};

export async function testTasks() {
  for (const t of schedulableTasks) {
    console.log(`${t.id}: ${await doTaskFetch(t.id)}`);
  }
}

