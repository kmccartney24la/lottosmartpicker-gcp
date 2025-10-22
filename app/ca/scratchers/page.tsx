import type { Metadata } from 'next';
import React from 'react';
import ScratchersClientCA from './ScratchersClientCA';

export const metadata: Metadata = {
  title: 'California Scratchers Analysis & Rankings',
  description:
    'Compare California scratch-off games by odds, top prizes remaining, value and start date. Updated from official sources.',
  alternates: { canonical: 'https://lottosmartpicker.com/ca/scratchers' },
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
            name: 'California Scratchers Analysis & Rankings',
            url: 'https://lottosmartpicker.com/ca/scratchers',
            description:
              'California scratch-off comparison by odds, top prizes remaining, and value.',
            isPartOf: {
              '@type': 'WebSite',
              name: 'Lotto Smart Picker',
              url: 'https://lottosmartpicker.com',
            },
          }),
        }}
      />
      <ScratchersClientCA />
    </>
  );
}
