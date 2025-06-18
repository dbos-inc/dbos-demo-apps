import { DBOS } from '@dbos-inc/dbos-sdk';
import { activities, Activity } from '../bored/db/activities';

export class DBOSBored {
  @DBOS.workflow()
  static async getActivity() : Promise<Activity> {
    const choice = await DBOS.runStep(() => {
      return Promise.resolve(Math.floor(Math.random() * activities.length));
    }, {name: 'chooseActivity'});
    return activities[choice];
  }

  @DBOS.getApi('/dbos/boredapi/activity')
  static async boredAPIActivity() {
    return await DBOSBored.getActivity();
  }
}