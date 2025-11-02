// app/sitemap.ts
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Canonical, state-prefixed URLs only
  return [
    // Georgia (canonical)
    { url: 'https://lottosmartpicker.com',            lastModified: now, changeFrequency: 'daily',   priority: 1 },
    { url: 'https://lottosmartpicker.com/scratchers', lastModified: now, changeFrequency: 'daily',   priority: 0.9 },

    // New York (canonical)
    { url: 'https://lottosmartpicker.com/ny',            lastModified: now, changeFrequency: 'daily',   priority: 0.95 },
    { url: 'https://lottosmartpicker.com/ny/scratchers', lastModified: now, changeFrequency: 'daily',   priority: 0.9 },

    // Florida (canonical)
    { url: 'https://lottosmartpicker.com/fl',            lastModified: now, changeFrequency: 'daily',   priority: 0.95 },
    { url: 'https://lottosmartpicker.com/fl/scratchers', lastModified: now, changeFrequency: 'daily',   priority: 0.9 },

    // California (canonical)
    { url: 'https://lottosmartpicker.com/ca',            lastModified: now, changeFrequency: 'daily',   priority: 0.95 },
    { url: 'https://lottosmartpicker.com/ca/scratchers', lastModified: now, changeFrequency: 'daily',   priority: 0.9 },

    // Texas (canonical)
    { url: 'https://lottosmartpicker.com/tx',            lastModified: now, changeFrequency: 'daily',   priority: 0.95 },
    { url: 'https://lottosmartpicker.com/tx/scratchers', lastModified: now, changeFrequency: 'daily',   priority: 0.9 },


    // Static pages
    { url: 'https://lottosmartpicker.com/about',         lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: 'https://lottosmartpicker.com/contact',       lastModified: now, changeFrequency: 'yearly',  priority: 0.4 },
  ];
}
