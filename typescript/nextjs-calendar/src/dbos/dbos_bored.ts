import { DBOS } from '@dbos-inc/dbos-sdk';
import { DBOSRandom } from "@dbos-inc/dbos-random";
import { activities, Activity } from '@/bored/db/activities';

export class DBOSBored {
  @DBOS.workflow()
  static async getActivity() : Promise<Activity> {
    const choice = Math.floor(await DBOSRandom.random() * activities.length);
    return activities[choice];
  }

  @DBOS.getApi('/dbos/boredapi/activity')
  static async boredAPIActivity() {
    return await DBOSBored.getActivity();
  }
}