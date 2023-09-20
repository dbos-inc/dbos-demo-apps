import { NextResponse } from 'next/server';
import { getuserid } from '@/app/components/userid';
import { getAPIServer } from '@/app/components/backend';

export async function POST(request: Request) {
  console.log("Post!");

  const userid = getuserid();

  const res = await fetch(getAPIServer() + '/composepost'+'?' + new URLSearchParams({
    userid: userid,
  }),
  {
    method: 'POST',
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
