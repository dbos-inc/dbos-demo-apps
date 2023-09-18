import PostForm from '@/app/components/PostForm';

import { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'YKY Home',
};

const UserHome: React.FC = () => (
  <div className="container mx-auto">
    <PostForm />
  </div>
);

export default UserHome;