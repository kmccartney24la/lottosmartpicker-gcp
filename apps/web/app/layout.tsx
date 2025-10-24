// apps/web/app/layout.tsx
import './styles/tokens.css';
import './styles/themes.css';
import { Inter } from "next/font/google";
import './styles/globals.css';
import './styles/brand.css';
import './scratchers.css';
import './page.css';
import './styles/sidebar.css';
import { Rubik } from 'next/font/google';
import type { Metadata } from 'next';
import FooterLegal from 'apps/web/src/components/FooterLegal';
import ConsentBridge from 'apps/web/src/components/consent/ConsentBridge';
import GoogleAdProvider from 'apps/web/src/components/ads/GoogleAdProvider';
import Header from 'apps/web/src/components/Header';
import ClientInit from './ClientInit'; // <-- add this

const rubik = Rubik({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

const inter = Inter({
   subsets: ["latin"],
   display: "swap",        // prevents FOIT on mobile
   preload: true,          // inlines @font-face + preloads only needed files
   adjustFontFallback: true
 });

export const revalidate = 300; // 5 minutes for all routes under this layout
export const dynamic = 'force-static'; // safe for SSG

// ✅ Add icon + manifest info here
export const metadata: Metadata = {
   title: {
    default: 'Lotto Smart Picker',
    template: '%s • Lotto Smart Picker',
  },
  description: 'Smarter lottery insights: Powerball, Mega Millions, Cash4Life & lotto scratchers analysis and number generator.',
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
  metadataBase: new URL('https://lottosmartpicker.com'),
  openGraph: {
    type: 'website',
    url: 'https://lottosmartpicker.com/',
    siteName: 'Lotto Smart Picker',
    title: 'Lotto Smart Picker',
    description: 'Data-driven lottery insights and number analysis.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Lotto Smart Picker' }],
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lotto Smart Picker',
    description: 'Data-driven lottery insights and number analysis.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
     <html lang="en" className={inter.className}>
      <head>
        {/* Warm browser cache for the most universal CSVs */}
        <link rel="preload" as="fetch" href="/api/file/multi/powerball.csv" crossOrigin="anonymous" />
        <link rel="preload" as="fetch" href="/api/file/multi/megamillions.csv" crossOrigin="anonymous" />
      </head>
      <body className={rubik.variable}>
        <ClientInit /> {/* registers web worker on the client */}
        {/* Site-wide JSON-LD: Organization + WebSite (with SearchAction) */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Lotto Smart Picker',
              url: 'https://lottosmartpicker.com',
              logo: 'https://lottosmartpicker.com/android-chrome-192x192.png',
            }),
          }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              url: 'https://lottosmartpicker.com',
              name: 'Lotto Smart Picker',
              potentialAction: {
                '@type': 'SearchAction',
                target: 'https://lottosmartpicker.com/search?q={search_term_string}',
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
        <Header />
        {children}
        <FooterLegal />
        <GoogleAdProvider />
        <ConsentBridge />
      </body>
    </html>
  );
}
