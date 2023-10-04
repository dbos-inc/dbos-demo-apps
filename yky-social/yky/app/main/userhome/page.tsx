import PostForm from '@/app/components/PostForm';
import YKYProfilePhoto from '@/app/components/YKYProfilePhoto';

import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'YKY Home',
};

const UserHome: React.FC = () => {
  return (
  <div className="container mx-auto">
    <YKYProfilePhoto/>
    <Link href="/main/updateprofile">Update Profile</Link>
    <PostForm />
  </div>
  );
};

export default UserHome;