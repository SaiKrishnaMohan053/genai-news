import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'GenAI News',
  description: 'Controlled multi-agent news application',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: Readonly<RootLayoutProps>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
