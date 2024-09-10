import RecvTimeline from '@/app/components/RecvTimelineCR';

import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'YKY Inbox',
};

export default async function Page ({
    params,
    //searchParams
  } : {
      params: { id: string },
      //searchParams: { [key: string]: string | string[] | undefined }
  })
{
    const userId = params.id;

    return <RecvTimeline userid={userId} />;
}