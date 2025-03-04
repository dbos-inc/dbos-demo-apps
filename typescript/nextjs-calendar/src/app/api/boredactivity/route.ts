import { NextResponse } from 'next/server';

import { SchedulerAppGlobals  } from '@dbos/operations';

// NOTE: routes.ts has strange rules about imports, due to a "Collecting page data" compile step that is arguably broken.

export async function GET() {
  const dbb = await (globalThis as SchedulerAppGlobals).DBOSBored!.getActivity();
  return NextResponse.json(dbb);
}