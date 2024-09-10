import { NextRequest } from 'next/server';

import { placeApiRequest } from '@/app/components/backend';
import { DoFollowRequest } from '../components/client';

export async function POST(request: NextRequest) {
  return await placeApiRequest(request, async (api, req, hdrs) => {
    const dfr : DoFollowRequest = await req.json();
    return await api.doFollow({doFollowRequest: dfr}, hdrs);
  });
}
