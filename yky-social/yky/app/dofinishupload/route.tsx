import { NextResponse, NextRequest } from 'next/server';
import { getuserid } from '@/app/components/userid';
import { getAPIServer } from '@/app/components/backend';

export async function GET(request: NextRequest) {
  const userid = getuserid();
  const rqwfid = request.nextUrl.searchParams.get('wfid');
  if (!rqwfid) {
    return NextResponse.json({error: "Workflow not specified"}, {status:400});
  }

  const res = await fetch(getAPIServer() + '/finishMediaUpload'+'?' + new URLSearchParams({
    userid: userid,
    wfid: rqwfid,
  }),
  {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
 
  if (res.ok) {
    const data = res.json();
    return NextResponse.json(data);
  }
  else {
    return NextResponse.json({error: "Error", status:res.status});
  }
}
