import { TransactionContext, HandlerContext, Transaction, GetApi, OrmEntities, DBOSDeploy, InitContext } from '@dbos-inc/dbos-sdk';
import { Entity, EntityManager, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity("dboshello")
export class DBOSHello {
    @PrimaryGeneratedColumn()
    greeting_id: number = 0;

    @Column()
    greeting: string = "greeting";
} 

@OrmEntities([DBOSHello])
export class Hello {

  @Transaction()
  static async helloTransaction (txnCtxt: TransactionContext<EntityManager>, name: string)  {
    const greeting = `Hello, ${name}!`;

    const p: EntityManager = txnCtxt.client as EntityManager;
    const g: DBOSHello = new DBOSHello();
    g.greeting = greeting;
    const res = await p.save(g);
    return `Greeting ${res.greeting_id}: ${greeting}`;
  }

  @GetApi('/greeting/:name')
  static async helloHandler(handlerCtxt: HandlerContext, name: string) {
    return handlerCtxt.invoke(Hello).helloTransaction(name);
  }

  @DBOSDeploy()
  static async setUpSchema(ctx: InitContext) {
    await ctx.createUserSchema();
  }
}
