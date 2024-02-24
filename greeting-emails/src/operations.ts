import {
    TransactionContext, Transaction,
    HandlerContext, GetApi,
    CommunicatorContext, Communicator,
    WorkflowContext, Workflow,
} from "@dbos-inc/dbos-sdk";
import { Knex } from "knex";

export class Greetings {
    @Communicator()
    static async SendGreetingEmail(ctxt: CommunicatorContext) {
        ctxt.logger.info("Sending Email...");
        // Code omitted for simplicity
        ctxt.logger.info("Email sent!");
        await new Promise((resolve) => resolve("Email sent!"));
    }

    @Transaction()
    static async InsertGreeting(ctxt: TransactionContext<Knex>, friend: string, content: string) {
        await ctxt.client.raw(
            "INSERT INTO dbos_hello (name, greeting_note_content) VALUES (?, ?)",
            [friend, content]
        );
    }

    @Workflow()
    static async SendGreetingNoteWorkflow(ctxt: WorkflowContext, friend: string) {
        const noteContent = `Thank you for being awesome, ${friend}!`;
        await ctxt.invoke(Greetings).SendGreetingEmail();

        for (let i = 0; i < 5; i++) {
            ctxt.logger.info(
                "Press control + C to interrupt the workflow..."
            );
            await ctxt.sleep(1);
        }

        await ctxt.invoke(Greetings).InsertGreeting(friend, noteContent);
        ctxt.logger.info("Workflow done!");
        return noteContent;
    }

    @GetApi("/greeting/:friend")
    static async Greet(ctxt: HandlerContext, friend: string) {
        const workflow_handle = await ctxt.invoke(Greetings).SendGreetingNoteWorkflow(friend);
        return await workflow_handle.getResult();
    }
}
