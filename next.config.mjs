// next.config.mjs
/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'data.lottosmartpicker.com' },
      { protocol: 'https', hostname: 'data-staging.lottosmartpicker.com' },
    ],
  },
  async headers() {
    return [
      // Keep API endpoints out of search and out of caches
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, noimageindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
      // Long, immutable cache for Next static assets
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Reasonable cache for robots/sitemap
      {
        source: '/robots.txt',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=60' },
        ],
      },
      {
        source: '/sitemap.xml',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=60' },
        ],
      },
      // next.config.mjs – add to your headers() return array
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },        // unless you need embedding
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
        ],
      },
      // inside headers() – staging only
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
        has: [{ type: 'host', value: 'app-staging.lottosmartpicker.com' }],
      },
    ];
  },
};
