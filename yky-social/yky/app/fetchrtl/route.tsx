import { NextRequest, NextResponse } from 'next/server';

import { getuserid } from '@/app/components/userid';
import { getAPIServer } from '@/app/components/backend';

export async function GET(request: NextRequest) {
    const userid = getuserid();
    let rquserid = request.nextUrl.searchParams.get('rqtimeline');
    if (!rquserid || rquserid === 'default') {
      rquserid = userid;
    }

    console.log("Fetch recv timeline for "+rquserid);

    const res = await fetch(getAPIServer()+'/recvtimeline'+'?' + new URLSearchParams({
        userid: userid,
        rqtimeline: rquserid,
      }),
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
   
    if (res.ok) {
      const data = await res.json();
      const nres = NextResponse.json(data);
      return nres;
    }
    else {
      // TODO Better message?
      console.log(" ... bad");
      return NextResponse.json({ error: "Error" }, { status:res.status });
    }
}
