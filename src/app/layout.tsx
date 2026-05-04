import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'trysignalbench.com',
  description: 'Feedback site on CRM pricing pain points',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
