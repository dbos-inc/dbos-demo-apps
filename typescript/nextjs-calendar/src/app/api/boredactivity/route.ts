import { NextResponse } from 'next/server';

import { SchedulerAppGlobals  } from '@dbos/operations';

// NOTE: routes.ts has strange rules about imports, due to a "Collecting page data" compile step that is arguably broken.
//  For this reason, we will use `globalThis` to get access to the server code.

export async function GET() {
  const dbb = await (globalThis as SchedulerAppGlobals).DBOSBored!.getActivity();
  return NextResponse.json(dbb);
}