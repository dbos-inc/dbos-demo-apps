import { DBOS } from '@dbos-inc/dbos-sdk';
import { activities, Activity } from '../bored/db/activities';

import { DBOSKoa } from '@dbos-inc/koa-serve';

export const dkoa = new DBOSKoa();

export class DBOSBored {
  @DBOS.workflow()
  static async getActivity() : Promise<Activity> {
    const choice = await DBOS.runStep(() => {
      return Promise.resolve(Math.floor(Math.random() * activities.length));
    }, {name: 'chooseActivity'});
    return activities[choice];
  }

  @dkoa.getApi('/dbos/boredapi/activity')
  static async boredAPIActivity() {
    return await DBOSBored.getActivity();
  }
}