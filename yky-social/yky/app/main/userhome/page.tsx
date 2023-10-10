import PostForm from '@/app/components/PostForm';
import YKYProfilePhoto from '@/app/components/YKYProfilePhoto';

import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'YKY Home',
};

const UserHome: React.FC = () => {
  return (
  <div className="flex-grow flex flex-col items-center justify-center">
    <YKYProfilePhoto/>
    <Link href="/main/updateprofile" className="block mt-4 lg:inline-block lg:mt-0 text-cyan-700 hover:text-cyan-400 mr-4">Update Profile</Link>
    <PostForm />
  </div>
  );
};

export default UserHome;