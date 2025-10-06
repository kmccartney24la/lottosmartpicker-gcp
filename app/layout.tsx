// app/layout.tsx
// Layered global styles (order matters):
// 1) tokens → 2) themes → 3) layered globals
import './styles/tokens.css';
import './styles/themes.css';
import './styles/globals.css';
// Route-scoped page CSS, safely imported once (selectors are page-scoped)
import './scratchers/scratchers.css';
import './page.css';
// Global drawer/sidebar styles used by Past Draws, etc.
import './styles/sidebar.css';
import { Rubik } from 'next/font/google';
import type { Metadata } from 'next';
import FooterLegal from 'src/components/FooterLegal';
import ConsentBridge from 'src/components/consent/ConsentBridge';
import GoogleAdProvider from 'src/components/ads/GoogleAdProvider';
import Header from 'src/components/Header';

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
        <Header />
        {children}
        <FooterLegal />
        <GoogleAdProvider />
        <ConsentBridge />
      </body>
    </html>
  );
}
