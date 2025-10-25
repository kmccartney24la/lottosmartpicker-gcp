# syntax=docker/dockerfile:1
ARG NODE_VERSION=20.19.5

# ---------- Install deps (dev+prod for building) ----------
FROM node:${NODE_VERSION}-bookworm AS deps
WORKDIR /app
RUN npm i -g npm@10.9.4

# Root manifests
COPY package.json package-lock.json ./

# ✅ Copy each workspace manifest to its real folder
# (Use explicit paths or repeat as you add workspaces)
COPY apps/web/package.json apps/web/
COPY packages/lib/package.json packages/lib/
COPY packages/scripts/package.json packages/scripts/

# Optional: prove the folders exist
RUN test -f apps/web/package.json && \
    test -f packages/lib/package.json && \
    test -f packages/scripts/package.json && \
    node -e "console.log('workspace manifests present ✓')"

# Your existing debug still helpful
RUN node -e "const fs=require('fs');const l=JSON.parse(fs.readFileSync('package-lock.json','utf8'));const keys=Object.keys(l.packages||{});console.log({hasWeb:keys.some(k=>k.endsWith('apps/web')),hasScripts:keys.some(k=>k.endsWith('packages/scripts')),lockfileVersion:l.lockfileVersion})"

# Now this will find the workspace folders and match the lockfile
RUN npm ci --workspaces --include-workspace-root

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
RUN npm run -w @lsp/lib clean \
 && npm run -w @lsp/lib build \
 && ls -al packages/lib/dist | sed -n '1,200p' \
 && npm run -w @lsp/scripts build \
 && npm run build

# Preinstall Chromium once so jobs have a browser at runtime
RUN npx playwright install chromium --with-deps

# ---------- Install prod deps only ----------
FROM node:${NODE_VERSION}-bookworm AS prod-deps
WORKDIR /app

# lock + root manifest
COPY package.json package-lock.json ./

# ✅ also copy workspace manifests so npm can resolve the workspace graph
COPY apps/web/package.json apps/web/
COPY packages/lib/package.json packages/lib/
COPY packages/scripts/package.json packages/scripts/

# Use workspaces + omit dev
RUN npm ci --workspaces --include-workspace-root --omit=dev

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

# 1) Copy the Next standalone payload for the workspace
#    This drops a tree like: /app/apps/web/server.js (entrypoint) + minimal node_modules
COPY --from=builder /app/apps/web/.next/standalone ./

# 2) Copy Next static assets to the SAME workspace path
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# 3) Copy public/ to the SAME workspace path
COPY --from=builder /app/apps/web/public ./apps/web/public

# (Optional) Replace minimal node_modules with full prod deps (you do this for jobs)
RUN rm -rf ./node_modules
COPY --from=prod-deps /app/node_modules ./node_modules

# ✅ Ensure the workspace link target exists in the runtime image
# Copy the lib package manifest and built dist to /app/packages/lib
COPY --from=builder /app/packages/lib/package.json /app/packages/lib/package.json
COPY --from=builder /app/packages/lib/dist /app/packages/lib/dist

# 4) Runtime artifacts for your jobs
COPY --from=builder /app/packages/lib/dist ./lib
COPY --from=builder /app/packages/lib/dist ./dist/lib
COPY --from=builder /app/packages/scripts/dist ./dist/scripts

# 5) Playwright browsers
COPY --from=builder /root/.cache/ms-playwright /ms-playwright
RUN chown -R node:node /ms-playwright

# 6) Writable cache dir for jobs
RUN mkdir -p /app/.cache && chown -R node:node /app

EXPOSE 8080
USER node

# ✅ Start the server from the workspace entry
CMD ["dumb-init","node","apps/web/server.js"]

