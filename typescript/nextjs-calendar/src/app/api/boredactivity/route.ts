export const dynamic = "force-dynamic"; // ✅ Forces Next.js to treat it as a runtime-only API

import { NextResponse } from 'next/server';
import { DBOSBored  } from '@dbos/operations';

export async function GET() {
  const dbb = await DBOSBored.getActivity();
  return NextResponse.json(dbb);
}