import { NextRequest, NextResponse } from 'next/server';

import { placeApiRequest } from '@/app/components/backend';

export async function GET(request: NextRequest) {
  const rqwfid = request.nextUrl.searchParams.get('wfid');
  if (!rqwfid) {
    return NextResponse.json({}, {status:400, statusText: "Workflow not specified."});
  }

  return await placeApiRequest(request, async (api, _req, hdrs) => {
    return await api.finishMediaUpload({wfid: rqwfid}, hdrs);
  })
}
