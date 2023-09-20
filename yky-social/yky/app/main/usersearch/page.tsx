import UserSearch from '@/app/components/UserSearch';

import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'YKY User Search',
};

export default async function Page ()
{
    return <UserSearch/>;
}

