// apps/web/postcss.config.mjs
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// point to your alias definitions
const mediaFile   = resolve(__dirname, 'app/styles/media.css');
const tokensFile  = resolve(__dirname, 'app/styles/tokens.css'); // optional if it duplicates media

/** @type {import('postcss-load-config').Config} */
export default {
  plugins: {
    'postcss-import': {},
    'postcss-preset-env': {
      stage: 3,
      features: {
        'custom-media-queries': true,
        'nesting-rules': true,            // optional but handy
      },
      importFrom: [mediaFile, tokensFile], // ← makes --bp-* usable everywhere
    },
    autoprefixer: {},
  },
};
