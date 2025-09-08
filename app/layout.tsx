import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LottoSmartPicker',
  description: 'Powerball / Mega Millions analysis & generator',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
