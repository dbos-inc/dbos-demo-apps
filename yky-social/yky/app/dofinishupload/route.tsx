import { NextResponse, NextRequest } from 'next/server';
import { getuserid } from '@/app/components/userid';
import { getAPIServer } from '@/app/components/backend';

export async function POST(request: NextRequest) {
  console.log("Post!");

  const userid = getuserid();
  const rqwfid = request.nextUrl.searchParams.get('wfid');
  if (!rqwfid) {
    return NextResponse.json({error: "Workflow not specified"}, {status:400});
  }

  const res = await fetch(getAPIServer() + '/dofinishupload'+'?' + new URLSearchParams({
    userid: userid,
    wfid: rqwfid,
  }),
  {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(await request.json()),
  });
 
  if (res.ok) {
    const data = res.json();
    return NextResponse.json(data);
  }
  else {
    return NextResponse.json({error: "Error", status:res.status});
  }
}
