import { NextResponse } from "next/server";
import { DBOS } from "@dbos-inc/dbos-sdk";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
    const taskId = (await params).slug;
    const step = await DBOS.getEvent(taskId, "steps_event");
    DBOS.logger.info(`For taskId: ${taskId} we are done with ${step} steps`);  
    return new NextResponse(String(step !== null ? step : 0), { status: 200 });
}