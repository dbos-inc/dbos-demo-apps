import { NextResponse } from 'next/server';

import { api } from '@/app/components/backend';

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
  // TODO:  1. What if it throws?  I assume I get an error coming to the client, we'll see
  // TODO:  2. Can I use the type of the request / return in the front end?
  return NextResponse.json(await api.doRegister({doRegisterRequest: await request.json()}));
}
