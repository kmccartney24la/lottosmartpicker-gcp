// postcss.config.mjs (ESM)
export default {
  // Next.js expects an object map here; key order is preserved, so import runs first
  plugins: {
    'postcss-import': {},
    'postcss-preset-env': {
      stage: 1,
      features: {
        'custom-media-queries': true,
        'nesting-rules': true
      }
    }
  }
};