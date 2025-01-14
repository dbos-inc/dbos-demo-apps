import { NextResponse } from "next/server";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { dbosWorkflowClass } from "@/dbos/operations";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string[] }> }) {
    const slugs = (await params).slug;
    if (slugs.length !== 2) {
        return new NextResponse("Invalid parameters", { status: 400});
    }
    const taskID = slugs[0];
    const steps = parseInt(slugs[1]);
    await DBOS.startWorkflow(dbosWorkflowClass, {workflowID: taskID}).backgroundTask(steps);
    return NextResponse.json({ message: "Background task started" });

}

