 // app/ny/page.tsx
 import type { Metadata } from 'next';
 import React from 'react';
 import HomeClientNY from './_components/HomeClientNY';

 export const metadata: Metadata = {
   title: 'New York Lottery — Draw Games (Powerball, Mega Millions, Cash4Life, Take 5, Numbers, Win4, Lotto, Pick 10, Quick Draw)',
  description:
    'Analysis for NY draw games: Powerball, Mega Millions, Cash4Life, Take 5 (midday/evening), Numbers, Win4, Lotto, Pick 10, Quick Draw. Period filter for midday/evening where applicable.',
   alternates: { canonical: 'https://lottosmartpicker.com/ny' },
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
             name: 'New York Lottery Analysis',
             url: 'https://lottosmartpicker.com/ny',
             description:
               'Analysis and number generator for NY draw games with midday/evening period filter and generator where supported.',
             isPartOf: {
               '@type': 'WebSite',
               name: 'Lotto Smart Picker',
               url: 'https://lottosmartpicker.com',
             },
           }),
         }}
       />
       <HomeClientNY />
     </>
   );
 }
