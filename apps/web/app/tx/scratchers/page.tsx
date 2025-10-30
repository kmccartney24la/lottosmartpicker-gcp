import type { Metadata } from 'next';
import React from 'react';
import ScratchersClientTX from './ScratchersClientTX';

export const metadata: Metadata = {
  title: 'Texas Scratchers Analysis & Rankings',
  description: 'Compare TX scratch-off games by odds, top prizes remaining, value and start date. Updated from official sources.',
  alternates: { canonical: 'https://lottosmartpicker.com/tx/scratchers' },
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
            '@type': 'CollectionPage',
            name: 'Texas Scratchers Analysis & Rankings',
            url: 'https://lottosmartpicker.com/tx/scratchers',
            description: 'TX scratch-off comparison by odds, top prizes remaining, and value.',
            isPartOf: { '@type': 'WebSite', name: 'Lotto Smart Picker', url: 'https://lottosmartpicker.com' },
          }),
        }}
      />
      <ScratchersClientTX />
    </>
  );
}
