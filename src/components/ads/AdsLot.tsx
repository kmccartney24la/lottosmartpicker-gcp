// src/components/ads/AdsLot.tsx
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

declare global {
  interface Window { adsbygoogle: any[] }
}

type Props = {
  slotId?: string;                 // optional internal identifier
  style?: React.CSSProperties;     // must include fixed height
  adFormat?: 'auto' | string;      // 'auto' is responsive
  fullWidthResponsive?: 'true'|'false';
};

export default function AdSlot({
  slotId,
  style = { display: 'block', width: '100%', height: 280 }, // reserve space!
  adFormat = 'auto',
  fullWidthResponsive = 'true',
}: Props) {
  const ref = useRef<HTMLModElement>(null);
  const pathname = usePathname();
  const isTest = process.env.NEXT_PUBLIC_ADS_TEST === 'on';

  // Single-push guard so we never .push({}) twice on the same <ins>
  const pushOnce = () => {
    const el = ref.current as unknown as HTMLElement & { __lspPushed?: boolean };
    if (!el || el.__lspPushed) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      el.__lspPushed = true;
    } catch {}
  };

  useEffect(() => {
    if (!ref.current) return;
    // Push on route changes (typical case when script is ready)
    pushOnce();
    // Also react to explicit readiness/consent events
    const onReady = () => pushOnce();
    window.addEventListener('adsbygoogle:ready', onReady);
    window.addEventListener('consent:ads-granted', onReady);
    return () => {
      window.removeEventListener('adsbygoogle:ready', onReady);
      window.removeEventListener('consent:ads-granted', onReady);
    };
  }, [pathname]);

  return (
    <ins
      ref={ref as any}
      className="adsbygoogle"
      style={style}
      data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID}
      data-ad-format={adFormat}
      data-full-width-responsive={fullWidthResponsive}
      data-ad-slot={slotId} // optional: server-side AdSense slot id if you create fixed slots
      {...(isTest ? { 'data-adtest': 'on' } : {})}
      aria-label="Advertisement"
    />
  );
}
