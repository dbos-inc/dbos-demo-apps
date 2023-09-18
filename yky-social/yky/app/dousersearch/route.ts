import { NextRequest, NextResponse } from 'next/server';

import { getuserid } from '@/app/components/userid';
import { getAPIServer } from '@/app/components/backend';

export async function GET(request: NextRequest) {
    const userid = getuserid();
    const rqusername = request.nextUrl.searchParams.get('findUserName');
    if (!rqusername) {
        return NextResponse.json({error: "Search term not specified"}, {status:400});
    }

    console.log("Fetch user for "+rqusername);

    const res = await fetch(getAPIServer()+'/finduser'+'?' + new URLSearchParams({
        userid: userid,
        findUserName: rqusername,
      }),
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
   
    if (res.ok) {
      const data = await res.json();
      console.log(data);
      if (data.message === "User Found.") {
          const nres = NextResponse.json([data]); // Currently server returns 0 or 1
          return nres;
      }
      else return NextResponse.json([]);
    }
    else {
      // TODO Better message?
      console.log(" ... bad");
      return NextResponse.json({ error: "Error" }, { status:res.status });
    }
}
