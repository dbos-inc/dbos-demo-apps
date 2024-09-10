import { NextRequest } from 'next/server';

import { placeApiRequest } from '@/app/components/backend';

export async function POST(request: NextRequest) {
  return await placeApiRequest(request, async (api, req, hdrs) => {
    return await api.doCompose({doComposeRequest: await req.json()}, hdrs);
  })
}