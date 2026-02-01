# Multi-stage build for Node.js/TypeScript LiveKit Agent
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build TypeScript
RUN npm run build
# Note: Model files download automatically on first startup (EOU/VAD models)
# The @livekit/agents SDK handles this via @huggingface/transformers

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Allow Hugging Face model downloads at runtime (EOU/VAD models)
ENV HF_HUB_OFFLINE=0
ENV HF_HUB_ENABLE_HF_TRANSFER=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 agent

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/start-production.js ./

# Set ownership
RUN chown -R agent:nodejs /app

USER agent

# Expose API port
EXPOSE 8000

# Run both API and Agent
CMD ["npm", "start"]
