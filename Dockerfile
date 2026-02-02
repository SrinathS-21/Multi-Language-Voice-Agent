# LiveKit Cloud Agent Dockerfile
# For more information: https://docs.livekit.io/agents/ops/deployment/builds/
# syntax=docker/dockerfile:1

# Use Node.js 20 (LTS) - matches our development environment
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-slim AS base

# Install required system packages
# ca-certificates: enables TLS/SSL for HTTPS services
# python3, make, g++: required for native module compilation (silero VAD, etc.)
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y ca-certificates python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

# Create non-privileged user for security FIRST
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/home/appuser" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

# Create working directory
WORKDIR /app

# The @livekit/agents-plugin-livekit library uses homedir()/.cache/huggingface/hub
# for ONNX models, and @huggingface/transformers uses its own cache within node_modules
# Create all needed cache directories
RUN mkdir -p /home/appuser/.cache/huggingface/hub && \
    chown -R appuser:appuser /home/appuser

# Copy package files first for better layer caching
COPY package.json package-lock.json ./

# Install ALL dependencies (including dev for build)
RUN npm ci

# Copy source code and config files
COPY . .

# Build TypeScript
RUN npm run build

# Remove dev dependencies to reduce image size BEFORE downloading models
RUN npm prune --production

# Set proper permissions on app directory
RUN chown -R appuser:appuser /app

# Download ML models as appuser AFTER pruning to avoid model removal
# The library expects models in ${HOME}/.cache/huggingface/hub
USER appuser
ENV HOME=/home/appuser
RUN node dist/src/agent/index.js download-files

# Verify models were downloaded
RUN ls -la /home/appuser/.cache/huggingface/hub || echo "Hub cache check"
RUN ls -la /app/node_modules/@huggingface/transformers/.cache 2>/dev/null || echo "Transformers cache not found (expected)"

# Set Node.js to production mode
ENV NODE_ENV=production

# Run the agent
# LiveKit Cloud uses the entry_point from livekit-agent.yaml
CMD [ "npm", "run", "start:agent" ]
