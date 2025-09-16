// next.config.mjs
/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',

  // If you display images hosted on your data domain, allow it here:
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'data.lottosmartpicker9000.com' },
      { protocol: 'https', hostname: 'data-staging.lottosmartpicker9000.com' },
    ],
  },

  // If you’re not using Next Image optimization or had issues with sharp on Alpine,
  // you can temporarily un-comment this to disable optimization:
  // images: { unoptimized: true },
};
