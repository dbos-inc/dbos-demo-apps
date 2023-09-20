import Link from 'next/link';
import { Metadata } from 'next';

import SendTimeline from '@/app/components/SendTimelineCR';

export const metadata: Metadata = {
    title: 'YKY Sent Messages',
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

    return (
       <div className="container mx-auto px-4 py-8">
          <Link href='/main/userhome'
            className={
                (false ? 'bg-gray-500 cursor-not-allowed text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline' 
                                    : 'bg-cyan-700 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline')
            }
          >
          Compose
          </Link>

         <SendTimeline userid={userId} />
       </div>
    );
}