import React from 'react';
import { Metadata } from 'next';

import YKYSignup from '@/app/components/YKYSignup';

export const metadata: Metadata = {
    title: 'YKY Signup',
};

const Signup: React.FC = () => {
  return (
    <YKYSignup />
  );
};

export default Signup;