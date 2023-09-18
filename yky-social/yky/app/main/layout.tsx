// components/Layout.tsx
import React from 'react';
import YKYTopNav from '@/app/components/YKYTopNav';
import YKYContextProviders from '@/app/components/YKYContext';

export default function MainLayout({
    children, // will be a page or nested layout
  }: {
    children: React.ReactNode
  }) {
  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <YKYContextProviders>
        <YKYTopNav/>
        <main>
          {children}
        </main>
      </YKYContextProviders>
    </div>
  );
}