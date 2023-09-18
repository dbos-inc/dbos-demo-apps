import RecvTimeline from '@/app/components/RecvTimelineCR';

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

