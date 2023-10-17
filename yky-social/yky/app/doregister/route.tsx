import { NextResponse } from 'next/server';

import { getAPIServer } from '@/app/components/backend';

/*
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10kb',
    },
  },
}
*/

export async function POST(request: Request) {
  const res = await fetch(getAPIServer() + '/register', {
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
