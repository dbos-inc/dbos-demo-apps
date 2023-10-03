import PostForm from '@/app/components/PostForm';

import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'YKY Home',
};

const UserHome: React.FC = () => (
  <div className="container mx-auto">
    <Link href="/main/updateprofile">Update Profile</Link>
    <PostForm />
  </div>
);

export default UserHome;