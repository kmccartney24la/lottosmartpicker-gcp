import './globals.css';
import { Rubik } from 'next/font/google';
import type { Metadata } from 'next';

const rubik = Rubik({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const revalidate = 300; // 5 minutes for all routes under this layout

export const dynamic = 'force-static'; // default for SSG; safe to include

export const metadata: Metadata = {
  title: 'LottoSmartPicker',
  description: 'Powerball / Mega Millions analysis & generator',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={rubik.variable}>
        {children}
      </body>
    </html>
  );
}
