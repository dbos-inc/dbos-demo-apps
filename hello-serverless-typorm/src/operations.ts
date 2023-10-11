import { TransactionContext, WorkflowContext, OperonTransaction, GetApi, OrmEntities } from '@dbos-inc/operon';
import { Entity, EntityManager, PrimaryGeneratedColumn, Column } from "typeorm"

@Entity("operonhello")
export class OperonHello {
    @PrimaryGeneratedColumn()
    greeting_id: number = 0

    @Column()
    greeting: string = "greeting"
} 

@OrmEntities([OperonHello])
export class Hello {

  @OperonTransaction()
  static async helloTransaction (txnCtxt: TransactionContext<EntityManager>, name: string)  {
    const greeting = `Hello, ${name}!`

    const p: EntityManager = txnCtxt.client as EntityManager;
    const g: OperonHello = new OperonHello();
    g.greeting = greeting;
    const res = await p.save(g);
    return `Greeting ${res.greeting_id}: ${greeting}`;
  };

  @GetApi('/greeting/:name')
  static async helloWorkflow(workflowCtxt: WorkflowContext, name: string) {
    return await workflowCtxt.invoke(Hello).helloTransaction(name);
  };

}