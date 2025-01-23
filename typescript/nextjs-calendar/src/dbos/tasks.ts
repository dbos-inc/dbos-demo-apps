import { DBOS } from '@dbos-inc/dbos-sdk';

// Here are some tasks for scheduling in the online calendar...
export interface CalendarTask {
  id: string;
  name: string;
  url: string;
  dataPath?: string;
}

export const schedulableTasks: CalendarTask[] = [
  {
    id: 'fetch_nist_time',
    name: 'Fetch Current Time',
    url: 'http://worldtimeapi.org/api/timezone/Etc/UTC',
  },
  {
    id: 'fetch_weather',
    name: 'Fetch Weather Data (New York)',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&current_weather=true',
    dataPath: 'current_weather',
  },
  {
    id: 'fetch_joke',
    name: 'Fetch Random Joke',
    url: 'https://official-joke-api.appspot.com/random_joke',
  },
  {
    id: 'fetch_activity',
    name: 'Stave Off Boredom',
    url: 'https://www.boredapi.com/api/activity',
  }
];

export async function doTaskFetch(id: string): Promise<string> {
  const task = schedulableTasks.find(t => t.id === id);

  if (!task) {
    throw new Error('Invalid task');
  }

  try {
    const response = await fetch(task.url);
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

