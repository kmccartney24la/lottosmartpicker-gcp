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
RUN npx --yes next telemetry disable || true
# build Next.js + compile scripts
RUN npm run build:all

# Preinstall Chromium once so jobs have a browser at runtime
RUN npx playwright install chromium --with-deps
# (Cache location differs by base image; handle both common paths)
# Nothing to do here; we’ll copy from default install dir(s) below.

# ---------- Install prod deps only ----------
FROM node:${NODE_VERSION}-bookworm AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---------- Runtime ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production PORT=8080 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app

# headless Chromium libs + init
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates dumb-init \
    libnss3 libatk-bridge2.0-0 libgtk-3-0 libasound2 libcups2 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 \
    libxfixes3 libxrandr2 libgbm1 libdrm2 libxshmfence1 fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

# Next.js standalone server
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# ✅ compiled job scripts + prod deps + runtime lib + browsers
COPY --from=builder   /app/dist ./dist
COPY --from=builder   /app/lib  ./lib
COPY --from=builder   /app/lib  ./dist/lib
COPY --from=prod-deps /app/node_modules ./node_modules
# ✅ include raw .mjs runtime scripts (like update_csvs.mjs)
COPY --from=builder   /app/scripts ./scripts
# playwright browsers (handle either cache root)
COPY --from=builder /root/.cache/ms-playwright /ms-playwright
# Ensure node user can read the browsers (paranoid but safe)
RUN chown -R node:node /ms-playwright

# ✅ allow runtime to create .cache under /app (and any other writes your jobs do)
RUN mkdir -p /app/.cache && chown -R node:node /app

EXPOSE 8080
USER node
CMD ["dumb-init","node","server.js"]
