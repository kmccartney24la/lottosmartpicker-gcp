// app/layout.tsx
import './styles/tokens.css';
import './styles/themes.css';
import './styles/globals.css';
import './styles/brand.css';
import './scratchers/scratchers.css';
import './page.css';
import './styles/sidebar.css';
import { Rubik } from 'next/font/google';
import type { Metadata } from 'next';
import FooterLegal from 'src/components/FooterLegal';
import ConsentBridge from 'src/components/consent/ConsentBridge';
import GoogleAdProvider from 'src/components/ads/GoogleAdProvider';
import Header from 'src/components/Header';

const rubik = Rubik({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

export const revalidate = 300; // 5 minutes for all routes under this layout
export const dynamic = 'force-static'; // safe for SSG

// ✅ Add icon + manifest info here
export const metadata: Metadata = {
  title: 'LottoSmartPicker',
  description: 'Powerball / Mega Millions analysis & generator',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    apple: '/apple-touch-icon.png',
    other: [
      { rel: 'android-chrome-192x192', url: '/android-chrome-192x192.png' },
      { rel: 'android-chrome-512x512', url: '/android-chrome-512x512.png' },
    ],
  },
  manifest: '/site.webmanifest',
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
