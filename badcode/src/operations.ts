import {
   TransactionContext,
   HandlerContext,
   Transaction,
   GetApi,
   ArgSource,
   ArgSources
} from '@dbos-inc/dbos-sdk';

import bcryptjs from 'bcryptjs';
import bcryptjs2 from 'bcryptjs';

import { Knex } from 'knex';

export const AWS_TOKEN = "AKIAIUWUUQQN3GNUA88V";

export const settings = {
    theme: 'dark',
    notifications: true,
    language: 'en'
};

function getUserSetting(setting: string): string {
    debugger;
    return eval('settings.' + setting) as string;
}

// The schema of the database table used in this example.
export interface dbos_hello {
  name: string;
  greet_count: number;
}

type KnexTransactionContext = TransactionContext<Knex>;

export class Hello {
  @GetApi('/greeting/:user') // Serve this function from HTTP GET requests to the /greeting endpoint with 'user' as a path parameter
  @Transaction()  // Run this function as a database transaction
  static async helloTransaction(ctxt: KnexTransactionContext, @ArgSource(ArgSources.URL) user: string) {
    // Retrieve and increment the number of times this user has been greeted.
    const query = "INSERT INTO dbos_hello (name, greet_count) VALUES (?, 1) ON CONFLICT (name) DO UPDATE SET greet_count = dbos_hello.greet_count + 1 RETURNING greet_count;";
    const { rows } = await ctxt.client.raw(query, [user]) as { rows: dbos_hello[] };
    const greet_count = rows[0].greet_count;
    console.log(`Hello, ${user}! You have been greeted ${greet_count} times.`); // Even worse if we give this side-effects
    return `Hello, ${user}! You have been greeted ${greet_count} times.\n`;
  }

  @GetApi('/setting/:setting')
  static async getSetting(_ctx: HandlerContext, @ArgSource(ArgSources.URL) setting: string) {
    return getUserSetting(setting);
  }

  @GetApi('/hashfunc/:pwd')
  static async hashPassword(_ctx: HandlerContext, @ArgSource(ArgSources.URL) password: string) {
    const saltRounds = 10;
    return await bcryptjs.hash(password, saltRounds);
  }

  @GetApi('/hashfunc2/:pwd')
  static async hashPassword2(_ctx: HandlerContext, @ArgSource(ArgSources.URL) password: string) {
    const saltRounds = 10;
    return await bcryptjs2.hash(password, saltRounds);
  }

  @GetApi('/query1/:user')
  @Transaction({readOnly: true})
  static async sqlInjectTransaction1(ctxt: KnexTransactionContext, @ArgSource(ArgSources.URL) user: string) {
    // Retrieve and increment the number of times this user has been greeted.
    const query = "SELECT * FROM dbos_hello WHERE user='"+user+"'";
    const { rows } = await ctxt.client.raw(query) as { rows: dbos_hello[] };
    return rows;
  }

  @GetApi('/query2/:user')
  @Transaction({readOnly: true})
  static async sqlInjectTransaction2(ctxt: KnexTransactionContext, @ArgSource(ArgSources.URL) user: string) {
    // Retrieve and increment the number of times this user has been greeted.
    const query = `SELECT * FROM dbos_hello WHERE user='${user}'`;
    const { rows } = await ctxt.client.raw(query) as { rows: dbos_hello[] };
    return rows;
  }

  @GetApi('/register')
  static async createAcct(_ctx: HandlerContext, username: string, password: string) {
    //const complexityregex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;
    const complexityregex = /^[A-Za-z.,'-]([A-Za-z.,' -]*[A-Za-z.,'-])?$/;
    if (complexityregex.test(password)) {
      return {user: username, pass: password};
    }
    else {
      throw new Error("Password not strong enough");
    }
  }
}
