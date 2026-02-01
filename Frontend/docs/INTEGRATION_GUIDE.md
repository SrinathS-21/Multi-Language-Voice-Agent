# Frontend-Backend Integration Guide

## Overview

This document provides a comprehensive integration analysis between the **Frontend** (React + Next.js) and the **Backend** (Node.js + Convex) for the Voice Agent Management System.

---

## 1. API Endpoints Reference

The backend exposes a REST API at `http://localhost:8000` with the following endpoint groups:

### 1.1 Health & Status

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info (version, status) |
| `/health` | GET | Liveness check |
| `/ready` | GET | Readiness check with dependencies |
| `/metrics` | GET | Prometheus metrics |

### 1.2 Organizations (`/api/v1/organizations`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/organizations/create` | POST | Create organization |
| `/api/v1/organizations` | GET | List all organizations |
| `/api/v1/organizations/:id` | GET | Get organization by ID |
| `/api/v1/organizations/slug/:slug` | GET | Get organization by slug |

**Request: Create Organization**
```json
{
  "name": "My Company",
  "slug": "my-company",
  "status": "active",
  "config": { /* optional config */ }
}
```

### 1.3 Agents (`/api/v1/agents`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/agents/create` | POST | Create agent |
| `/api/v1/agents?tenant_id=xxx` | GET | List agents by organization |
| `/api/v1/agents/:id` | GET | Get agent by ID |
| `/api/v1/agents/:id` | PUT | Update agent |
| `/api/v1/agents/:id` | DELETE | Delete agent |
| `/api/v1/agents/bind_number` | POST | Bind phone number to agent |

**Request: Create Agent**
```json
{
  "tenant_id": "org_123",
  "name": "Sales Agent",
  "role": "Sales Representative",
  "system_prompt": "You are a helpful sales agent...",
  "config": { /* optional config */ }
}
```

**Response: Agent Object**
```json
{
  "id": "agent_abc123",
  "name": "Sales Agent",
  "role": "Sales Representative",
  "system_prompt": "You are a helpful sales agent...",
  "config": null,
  "organization_id": "org_123",
  "created_at": 1700000000000,
  "updated_at": 1700000000000
}
```

### 1.4 Calls (`/api/v1/calls`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/calls?tenant_id=xxx` | GET | List calls (with pagination) |
| `/api/v1/calls/:session_id` | GET | Get call details |
| `/api/v1/calls/:session_id/transcript` | GET | Get call transcript |
| `/api/v1/calls/outbound` | POST | Initiate outbound call |

**Query Parameters:**
- `tenant_id` (required): Organization ID
- `limit` (optional, default: 100): Max results
- `offset` (optional, default: 0): Pagination offset

**Request: Outbound Call**
```json
{
  "organizationId": "org_123",
  "agentId": "agent_abc",
  "phoneNumber": "+14155551234",
  "roomName": "room_xyz", // optional
  "ringTimeout": 30, // optional
  "metadata": { /* optional */ }
}
```

### 1.5 Knowledge Base (`/api/v1/knowledge`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/knowledge/upload?agent_id=xxx` | POST | Upload document (multipart) |
| `/api/v1/knowledge/chunks?agent_id=xxx` | POST | Ingest pre-parsed chunks |
| `/api/v1/knowledge/search?agent_id=xxx&query=xxx` | GET | Search knowledge base |
| `/api/v1/knowledge/documents?agent_id=xxx` | GET | List documents |
| `/api/v1/knowledge/documents/:id` | DELETE | Delete document |

**Request: Upload Document**
- Content-Type: `multipart/form-data`
- Fields: `file` (required), `source_type` (optional)

**Response: Document Upload**
```json
{
  "success": true,
  "document_id": "doc_xyz",
  "filename": "knowledge.pdf",
  "chunks_created": 15,
  "rag_entry_ids": ["entry_1", "entry_2"],
  "source_type": "general"
}
```

### 1.6 Sessions (`/api/v1/sessions`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/sessions/create` | POST | Create session |
| `/api/v1/sessions?organization_id=xxx` | GET | List sessions |
| `/api/v1/sessions/:id` | GET | Get session by ID |
| `/api/v1/sessions/:id/end` | PUT | End session |

### 1.7 Analytics (`/api/v1/analytics`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/analytics?tenant_id=xxx` | GET | Overview stats |
| `/api/v1/analytics/sessions?tenant_id=xxx` | GET | Recent sessions |
| `/api/v1/analytics/agent/:agent_id` | GET | Per-agent analytics |
| `/api/v1/analytics/latency/:agent_id` | GET | Latency statistics |
| `/api/v1/analytics/functions/:agent_id` | GET | Function call stats |
| `/api/v1/analytics/health` | GET | System health metrics |

---

## 2. Data Model Mapping

### 2.1 Frontend ↔ Backend Type Alignment

| Frontend Type | Backend Type | Notes |
|---------------|--------------|-------|
| `Agent` | `agents` (Convex) | Align `systemPrompt` ↔ `system_prompt` |
| `Call` | `callSessions` (Convex) | Map `session_id` ↔ `id` |
| `KnowledgeBaseDoc` | `documents` (Convex) | Add `rag_entry_ids` to frontend |
| `DashboardStats` | Analytics response | Computed from calls |

