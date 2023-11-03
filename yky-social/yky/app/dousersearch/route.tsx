import { NextRequest, NextResponse } from 'next/server';

import { placeApiRequest } from '@/app/components/backend';

export async function GET(request: NextRequest) {
    const rqusername = request.nextUrl.searchParams.get('findUserName');
    if (!rqusername) {
      return NextResponse.json({}, {status:400, statusText: "Search term not specified"});
    }

    return placeApiRequest(request, async (api, req, hdrs) => {
      const data = await api.doFindUser({findUserName: rqusername}, hdrs);
      if (data.message === "User Found.") {
        return [data]; // Currently server returns 0 or 1
      }
      else {
        return [];
      }
    });
  }
