// app/ga/page.tsx
import type { Metadata } from 'next';
import React from 'react';
import HomeClient from './_components/HomeClientGA';

export const metadata: Metadata = {
  title: 'Smarter Powerball & Mega Millions Analysis (Georgia)',
  description:
    'Pick smarter numbers with data-driven analysis for Powerball, Mega Millions, Cash4Life and GA Fantasy 5. Trends, stats, and a generator in one place.',
  alternates: { canonical: 'https://lottosmartpicker.com/ga' },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Smarter Powerball & Mega Millions Analysis — Georgia',
            url: 'https://lottosmartpicker.com/ga',
            description:
              'Data-driven analysis and number generator for Powerball, Mega Millions, Cash4Life and GA Fantasy 5.',
            isPartOf: {
              '@type': 'WebSite',
              name: 'Lotto Smart Picker',
              url: 'https://lottosmartpicker.com',
            },
          }),
        }}
      />
      <HomeClient />
    </>
  );
}
