import React from 'react';
import { Metadata } from 'next';

import YKYLogin from '@/app/components/YKYLogin';

export const metadata: Metadata = {
    title: 'YKY Login',
};

const LoginPage: React.FC = () => {
  return (
    <YKYLogin regurl='/main/signup' />
  );
};

export default LoginPage;
