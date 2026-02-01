# LiveKit Sarvam Voice Agent - Complete Documentation

**Last Updated:** January 13, 2026  
**Status:** Production Ready ✅

---

## 📚 Table of Contents

1. [Project Overview](#project-overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Analytics System](#analytics-system)
5. [Testing Guide](#testing-guide)
6. [Production Deployment](#production-deployment)
7. [API Reference](#api-reference)

---

## Project Overview

LiveKit Sarvam Voice Agent is a production-ready voice AI platform built with TypeScript, LiveKit, and Convex. It provides real-time voice interactions with advanced features including:

- **Real-time Voice Processing** - LiveKit WebRTC for low-latency audio
- **Multi-tenant Architecture** - Organization-based isolation with Convex
- **RAG Knowledge Base** - Vector search with hybrid retrieval
- **Universal Function Router** - Dynamic function calling system
- **Comprehensive Analytics** - Performance tracking and business metrics
- **Production Ready** - Monitoring, error handling, and scalability

### Technology Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Voice**: LiveKit SDK for WebRTC
- **AI Services**: Sarvam AI (STT, TTS, LLM)
- **Database**: Convex (real-time, serverless)
- **RAG**: Convex RAG component with vector search
- **API**: HTTP REST endpoints

---

## Quick Start

### Prerequisites

```bash
# Required
node >= 18.0.0
npm >= 9.0.0

# Environment Variables
LIVEKIT_URL=wss://your-livekit-url
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
CONVEX_URL=https://your-convex-url
CONVEX_DEPLOY_KEY=your-deploy-key
SARVAM_API_KEY=your-sarvam-key
```

### Installation

```bash
# Clone and install
git clone <repository-url>
cd livekit_sarvam_agent
npm install

# Deploy Convex backend
npx convex deploy

# Build TypeScript
npm run build

# Start development
npm run dev
```

### First Voice Call

```bash
# Start the agent
npm run agent

# In another terminal, start API server
npm run api

# Test via API
curl -X POST http://localhost:8000/api/v1/calls \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "your-agent-id",
    "organization_id": "your-org-id"
  }'
```

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer                            │
│              (Phone, Web, Mobile App)                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ WebRTC/SIP
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    LiveKit Server                            │
│          (Media routing, room management)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ LiveKit SDK
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Voice Agent (TypeScript)                        │
│  ┌────────────────────────────────────────────────────┐    │
│  │  STT → LLM → Function Router → TTS → Audio Out     │    │
│  └────────────────────────────────────────────────────┘    │
│                                                               │
│  Features:                                                   │
│  - Real-time transcription (Sarvam STT)                     │
│  - LLM processing (Sarvam LLM)                              │
│  - Function calling (Universal Router)                      │
│  - Text-to-speech (Sarvam TTS)                              │
│  - Session management                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/Convex Client
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  Convex Backend                              │
│                                                               │
│  Tables:                                                     │
│  - callSessions      - Active/completed calls               │
│  - callInteractions  - Messages and function calls          │
│  - callMetrics       - Performance tracking                 │
│  - agents            - Agent configurations                 │
│  - organizations     - Multi-tenant data                    │
│  - documents         - Knowledge base                       │
│                                                               │
│  Functions:                                                  │
│  - Analytics queries  (getTodayStats, etc.)                 │
│  - Metrics logging    (logMetric, etc.)                     │
│  - Session CRUD       (create, update, etc.)                │
│  - RAG search         (hybrid_search)                       │
└─────────────────────────────────────────────────────────────┘
```

### Parser System

The parser extracts structured data from voice conversations:

**Architecture:**
```
User Speech → STT → Parser → Validation → Chunks → Storage
```

**Key Components:**
1. **Pattern Matching** - Regex and keyword detection
2. **Chunking** - Breaking content into searchable units
3. **Validation** - Type checking and constraints
4. **Storage** - Convex documents table

**Example:**
```typescript
// User says: "Add chicken biryani for $12.99"
// Parser extracts:
{
  action: "add_item",
  item_name: "chicken biryani",
  price: 12.99,
  category: "food"
}
```

### Universal Function Router

Dynamic function calling system that maps user intents to actions:

**Features:**
- Function registration at runtime
- Type-safe parameter passing
- Automatic function discovery
- Parallel execution support

**Example:**
```typescript
// Register function
router.register('hybrid_search', async (params) => {
  return await search(params.query);
});

// Agent automatically calls when user asks:
// "What dishes do you have with chicken?"
```

---

## Analytics System

### Overview

Comprehensive monitoring and performance tracking for production operations.

### Key Features

1. **Real-time Monitoring**
   - Active call tracking
   - Error rate monitoring (1h, 24h)
   - System health status

2. **Performance Analytics**
   - Latency metrics (P50, P95, P99)
   - TTS/STT/LLM performance
   - Function call duration

3. **Business Intelligence**
   - Daily/weekly/monthly stats
   - Usage tracking for billing
   - Agent performance comparison

### API Endpoints

```bash
# Today's overview
GET /api/v1/analytics?tenant_id=org_123

# Recent sessions
GET /api/v1/analytics/sessions?tenant_id=org_123&limit=50

# Per-agent stats
GET /api/v1/analytics/agent/:agent_id

# Latency metrics
GET /api/v1/analytics/latency/:agent_id?time_range=24

# Function performance
GET /api/v1/analytics/functions/:agent_id

# System health
GET /api/v1/analytics/health?tenant_id=org_123

# Hourly breakdown
GET /api/v1/analytics/hourly?tenant_id=org_123

# All agents comparison
GET /api/v1/analytics/agents?tenant_id=org_123&limit=50
```

### Logging Metrics

**From Agent Code:**
```typescript
import { getConvexClient } from './core/convex-client.js';

const convex = getConvexClient();

// Log latency
await convex.mutation('callMetrics:logMetric', {
  sessionId: session.id,
  organizationId: org.id,
  agentId: agent.id,
  metricType: 'latency',
  metricName: 'tts_latency',
  value: durationMs,
  unit: 'ms'
});

// Batch logging (more efficient)
await convex.mutation('callMetrics:logMetricsBatch', {
  metrics: [
    { sessionId, organizationId, agentId, metricType: 'latency', metricName: 'tts_latency', value: 120 },
    { sessionId, organizationId, agentId, metricType: 'latency', metricName: 'stt_latency', value: 95 },
    { sessionId, organizationId, agentId, metricType: 'function_call', metricName: 'hybrid_search', value: 245 }
  ]
});
```

### Dashboard Integration

```typescript
// React component example
function AnalyticsDashboard({ tenantId }) {
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    fetch(`/api/v1/analytics?tenant_id=${tenantId}`)
      .then(res => res.json())
      .then(data => setStats(data.data.today));
  }, [tenantId]);
  
  return (
    <div>
      <StatCard title="Total Calls" value={stats.total_calls} />
      <StatCard title="Completion Rate" value={`${stats.completion_rate}%`} />
      <StatCard title="Avg Duration" value={`${Math.round(stats.avg_duration_seconds / 60)} min`} />
    </div>
  );
}
```

---

## Testing Guide

### Prerequisites Check

Before running tests, verify:

```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Check environment
cat .env.local | grep -E "CONVEX_URL|LIVEKIT_URL|SARVAM_API_KEY"

# Verify Convex deployment
npx convex dev  # Should show "Synced"
```

### Unit Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- parser.test.ts

# Run with coverage
npm test -- --coverage

# Watch mode
npm test -- --watch
```

### Integration Tests

**Test API Endpoints:**
```bash
# Health check
curl http://localhost:8000/health

# Create agent
curl -X POST http://localhost:8000/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "org_123",
    "name": "Test Agent",
    "system_prompt": "You are a helpful assistant"
  }'

# Start call
curl -X POST http://localhost:8000/api/v1/calls \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent_xyz",
    "organization_id": "org_123"
  }'

# Check analytics
curl "http://localhost:8000/api/v1/analytics?tenant_id=org_123"
```

**Test Convex Functions:**
```bash
# Via Convex CLI
npx convex run analytics:getTodayStats '{"organizationId": "org_123"}'

# Test RAG search
npx convex run rag:search '{"organizationId": "org_123", "query": "chicken dishes"}'

# Test metrics
npx convex run callMetrics:getByAgentId '{"agentId": "agent_xyz"}'
```

### End-to-End Tests

**Phone Call Test:**
```bash
# 1. Start agent
npm run agent

# 2. Start API server
npm run api

# 3. Use phone/SIP client to call
# Or use LiveKit SDK to join room programmatically
```

**Web Client Test:**
```javascript
// HTML test page
<script src="https://cdn.jsdelivr.net/npm/livekit-client/dist/livekit-client.umd.min.js"></script>
<script>
  const room = new LivekitClient.Room();
  await room.connect('wss://your-livekit-url', token);
  
  // Enable microphone
  await room.localParticipant.setMicrophoneEnabled(true);
  
  // Listen for agent responses
  room.on('trackSubscribed', (track, publication, participant) => {
    if (track.kind === 'audio') {
      track.attach(document.getElementById('audio'));
    }
  });
</script>
```

### Performance Testing

```bash
# Load test with Artillery
npm install -g artillery

# Create test scenario
cat > loadtest.yml << EOF
config:
  target: 'http://localhost:8000'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Create sessions"
    flow:
      - post:
          url: "/api/v1/calls"
          json:
            agent_id: "agent_xyz"
            organization_id: "org_123"
EOF

# Run load test
artillery run loadtest.yml
```

---

## Production Deployment

### Environment Setup

**Required Environment Variables:**
```bash
# LiveKit Configuration
LIVEKIT_URL=wss://your-production-livekit.com
LIVEKIT_API_KEY=prod_api_key
LIVEKIT_API_SECRET=prod_api_secret

# Convex Configuration
CONVEX_URL=https://your-prod-convex.cloud
CONVEX_DEPLOY_KEY=prod_deploy_key

# Sarvam AI
SARVAM_API_KEY=prod_sarvam_key

# Application
NODE_ENV=production
PORT=8000
LOG_LEVEL=info
```

### Deployment Steps

**1. Build:**
```bash
npm run build
npm run build:convex
```

**2. Deploy Convex:**
```bash
npx convex deploy --prod
```

**3. Deploy Application:**
```bash
# Docker deployment
docker build -t livekit-agent .
docker run -p 8000:8000 --env-file .env.production livekit-agent

# Or PM2 deployment
pm2 start dist/agent/index.js --name voice-agent
pm2 start dist/api/server.js --name api-server
pm2 save
```

**4. Configure Monitoring:**
```bash
# Set up health checks
curl http://your-domain.com/health

# Configure alerts (example with PagerDuty)
# Monitor error rates, latency, system health
```

### Production Checklist

- [ ] Environment variables configured
- [ ] Convex deployed to production
- [ ] SSL/TLS certificates installed
- [ ] Health checks configured
- [ ] Monitoring and alerting set up
- [ ] Log aggregation configured (e.g., CloudWatch, Datadog)
- [ ] Backup strategy implemented
- [ ] Rate limiting configured
- [ ] Security headers set
- [ ] CORS configured properly
- [ ] Database indexes optimized
- [ ] Load testing completed
- [ ] Disaster recovery plan documented

### Scaling Considerations

**Horizontal Scaling:**
```yaml
# Kubernetes deployment example
apiVersion: apps/v1
kind: Deployment
metadata:
  name: voice-agent
spec:
  replicas: 3  # Scale based on load
  selector:
    matchLabels:
      app: voice-agent
  template:
    metadata:
      labels:
        app: voice-agent
    spec:
      containers:
      - name: agent
        image: livekit-agent:latest
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
```

**Performance Tuning:**
- Enable Convex caching
- Use connection pooling
- Optimize function execution
- Monitor and optimize slow queries
- Implement request queuing for high load

---

## API Reference

### REST Endpoints

#### Health Check
```
GET /health
Response: { status: "ok", timestamp: number }
```

#### Agents

**Create Agent:**
```
POST /api/v1/agents
Body: {
  organization_id: string,
  name: string,
  system_prompt: string,
  config?: string
}
Response: { agent_id: string }
```

**List Agents:**
```
GET /api/v1/agents?organization_id=xxx
Response: { agents: Agent[] }
```

#### Calls/Sessions

**Start Call:**
```
POST /api/v1/calls
Body: {
  agent_id: string,
  organization_id: string,
  call_type?: "inbound" | "outbound" | "web"
}
Response: {
  session_id: string,
  room_name: string,
  token: string
}
```

**Get Session:**
```
GET /api/v1/sessions/:session_id
Response: { session: Session }
```

**End Call:**
```
POST /api/v1/calls/:session_id/end
Response: { status: "completed" }
```

#### Knowledge Base

**Ingest Document:**
```
POST /api/v1/knowledge
Body: {
  organization_id: string,
  content: string,
  metadata?: object
}
Response: { document_id: string, chunks: number }
```

**Search Knowledge:**
```
POST /api/v1/knowledge/search
Body: {
  organization_id: string,
  query: string,
  limit?: number
}
Response: { results: SearchResult[] }
```

#### Analytics

See [Analytics System](#analytics-system) section for complete reference.

---

## Support & Resources

### Documentation Files
- **ANALYTICS_SYSTEM.md** - Detailed analytics documentation
- **README.md** - Project setup and configuration

### Getting Help
- Create issues on GitHub
- Review test files for examples
- Check Convex dashboard for data inspection
- Use LiveKit Cloud dashboard for media debugging

### Best Practices
1. Always use organization_id for multi-tenancy
2. Log metrics for all operations
3. Implement proper error handling
4. Use TypeScript strict mode
5. Write tests for business logic
6. Monitor analytics regularly
7. Keep dependencies updated
8. Follow security best practices

---

**Last Updated:** January 13, 2026  
**Version:** 1.0.0  
**Status:** Production Ready ✅
