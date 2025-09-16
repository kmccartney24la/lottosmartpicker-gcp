# ---------- Build stage ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Build Next.js standalone server
RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS runner
WORKDIR /app

# Cloud Run expects your server to bind to $PORT (defaults to 8080)
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=8080 \
    NEXT_TELEMETRY_DISABLED=1

# Run as non-root for best practice
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

# Copy only what's needed to run
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public

USER nextjs
EXPOSE 8080

# The standalone build creates a server.js entrypoint
CMD ["node","server.js"]
