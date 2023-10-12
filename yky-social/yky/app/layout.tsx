import './globals.css';

import { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | YKY',
    default: 'YKY', // a default is required when creating a template
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
