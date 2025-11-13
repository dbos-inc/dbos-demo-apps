import { DBOS } from '@dbos-inc/dbos-sdk';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  async stepOne() {
    console.log('Step one completed!');
    return Promise.resolve();
  }

  async stepTwo() {
    console.log('Step two completed!');
    return Promise.resolve();
  }

  async workflow() {
    await DBOS.runStep(() => this.stepOne(), { name: 'stepOne' });
    await DBOS.runStep(() => this.stepTwo(), { name: 'stepTwo' });
    return 'Hello World!';
  }
}
