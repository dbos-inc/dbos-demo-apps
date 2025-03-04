import { NextResponse } from 'next/server';

// NOTE: routes.ts has strange rules about imports, due to a "Collecting page data" compile step that is arguably broken.

export async function GET() {
  const { DBOSBored } = await import('@dbos/operations');
  const dbb = await DBOSBored.getActivity();
  return NextResponse.json(dbb);
}