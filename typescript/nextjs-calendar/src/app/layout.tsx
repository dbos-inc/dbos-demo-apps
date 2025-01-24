import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Next Schedule App with DBOS",
  description: "Schedule Tasks and View Results of Scheduled Tasks",
};

import ThemeWrapper from './ThemeWrapper';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeWrapper>
          {children}
        </ThemeWrapper>
      </body>
    </html>
  );
}
