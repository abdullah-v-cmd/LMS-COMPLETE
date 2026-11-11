# ========================================================
# Enterprise Multi-Tenant LMS - Production Multi-Stage Dockerfile
# ========================================================

# --- Stage 1: Build Stage ---
FROM node:22-alpine AS builder

WORKDIR /app

# Install system dependencies needed for native modules
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package manifests and lockfile
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies for all workspaces
RUN npm ci

# Copy source code and Prisma schema
COPY server ./server
COPY client ./client

# Generate Prisma Client and build server + client
RUN npm run build

# Prune devDependencies for a lean production image
RUN npm prune --production

# --- Stage 2: Production Runtime Stage ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install runtime dependencies (OpenSSL for Prisma)
RUN apk add --no-cache openssl dumb-init

# Create non-root system user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 lmsuser

# Copy built server artifacts and pruned node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/client/dist ./client/dist

# Ensure upload directory exists and is owned by non-root user
RUN mkdir -p /app/uploads && chown -R lmsuser:nodejs /app

USER lmsuser

EXPOSE 4000

# Use dumb-init to properly handle PID 1 signals in production
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "server/dist/server.js"]

