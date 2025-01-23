import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next Schedule App with DBOS",
  description: "Schedule Tasks and View Results of Scheduled Tasks",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <h1>Task Scheduler</h1>
        </header>
        <main>{children}</main>
        <footer>
          <p>Visit <a href="dbos.dev">DBOS</a></p>
        </footer>
      </body>
    </html>
  );
}