import { NextResponse } from 'next/server';

import { getuserid } from '@/app/components/userid';
import { getAPIServer } from '@/app/components/backend';

export async function POST(request: Request) {
  const userid = getuserid();

  const { action,  targetuser} = (await request.json()) as {action: string, targetuser: string};

  if (action !== 'follow') {
    return NextResponse.json({error: "Invalid graph operation", status: 400});
  }

  const res = await fetch(getAPIServer()+'/follow'+'?' + new URLSearchParams({
    userid: userid,
  }),
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({followUid: targetuser}),
  });
 
  if (res.ok) {
    const data = res.json();
    return NextResponse.json(data);
  }
  else {
    return NextResponse.json({error: "Error", status:res.status});
  }
}
