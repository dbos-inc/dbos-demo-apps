import { TransactionContext, WorkflowContext, OperonTransaction, OperonWorkflow, GetApi, OrmEntities } from '@dbos-inc/operon';
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
  static async helloFunction (txnCtxt: TransactionContext, name: string)  {
    const greeting = `Hello, ${name}!`

    const p: EntityManager = txnCtxt.typeormEM as EntityManager;
    const g: OperonHello = new OperonHello();
    g.greeting = greeting;
    const res = await p.save(g);
    return `Greeting ${res.greeting_id}: ${greeting}`;
  };

  @OperonWorkflow()
  @GetApi('/greeting/:name')
  static async helloWorkflow(workflowCtxt: WorkflowContext, name: string) {
    // return await workflowCtxt.transaction(Hello.helloFunction, name);
    return await workflowCtxt.invoke(Hello).helloFunction(name);
  };

}