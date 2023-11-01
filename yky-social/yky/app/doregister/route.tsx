import { NextRequest } from 'next/server';

import { placeApiRequest } from '@/app/components/backend';

/*
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10kb',
    },
  },
}
*/

export async function POST(request: NextRequest) {
  return await placeApiRequest(request, async (api, req) => {
    return await api.doRegister({doRegisterRequest: await req.json()});
  })
}
