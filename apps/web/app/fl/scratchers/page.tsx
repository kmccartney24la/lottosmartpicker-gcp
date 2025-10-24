import type { Metadata } from 'next';
import React from 'react';
import ScratchersClientFL from './ScratchersClientFL';

export const metadata: Metadata = {
  title: 'Florida Scratchers Analysis & Rankings',
  description:
    'Compare Florida scratch-off games by odds, top prizes remaining, value and start date. Updated from official sources.',
  alternates: { canonical: 'https://lottosmartpicker.com/fl/scratchers' },
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
            name: 'Florida Scratchers Analysis & Rankings',
            url: 'https://lottosmartpicker.com/fl/scratchers',
            description:
              'Florida scratch-off comparison by odds, top prizes remaining, and value.',
            isPartOf: {
              '@type': 'WebSite',
              name: 'Lotto Smart Picker',
              url: 'https://lottosmartpicker.com',
            },
          }),
        }}
      />
      <ScratchersClientFL />
    </>
  );
}
