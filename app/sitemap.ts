// app/sitemap.ts
import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: 'https://lottosmartpicker.com/', lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: 'https://lottosmartpicker.com/scratchers', lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: 'https://lottosmartpicker.com/about', lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: 'https://lottosmartpicker.com/contact', lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
  ];
}
