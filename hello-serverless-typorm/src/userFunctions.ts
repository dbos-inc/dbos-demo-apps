import { TransactionContext, WorkflowContext, OperonTransaction, OperonWorkflow, GetApi, OrmEntities } from 'operon';
import { Entity, EntityManager, PrimaryGeneratedColumn, Column } from "typeorm"
// import { OperonHello } from './OperonHello'

@Entity()
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

    const p: EntityManager = txnCtxt.typeormEM as EntityManager ;
    const g: OperonHello = new OperonHello();
    g.greeting = greeting;
    console.log("In hello function " + __dirname);
    const res = await p.save(g);

    console.log(res);

    // const { rows } = await txnCtxt.pgClient.query("INSERT INTO OperonHello(greeting) VALUES ($1) RETURNING greeting_id", [greeting])
    return `Greeting ${res.greeting_id}: ${greeting}`;
  };

  @OperonWorkflow()
  @GetApi('/greeting/:name')
  static async helloWorkflow(workflowCtxt: WorkflowContext, name: string) {

    console.log("received http request " +name)

    if (check(OperonHello, "EntitySchema")) {
      console.log("Valid entity");
    } else {
      console.log("Not Valid entity");
    }

    return await workflowCtxt.transaction(Hello.helloFunction, name);
  };

}

function check(obj: unknown, name: string) {

  if (typeof obj === "object") {
    console.log("It is an object");
  } else {
    console.log("It is not an object");
  }
  console.log(Symbol.for(name));
  const v = obj as { "@instanceof": Symbol };
  console.log(v);
  console.log(v["@instanceof"]);

  return (
      typeof obj === "object" &&
      obj !== null &&
      (obj as { "@instanceof": Symbol })["@instanceof"] ===
          Symbol.for(name)
  )
}



