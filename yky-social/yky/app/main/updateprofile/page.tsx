import YKYUpload from '@/app/components/YKYUpload';

import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'YKY Profile',
};

const UserHome: React.FC = () => (
  <div className="container mx-auto">
    <YKYUpload ultype='profile' title='Upload a profile picture'/>
  </div>
);

export default UserHome;