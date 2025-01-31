import { dbosBored } from '@/actions/bored';
import { NextResponse } from 'next/server';

export async function GET() {
  const dbb = await dbosBored();
  console.log(`Hey we called GET: ${JSON.stringify(dbb)}`);
  return NextResponse.json(dbb);
}