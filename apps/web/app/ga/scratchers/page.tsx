// app/ga/scratchers/page.tsx
import type { Metadata } from 'next';
import React from 'react';
import ScratchersClient from './ScratchersClientGA';

export const metadata: Metadata = {
  title: 'Georgia Scratchers Analysis & Rankings',
  description:
    'Compare GA scratch-off games by odds, top prizes remaining, value and start date. Updated from official sources.',
  alternates: { canonical: 'https://lottosmartpicker.com/scratchers' },
};

export default function ScratchersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Georgia Scratchers Analysis & Rankings',
            url: 'https://lottosmartpicker.com/scratchers',
            description: 'GA scratch-off comparison by odds, top prizes remaining, and value.',
            isPartOf: { '@type': 'WebSite', name: 'Lotto Smart Picker', url: 'https://lottosmartpicker.com' },
          }),
        }}
      />
      <ScratchersClient />
    </>
  );
}
