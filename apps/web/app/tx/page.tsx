// app/tx/page.tsx
import type { Metadata } from 'next';
import React from 'react';
import HomeClientTX from './_components/HomeClientTX';

export const metadata: Metadata = {
  title: 'Texas Lottery — Draw Games (Powerball, Mega Millions, Cash4Life, Lotto Texas, Texas Two Step, Cash Five, Pick 3, Daily 4, All or Nothing)',
  description:
    'Analysis for Texas draw games: Powerball, Mega Millions, Cash4Life, Lotto Texas, Texas Two Step, Cash Five, Pick 3 (Fireball), Daily 4 (Fireball), All or Nothing with 4-per-day period filter.',
  alternates: { canonical: 'https://lottosmartpicker.com/tx' },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Texas Lottery Analysis',
            url: 'https://lottosmartpicker.com/tx',
            description:
              'Analysis and number generator for Texas draw games with 4-per-day period filter (Morning/Day/Evening/Night) where supported.',
            isPartOf: {
              '@type': 'WebSite',
              name: 'Lotto Smart Picker',
              url: 'https://lottosmartpicker.com',
            },
          }),
        }}
      />
      <HomeClientTX />
    </>
  );
}