### 2.2 Status Enums

**Backend Session Status:**
```typescript
enum SessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  ERROR = 'error',
  FAILED = 'failed',
}
```

**Backend Call Types:**
```typescript
enum CallType {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  TEST = 'test',
  WEB = 'web',
}
```

---

## 3. Authentication Flow

### Current State: No Authentication

The backend currently uses **open CORS** (`Access-Control-Allow-Origin: *`) with no authentication headers required.

### Recommended Auth Implementation

1. **Add JWT Authentication**
   - Frontend: Store JWT in httpOnly cookie or memory
   - Backend: Validate `Authorization: Bearer <token>` header
   - Add middleware before route handlers

2. **Organization-based Tenant Isolation**
   - All requests require `tenant_id` parameter
   - Backend validates tenant access based on JWT claims

3. **Integration Steps:**
   ```typescript
   // Add to API client
   headers: {
     'Content-Type': 'application/json',
     'Authorization': `Bearer ${getAccessToken()}`,
   }
   ```

---

## 4. Error Handling

### Backend Error Response Format

```json
{
  "error": "Error message here",
  "status": 400
}
```

### HTTP Status Codes Used

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation) |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 500 | Internal Server Error |
| 503 | Service Unavailable (Convex not configured) |

### Frontend Error Handling Strategy

```typescript
class ApiError extends Error {
  constructor(
    public status: number,
    public message: string,
    public code?: string
  ) {
    super(message);
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      error.error || 'An error occurred',
      error.code
    );
  }
  return response.json();
}
```

---

## 5. Environment Setup

### 5.1 Required Environment Variables

Create `Frontend/.env.local`:

```env
# Backend API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_API_VERSION=v1

# Organization/Tenant ID (for single-tenant mode)
NEXT_PUBLIC_DEFAULT_TENANT_ID=default

# Feature Flags
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_OUTBOUND_CALLS=true

# Development
NEXT_PUBLIC_DEV_MODE=true
```

### 5.2 Backend Requirements

Ensure backend `.env` has:

```env
# API Server
API_PORT=8000

# Convex (required for all features)
CONVEX_URL=https://your-project.convex.cloud
OPENAI_API_KEY=sk-xxx  # For RAG embeddings

# LiveKit (for voice calls)
LIVEKIT_URL=wss://your-livekit.livekit.cloud
LIVEKIT_API_KEY=xxx
LIVEKIT_API_SECRET=xxx

# Sarvam AI (for voice processing)
SARVAM_API_KEY=xxx
```

---

## 6. CORS Configuration

**Current Backend CORS Headers:**
```typescript
'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
'Access-Control-Allow-Headers': 'Content-Type, Authorization',
```

**Production Recommendation:**
```typescript
// Update server.ts for production
const allowedOrigins = [
  'http://localhost:3000',
  'https://your-frontend.vercel.app',
];

'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : '',
'Access-Control-Allow-Credentials': 'true',
```

---

## 7. Integration Gaps & Recommendations

### 7.1 Security Gaps

| Gap | Severity | Recommendation |
|-----|----------|----------------|
| No authentication | High | Implement JWT auth |
| Open CORS | High | Restrict origins in production |
| No rate limiting | Medium | Add rate limiter middleware |
| No input sanitization | Medium | Add Zod validation on all inputs |

### 7.2 Feature Gaps

| Gap | Description | Recommendation |
|-----|-------------|----------------|
| Real-time updates | No WebSocket for live call status | Add SSE or WebSocket endpoint |
| Bulk operations | No batch delete/update | Add batch endpoints |
| Search/filter | Limited query options | Add full-text search |
| Pagination | Offset-based only | Add cursor-based pagination |

### 7.3 Testing Gaps

| Area | Current State | Recommendation |
|------|---------------|----------------|
| API tests | None visible | Add integration tests |
| Frontend tests | None | Add Jest + React Testing Library |
| E2E tests | None | Add Playwright/Cypress |
| Load tests | Exists (`tests/load-test.ts`) | Expand coverage |

---

## 8. Quick Start Integration

### Step 1: Install dependencies

```bash
cd Frontend
npm install
```

### Step 2: Configure environment

```bash
cp .env.example .env.local
# Edit .env.local with your backend URL
```

### Step 3: Start development

```bash
# Terminal 1: Start backend
cd .. && npm run dev

# Terminal 2: Start frontend
cd Frontend && npm run dev
```

### Step 4: Verify connection

Visit `http://localhost:3000` and check:
- Dashboard loads without errors
- Network tab shows requests to `localhost:8000`
- Create a test agent to verify write operations

---

## 9. Next Steps

1. ✅ Review this integration guide
2. 🔲 Replace mock API with real API client (see `src/api/client.ts`)
3. 🔲 Add authentication flow
4. 🔲 Test all CRUD operations
5. 🔲 Add error boundary components
6. 🔲 Implement real-time call status updates
