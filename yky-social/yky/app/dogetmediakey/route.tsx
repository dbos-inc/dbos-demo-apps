import { NextResponse, NextRequest } from 'next/server';
import { getuserid } from '@/app/components/userid';

import { placeApiRequest } from '@/app/components/backend';

export async function GET(request: NextRequest) {
  const userid = getuserid();

  return await placeApiRequest(request, async (api, req, hdrs) => {
    return await api.getProfilePhoto(hdrs);
  })
}
