// app/sitemap.ts
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Canonical, state-prefixed URLs only
  return [
    // Georgia (canonical)
    { url: 'https://lottosmartpicker.com/ga',            lastModified: now, changeFrequency: 'daily',   priority: 1 },
    { url: 'https://lottosmartpicker.com/ga/scratchers', lastModified: now, changeFrequency: 'daily',   priority: 0.9 },

    // New York (canonical)
    { url: 'https://lottosmartpicker.com/ny',            lastModified: now, changeFrequency: 'daily',   priority: 0.95 },
    { url: 'https://lottosmartpicker.com/ny/scratchers', lastModified: now, changeFrequency: 'daily',   priority: 0.9 },

    // Static pages
    { url: 'https://lottosmartpicker.com/about',         lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: 'https://lottosmartpicker.com/contact',       lastModified: now, changeFrequency: 'yearly',  priority: 0.4 },
  ];
}
