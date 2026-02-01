# Analytics System Documentation

## Overview

The Analytics System provides comprehensive monitoring, performance tracking, and insights for your voice agent platform. It consists of three main layers:

1. **Convex Backend** - Data aggregation and query functions
2. **REST API** - HTTP endpoints for accessing analytics
3. **Frontend Integration** - Ready for dashboard consumption

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     REST API Layer                           │
│              (src/api/routes/analytics.ts)                   │
│                                                               │
│  GET /api/v1/analytics                  - Today's overview   │
│  GET /api/v1/analytics/sessions         - Recent sessions    │
│  GET /api/v1/analytics/agent/:id        - Per-agent stats    │
│  GET /api/v1/analytics/latency/:id      - Latency metrics    │
│  GET /api/v1/analytics/functions/:id    - Function stats     │
│  GET /api/v1/analytics/health           - System health      │
│  GET /api/v1/analytics/hourly           - Hourly breakdown   │
│  GET /api/v1/analytics/agents           - All agent perf     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Convex Functions                          │
│                                                               │
│  analytics.ts:                                               │
│    - getTodayStats()          - Today's call statistics      │
│    - getStatsForRange()       - Custom date range stats      │
│    - getHourlyStats()         - Hourly breakdown            │
│    - getAgentPerformance()    - All agents comparison       │
│    - getUsageStats()          - Billing/quota tracking      │
│    - getSystemHealth()        - Monitoring/alerting         │
│                                                               │
│  callMetrics.ts:                                             │
│    - logMetric()              - Record single metric         │
│    - logMetricsBatch()        - Bulk metric logging         │
│    - getBySessionId()         - Session metrics             │
│    - getByAgentId()           - Agent metrics               │
│    - getLatencyStats()        - Latency analysis            │
│    - getFunctionCallStats()   - Function performance        │
│    - getErrorMetrics()        - Error tracking              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Database Tables                          │
│                                                               │
│  callSessions    - Session lifecycle and duration            │
│  callInteractions - Conversation quality                     │
│  callMetrics     - Performance measurements                  │
│  agents          - Agent configurations                      │
│  organizations   - Tenant data                               │
└─────────────────────────────────────────────────────────────┘
```

---

## API Endpoints Reference

### 1. Today's Overview

**GET** `/api/v1/analytics?tenant_id=xxx&agent_id=xxx`

Get today's call statistics for an organization or specific agent.

**Query Parameters:**
- `tenant_id` (required) - Organization ID
- `agent_id` (optional) - Filter by specific agent

**Response:**
```json
{
  "status": "success",
  "data": {
    "today": {
      "total_calls": 150,
      "completed_calls": 142,
      "failed_calls": 5,
      "active_calls": 3,
      "completion_rate": 95,
      "avg_duration_seconds": 245,
      "total_duration_seconds": 36750
    },
    "timestamp": "2026-01-13T10:30:00Z"
  }
}
```

**Use Cases:**
- Dashboard homepage
- Real-time monitoring
- Daily performance tracking

---

### 2. Recent Sessions

**GET** `/api/v1/analytics/sessions?tenant_id=xxx&agent_id=xxx&limit=50`

Retrieve recent call sessions with details.

**Query Parameters:**
- `tenant_id` (optional) - Filter by organization
- `agent_id` (optional) - Filter by agent
- `limit` (optional) - Number of sessions (default: 50)

**Response:**
```json
{
  "status": "success",
  "sessions": [
    {
      "session_id": "sess_abc123",
      "agent_id": "agent_xyz",
      "status": "completed",
      "started_at": 1705140000000,
      "ended_at": 1705140245000,
      "duration_seconds": 245,
      "call_type": "inbound"
    }
  ],
  "total": 50
}
```

**Use Cases:**
- Session history view
- Debugging specific calls
- Audit trails

---

### 3. Per-Agent Analytics

**GET** `/api/v1/analytics/agent/:agent_id`

Get comprehensive statistics for a specific agent.

**Path Parameters:**
- `agent_id` (required) - Agent identifier

**Response:**
```json
{
  "status": "success",
  "agent_id": "agent_xyz",
  "stats": {
    "total_calls": 250,
    "completed_calls": 238,
    "completion_rate": 95,
    "avg_duration_seconds": 220,
    "total_duration_seconds": 55000,
    "avg_latency_ms": 145
  },
  "recent_sessions": [...]
}
```

**Use Cases:**
- Agent performance dashboards
- Comparison between agents
- Optimization targeting

---

### 4. Latency Statistics

**GET** `/api/v1/analytics/latency/:agent_id?time_range=24`

Get detailed latency metrics broken down by component.

**Path Parameters:**
- `agent_id` (required) - Agent identifier

**Query Parameters:**
- `time_range` (optional) - Hours to look back (default: 24)

**Response:**
```json
{
  "status": "success",
  "agent_id": "agent_xyz",
  "time_range_hours": 24,
  "metrics": {
    "tts_latency": {
      "count": 450,
      "avg_ms": 120,
      "p50_ms": 110,
      "p95_ms": 180,
      "p99_ms": 250,
      "min_ms": 80,
      "max_ms": 350
    },
    "stt_latency": {
      "count": 450,
      "avg_ms": 95,
      "p50_ms": 90,
      "p95_ms": 140,
      "p99_ms": 200,
      "min_ms": 60,
      "max_ms": 280
    },
    "llm_latency": {
      "count": 450,
      "avg_ms": 340,
      "p50_ms": 310,
      "p95_ms": 520,
      "p99_ms": 680,
      "min_ms": 180,
      "max_ms": 850
    }
  },
  "total_measurements": 1350
}
```

**Use Cases:**
- Performance optimization
- SLA monitoring
- Identifying bottlenecks
- Provider comparison

---

### 5. Function Call Statistics

**GET** `/api/v1/analytics/functions/:agent_id?time_range=24`

Track performance of function calls (hybrid_search, get_business_info, etc.)

**Path Parameters:**
- `agent_id` (required) - Agent identifier

**Query Parameters:**
- `time_range` (optional) - Hours to look back (default: 24)

**Response:**
```json
{
  "status": "success",
  "agent_id": "agent_xyz",
  "time_range_hours": 24,
  "functions": [
    {
      "function_name": "hybrid_search",
      "call_count": 180,
      "avg_duration_ms": 245,
      "p95_duration_ms": 380,
      "min_duration_ms": 120,
      "max_duration_ms": 850
    },
    {
      "function_name": "get_business_info",
      "call_count": 120,
      "avg_duration_ms": 85,
      "p95_duration_ms": 150,
      "min_duration_ms": 45,
      "max_duration_ms": 320
    }
  ],
  "total_calls": 300
}
```

**Use Cases:**
- Function optimization
- Cache effectiveness tracking
- Resource allocation

---

### 6. System Health

**GET** `/api/v1/analytics/health?tenant_id=xxx`

Monitor system health and error rates.

**Query Parameters:**
- `tenant_id` (required) - Organization ID

**Response:**
```json
{
  "status": "success",
  "health": {
    "status": "healthy",
    "error_rate_24h": 3,
    "error_rate_1h": 2,
    "active_sessions": 12,
    "avg_duration_24h": 235
  },
  "metrics": {
    "calls_last_24h": 856,
    "calls_last_1h": 42,
    "failed_last_24h": 26,
    "failed_last_1h": 1
  },
  "timestamp": 1705140000000
}
```

**Health Status:**
- `healthy` - Error rate < 10%
- `warning` - Error rate 10-20%
- `critical` - Error rate > 20%

**Use Cases:**
- Real-time monitoring
- Alert triggers
- Incident detection

---

### 7. Hourly Breakdown

**GET** `/api/v1/analytics/hourly?tenant_id=xxx&date=timestamp`

Get hourly call statistics for time-series analysis.

**Query Parameters:**
- `tenant_id` (required) - Organization ID
- `date` (optional) - Unix timestamp for specific date (default: today)

**Response:**
```json
{
  "status": "success",
  "date": 1705104000000,
  "hourly_stats": [
    {
      "hour": 0,
      "calls": 12,
      "completed": 11,
      "failed": 1,
      "total_duration": 2640
    },
    {
      "hour": 1,
      "calls": 8,
      "completed": 8,
      "failed": 0,
      "total_duration": 1920
    }
    // ... hours 2-23
  ]
}
```

**Use Cases:**
- Time-series charts
- Peak hour identification
- Capacity planning

---

### 8. All Agents Performance

**GET** `/api/v1/analytics/agents?tenant_id=xxx&limit=50`

Compare performance across all agents in an organization.

**Query Parameters:**
- `tenant_id` (required) - Organization ID
- `limit` (optional) - Max agents to return (default: 50)

**Response:**
```json
{
  "status": "success",
  "agents": [
    {
      "agent_id": "agent_xyz",
      "agent_name": "Customer Support Bot",
      "total_calls": 450,
      "completed_calls": 428,
      "failed_calls": 15,
      "completion_rate": 95,
      "avg_duration_seconds": 220,
      "total_duration_seconds": 99000,
      "last_call_at": 1705140000000,
      "status": "active"
    }
  ],
  "total_agents": 8
}
```

**Use Cases:**
- Agent comparison dashboard
- Performance leaderboard
- Resource allocation decisions

---

## Metric Logging (Backend)

### Recording Metrics

Use these Convex mutations to log performance data during agent operation:

#### Single Metric

```typescript
await ctx.db.mutation(api.callMetrics.logMetric, {
  sessionId: "sess_abc123",
  organizationId: "org_xyz",
  agentId: "agent_xyz",
  metricType: "latency",
  metricName: "tts_latency",
  value: 120,
  unit: "ms",
  metadata: JSON.stringify({ provider: "sarvam" })
});
```

#### Batch Metrics (More Efficient)

```typescript
await ctx.db.mutation(api.callMetrics.logMetricsBatch, {
  metrics: [
    {
      sessionId: "sess_abc123",
      organizationId: "org_xyz",
      agentId: "agent_xyz",
      metricType: "latency",
      metricName: "tts_latency",
      value: 120,
      unit: "ms"
    },
    {
      sessionId: "sess_abc123",
      organizationId: "org_xyz",
      agentId: "agent_xyz",
      metricType: "latency",
      metricName: "stt_latency",
      value: 95,
      unit: "ms"
    },
    {
      sessionId: "sess_abc123",
      organizationId: "org_xyz",
      agentId: "agent_xyz",
      metricType: "function_call",
      metricName: "hybrid_search",
      value: 245,
      unit: "ms"
    }
  ]
});
```

### Metric Types

- **`latency`** - Response time measurements
  - Examples: `tts_latency`, `stt_latency`, `llm_latency`, `total_latency`
  
- **`function_call`** - Function execution duration
  - Examples: `hybrid_search`, `get_business_info`, `searchKnowledge`
  
- **`error`** - Error occurrence tracking
  - Examples: `timeout_error`, `api_error`, `validation_error`
  
- **`quality`** - Quality scores
  - Examples: `transcription_confidence`, `sentiment_score`

---

## Implementation Guidelines

### Frontend Integration

Example React dashboard component:

```typescript
import { useState, useEffect } from 'react';

