import { NextRequest } from 'next/server';

import { placeApiRequest } from '@/app/components/backend';

export async function GET(request: NextRequest) {
  return await placeApiRequest(request, async (api, _req, hdrs) => {
    return await api.doStartMediaUpload(hdrs);
  })
}
