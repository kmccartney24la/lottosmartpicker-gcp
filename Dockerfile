# syntax=docker/dockerfile:1
ARG NODE_VERSION=20.19.5

# ---------- Install deps (dev+prod for building) ----------
FROM node:${NODE_VERSION}-bookworm AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---------- Build ----------
FROM deps AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
COPY . .

# Build order matters for Option A:
# 1) lib-src -> lib (emits .mjs + .d.ts into /app/lib)
# 2) scripts -> dist/scripts (ESM .js that import ../lib/*.mjs)
# 3) Next build (standalone)
RUN npx --yes next telemetry disable || true
RUN npm run build:lib && npm run build:scripts && npm run build

# Preinstall Chromium once so jobs have a browser at runtime
RUN npx playwright install chromium --with-deps

# ---------- Install prod deps only ----------
FROM node:${NODE_VERSION}-bookworm AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---------- Runtime ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production \
    PORT=8080 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

# headless Chromium libs + init
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates dumb-init \
    libnss3 libatk-bridge2.0-0 libgtk-3-0 libasound2 libcups2 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 \
    libxfixes3 libxrandr2 libgbm1 libdrm2 libxshmfence1 fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

# 1) Copy Next standalone (includes minimal node_modules suitable for the server)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# (Optional) Replace minimal node_modules with full prod deps
# It's fine either way; keeping this gives you all runtime deps for scripts too.
RUN rm -rf ./node_modules
COPY --from=prod-deps /app/node_modules ./node_modules

# 2) Copy runtime artifacts for your jobs
#    - Option A emits runtime helpers directly into /app/lib
#    - Scripts compile to /app/dist/scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/dist/scripts ./dist/scripts

# 3) Playwright browsers
COPY --from=builder /root/.cache/ms-playwright /ms-playwright
RUN chown -R node:node /ms-playwright

# 4) Writable cache dir for jobs
RUN mkdir -p /app/.cache && chown -R node:node /app

EXPOSE 8080
USER node
CMD ["dumb-init","node","server.js"]
