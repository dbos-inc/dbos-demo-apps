//import React from 'react';
import SendTimeline from '@/app/components/SendTimelineCR';

export default async function Page ({
    params,
    //searchParams
  } : {
      params: { id: string },
      //searchParams: { [key: string]: string | string[] | undefined }
  })
{
    const userId = params.id;

    return <SendTimeline userid={userId} />;
}

