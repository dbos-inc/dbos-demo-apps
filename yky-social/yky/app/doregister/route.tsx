import { NextResponse } from 'next/server';

import { api, ResponseError } from '@/app/components/backend';

/*
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10kb',
    },
  },
}
*/

export async function POST(request: Request) {
  try {
    return NextResponse.json(await api.doRegister({doRegisterRequest: await request.json()}));
  }
  catch (err) {
    const e = err as ResponseError;
    return NextResponse.json({}, e.response);
  }
}
