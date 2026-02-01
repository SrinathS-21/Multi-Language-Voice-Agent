#!/usr/bin/env bash
# External health check script for Render.com
# This can be deployed as a separate cron job or used with external monitoring

set -e

# Configuration
SERVICE_URL="${SERVICE_URL:-https://livekit-sarvam-agent.onrender.com}"
HEALTH_ENDPOINT="${SERVICE_URL}/health"
TIMEOUT=10

echo "🏥 Checking health of: $SERVICE_URL"
echo "Endpoint: $HEALTH_ENDPOINT"
echo "Timeout: ${TIMEOUT}s"
echo ""

# Perform health check with timeout
RESPONSE=$(curl -s -f -m $TIMEOUT "$HEALTH_ENDPOINT" || echo "FAILED")

if [ "$RESPONSE" = "FAILED" ]; then
  echo "❌ Health check FAILED"
  echo "Service may be down or unreachable"
  exit 1
fi

# Parse response (expecting JSON with "status" field)
STATUS=$(echo "$RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

if [ "$STATUS" = "healthy" ]; then
  echo "✅ Health check PASSED"
  echo "Response: $RESPONSE"
  exit 0
else
  echo "⚠️  Health check returned unexpected status: $STATUS"
  echo "Response: $RESPONSE"
  exit 1
fi
