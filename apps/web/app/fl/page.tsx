// app/fl/page.tsx
import type { Metadata } from 'next';
import React from 'react';
import HomeClientFL from './_components/HomeClientFL';

export const metadata: Metadata = {
  title: 'Florida Lottery — Draw Games (Powerball, Mega Millions, Florida Lotto, Jackpot Triple Play, Fantasy 5, Pick 2/3/4/5, Cash Pop)',
  description:
    'Analysis for Florida draw games: Powerball, Mega Millions, Florida Lotto, Jackpot Triple Play, Fantasy 5 (midday/evening), Pick 2/3/4/5 (midday/evening), and Cash Pop (five daily periods).',
  alternates: { canonical: 'https://lottosmartpicker.com/fl' },
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // Structured data mirrors your NY page setup
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Florida Lottery Analysis',
            url: 'https://lottosmartpicker.com/fl',
            description:
              'Analysis and number generator for Florida draw games with midday/evening and five-period (Cash Pop) filters.',
            isPartOf: {
              '@type': 'WebSite',
              name: 'Lotto Smart Picker',
              url: 'https://lottosmartpicker.com',
            },
          }),
        }}
      />
      <HomeClientFL />
    </>
  );
}
