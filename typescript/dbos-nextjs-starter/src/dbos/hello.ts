import { DBOS } from "@dbos-inc/dbos-sdk";

export class helloWorkflowClass {

    @DBOS.transaction()
    static async helloDBOS(userName: string) {
        DBOS.logger.info("Hello from DBOS Transaction!");
        const greeting = `Hello! You have been greeted ${userName} times.`;
        return greeting;
    }

}