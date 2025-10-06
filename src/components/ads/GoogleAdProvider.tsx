'use client';

import { useEffect } from 'react';

const PUBLISHER_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID;
const ADS_ENABLED  = process.env.NEXT_PUBLIC_ADS_ENABLED !== 'false';

export default function GoogleAdProvider() {
  useEffect(() => {
    if (!ADS_ENABLED || !PUBLISHER_ID) return;

    const appendScript = () => {
      if (document.getElementById('adsbygoogle-js')) return;
      const s = document.createElement('script');
      s.id = 'adsbygoogle-js';
      s.async = true;
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_ID}`;
      s.setAttribute('crossorigin', 'anonymous');
      s.onload = () => {
        // Signal slots they can push now
        window.dispatchEvent(new Event('adsbygoogle:ready'));
      };
      document.head.appendChild(s);
    };

    // Strict gating: wait for ad_storage grant
    const onGranted = () => appendScript();
    window.addEventListener('consent:ads-granted', onGranted);

    // In case consent was already granted before this component mounted,
    // your CMP callback can optionally dispatch immediately after page load.
    return () => window.removeEventListener('consent:ads-granted', onGranted);
  }, []);


  return null;
}
