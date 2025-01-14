"use server";

import { DBOS } from "@dbos-inc/dbos-sdk";

export async function lastStep(taskID: string) {
    const step = await DBOS.getEvent(taskID, "steps_event");
    DBOS.logger.info(`For taskId: ${taskID} we are done with ${step} steps`);
    return String(step !== null ? step : 0);
}