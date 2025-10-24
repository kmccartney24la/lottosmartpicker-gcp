import type { Metadata } from 'next';
import React from 'react';
import HomeClientCA from './_components/HomeClientCA';

export const metadata: Metadata = {
  title:
    'California Lottery — Draw Games (Powerball, Mega Millions, SuperLotto Plus, Fantasy 5, Daily 3, Daily 4)',
  description:
    'Analysis for California draw games: Powerball, Mega Millions, SuperLotto Plus, Fantasy 5, Daily 3 (midday/evening), and Daily 4.',
  alternates: { canonical: 'https://lottosmartpicker.com/ca' },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // Structured data mirrors FL/NY pages
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'California Lottery Analysis',
            url: 'https://lottosmartpicker.com/ca',
            description:
              'Analysis and number generator for California draw games with midday/evening filters for Daily 3.',
            isPartOf: {
              '@type': 'WebSite',
              name: 'Lotto Smart Picker',
              url: 'https://lottosmartpicker.com',
            },
          }),
        }}
      />
      <HomeClientCA />
    </>
  );
}
