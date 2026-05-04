import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Try Signal Bench',
  description:
    'Researching a flat-priced CRM alternative to HubSpot. Help shape what gets built.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-stone-50 font-sans text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
