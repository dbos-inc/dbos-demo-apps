import YKYUpload from '@/app/components/YKYUpload';

import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'YKY Profile',
};

const UserHome: React.FC = () => (
  <YKYUpload ultype='profile' title='Upload a profile picture'/>
);

export default UserHome;