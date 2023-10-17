import { NextResponse, NextRequest } from 'next/server';
import { getuserid } from '@/app/components/userid';
import { getAPIServer } from '@/app/components/backend';

export async function GET(request: NextRequest) {
  const userid = getuserid();

  const res = await fetch(getAPIServer() + '/getProfilePhoto'+'?' + new URLSearchParams({
    userid: userid,
  }),
  {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
 
  if (res.ok) {
    const data = await res.json();
    return NextResponse.json(data);
  }
  else {
    return NextResponse.json({error: "Error", status:res.status});
  }
}
