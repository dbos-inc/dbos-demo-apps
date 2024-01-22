import { NextRequest } from 'next/server';
import { placeApiRequest } from '@/app/components/backend';

export async function GET(request: NextRequest) {
  return placeApiRequest(request, async (api, req, hdrs) => {
    return await api.sendTimeline(await req.json(), hdrs);
  });
}
