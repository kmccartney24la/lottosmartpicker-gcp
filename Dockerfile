# syntax=docker/dockerfile:1
ARG NODE_VERSION=20

# ---------- Install deps ----------
FROM node:${NODE_VERSION}-bookworm AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---------- Build ----------
FROM deps AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
# Bring in the full app to build
COPY . .
# Ensure standalone output is enabled in next.config.js (output: 'standalone')
RUN npx --yes next telemetry disable || true
RUN npm run build

# ---------- Runtime (Distroless Node.js 20) ----------
FROM gcr.io/distroless/nodejs20-debian12
ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

# Copy the minimal standalone server
# This contains server.js and the server-side node_modules
COPY --from=builder /app/.next/standalone ./
# Static client assets needed by the standalone server
COPY --from=builder /app/.next/static ./.next/static
# Public folder (favicons, robots.txt, sitemap.xml, images, etc.)
COPY --from=builder /app/public ./public

EXPOSE 8080
USER nonroot
# Next standalone entry
CMD ["server.js"]
