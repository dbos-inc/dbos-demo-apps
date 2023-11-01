import { NextResponse, NextRequest } from 'next/server';
import { getuserid } from '@/app/components/userid';

import { api, ResponseError } from '@/app/components/backend';

export async function GET(_request: NextRequest) {
  const userid = getuserid();

  try {
    return NextResponse.json(await api.getProfilePhoto({
      headers: {'userid': userid}
    }));
  }
  catch (err) {
    const e = err as ResponseError;
    return NextResponse.json({}, e.response);
  }
}