function AnalyticsDashboard({ tenantId }) {
  const [stats, setStats] = useState(null);
  
  useEffect(() => {
    fetch(`/api/v1/analytics?tenant_id=${tenantId}`)
      .then(res => res.json())
      .then(data => setStats(data.data.today));
  }, [tenantId]);
  
  if (!stats) return <div>Loading...</div>;
  
  return (
    <div className="dashboard">
      <div className="stat-card">
        <h3>Total Calls</h3>
        <p className="stat-value">{stats.total_calls}</p>
      </div>
      <div className="stat-card">
        <h3>Completion Rate</h3>
        <p className="stat-value">{stats.completion_rate}%</p>
      </div>
      <div className="stat-card">
        <h3>Avg Duration</h3>
        <p className="stat-value">{Math.round(stats.avg_duration_seconds / 60)} min</p>
      </div>
    </div>
  );
}
```

### Backend Instrumentation

Add metric logging to your agent code:

```typescript
// In your agent implementation
async function handleLLMResponse(sessionId: string, agentId: string, orgId: string) {
  const startTime = Date.now();
  
  try {
    const response = await callLLM();
    const duration = Date.now() - startTime;
    
    // Log latency metric
    await convex.mutation(api.callMetrics.logMetric, {
      sessionId,
      organizationId: orgId,
      agentId,
      metricType: "latency",
      metricName: "llm_latency",
      value: duration,
      unit: "ms"
    });
    
    return response;
  } catch (error) {
    // Log error metric
    await convex.mutation(api.callMetrics.logMetric, {
      sessionId,
      organizationId: orgId,
      agentId,
      metricType: "error",
      metricName: "llm_error",
      value: 1,
      unit: "count"
    });
    throw error;
  }
}
```

---

## Database Schema

### callMetrics Table

```typescript
{
  _id: Id<"callMetrics">,
  sessionId: string,
  organizationId: string,
  agentId?: string,
  metricType: "latency" | "function_call" | "error" | "quality",
  metricName: string,
  value: number,
  unit: string,
  metadata?: string,
  timestamp: number,
  createdAt: number
}
```

### Indexes

The following indexes optimize query performance:

- `by_session_id` - Fast lookup by session
- `by_organization_id` - Tenant filtering
- `by_agent_id` - Agent-specific queries
- `by_timestamp` - Time-range queries

---

## Performance Considerations

### Query Optimization

1. **Use Time Ranges** - Always specify time ranges to limit data scanned
2. **Batch Writes** - Use `logMetricsBatch` for bulk operations
3. **Limit Results** - Specify appropriate limits for large datasets
4. **Cache Results** - Cache dashboard data with 1-5 minute TTL

### Monitoring Thresholds

Recommended alert thresholds:

- **Error Rate > 10%** - Warning
- **Error Rate > 20%** - Critical
- **P95 Latency > 1000ms** - Performance degradation
- **Active Sessions > Capacity** - Scaling needed

### Data Retention

- **Raw Metrics** - 30 days (for detailed analysis)
- **Aggregated Stats** - 1 year (for trends)
- **Session Data** - 90 days (for compliance)

---

## Use Cases

### 1. Production Monitoring

Monitor system health in real-time:
- Track error rates and alert on spikes
- Monitor latency trends across services
- Identify performance degradation early

### 2. Performance Optimization

Identify and fix bottlenecks:
- Analyze P95/P99 latency metrics
- Compare function call performance
- Optimize slow operations

### 3. Billing & Usage Tracking

Track usage for billing purposes:
- Count total calls per organization
- Calculate total duration/minutes used
- Monitor quota consumption

### 4. Agent Performance Comparison

Compare agent effectiveness:
- Completion rates
- Average call duration
- User satisfaction metrics

### 5. Capacity Planning

Plan infrastructure scaling:
- Identify peak usage hours
- Track growth trends
- Forecast resource needs

---

## Benefits

✅ **Real-time Monitoring** - Track system health as it happens
✅ **Performance Insights** - Identify bottlenecks and optimization opportunities
✅ **Debugging Tools** - Quickly diagnose issues with detailed metrics
✅ **Business Intelligence** - Usage patterns and trends for decision-making
✅ **Cost Tracking** - Accurate billing data and quota management
✅ **SLA Compliance** - Monitor and maintain service level agreements
✅ **Proactive Alerts** - Catch issues before they impact users

---

## Next Steps

1. **Deploy Convex Functions** - `npx convex dev` to deploy analytics.ts and callMetrics.ts
2. **Start Logging Metrics** - Add instrumentation to your agent code
3. **Build Dashboard** - Create frontend to visualize analytics
4. **Set Up Alerts** - Configure monitoring for critical thresholds
5. **Optimize** - Use insights to improve performance

---

## Summary

The analytics system is **essential** for production deployments because it provides:

- **Visibility** into system behavior and performance
- **Debugging** capabilities for troubleshooting issues
- **Optimization** data to improve efficiency
- **Business metrics** for billing and growth tracking
- **Reliability** monitoring to maintain SLAs

**Recommendation: KEEP and continue building on this foundation.**
