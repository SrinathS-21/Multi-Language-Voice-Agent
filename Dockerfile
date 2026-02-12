# Optimized Dockerfile for LiveKit Cloud Agent
# Uses Debian-based Node (required by LiveKit Cloud infrastructure)
# Multi-stage build for size optimization

FROM node:20-slim AS base

# Install runtime dependencies
RUN apt-get update -qq && apt-get install --no-install-recommends -y \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Dependencies stage
FROM base AS deps
RUN apt-get update -qq && apt-get install --no-install-recommends -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production stage - optimized for LiveKit Cloud
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HF_HUB_OFFLINE=0
ENV HF_HUB_ENABLE_HF_TRANSFER=1

# Create non-root user with proper permissions
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs agent && \
    mkdir -p /app && \
    chown -R agent:nodejs /app

# Copy files with ownership set during copy (faster than chown after)
COPY --from=builder --chown=agent:nodejs /app/dist ./dist
COPY --from=builder --chown=agent:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=agent:nodejs /app/package.json ./
COPY --from=builder --chown=agent:nodejs /app/assest ./assest

USER agent

EXPOSE 8080

# Use ENTRYPOINT for LiveKit Cloud compatibility
ENTRYPOINT ["node", "dist/src/agent/index.js", "start"]
