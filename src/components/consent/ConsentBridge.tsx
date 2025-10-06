// src/components/consent/ConsentBridge.tsx
'use client';

import { useEffect } from 'react';

type ConsentState = {
  ad_storage: 'granted' | 'denied';
  analytics_storage: 'granted' | 'denied';
  ad_user_data: 'granted' | 'denied';
  ad_personalization: 'granted' | 'denied';
};

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
    __tcfapi?: (...args: any[]) => void;
    __gpp?: (...args: any[]) => void;
  }
}

export default function ConsentBridge() {
  useEffect(() => {
    // on mount, ensure default=denied (Consent Mode v2)
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).gtag = (window as any).gtag || function(){ (window as any).dataLayer.push(arguments); };
    (window as any).gtag('consent', 'default', {
      ad_storage: 'denied',
      analytics_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });

    // --- Vendor-agnostic bridge --------------------------------------------
    // Any CMP can dispatch a CustomEvent('cmp:consent-update', { detail: ConsentState })
    // and we will translate it into Google Consent Mode and notify ads.
    const applyConsent = (state: ConsentState) => {
      window.gtag('consent', 'update', state);
      // Strict ads gating: signal AdSense loader only when ad_storage is granted
      if (state.ad_storage === 'granted') {
        // fire a separate, one-way event for ad components to react to
        window.dispatchEvent(new CustomEvent('consent:ads-granted'));
      }
    };

    const onCmpUpdate = (e: Event) => {
      const detail = (e as CustomEvent<ConsentState>).detail;
      if (!detail) return;
      applyConsent(detail);
    };
    window.addEventListener('cmp:consent-update', onCmpUpdate);

    // --- Optional: examples for common bridges (leave commented until wired) -
    // if (typeof window.__tcfapi === 'function') {
    //   // TCF v2.2: listen for consent changes and map to your ConsentState
    //   window.__tcfapi('addEventListener', 2, (tcData: any, ok: boolean) => {
    //     if (!ok || !tcData) return;
    //     // TODO: map tcData.purpose.consents[...] to your ConsentState
    //     // applyConsent(mappedState);
    //   });
    // }
    //
    // if (typeof window.__gpp === 'function') {
    //   window.__gpp('addEventListener', 'sectionChange', (resp: any, ok: boolean) => {
    //     if (!ok || !resp) return;
    //     // TODO: map resp to your ConsentState
    //     // applyConsent(mappedState);
    //   });
    // }
 
    return () => {
      window.removeEventListener('cmp:consent-update', onCmpUpdate);
    };

  }, []);

  return null;
}
