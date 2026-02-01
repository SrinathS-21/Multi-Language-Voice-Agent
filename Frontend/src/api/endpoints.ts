/**
 * API Endpoints
 *
 * Type-safe API endpoint definitions with request/response types.
 * Maps directly to the backend routes.
 */

import { apiClient, ApiError } from './client';
import { getVersionedApiUrl, getDefaultTenantId } from './config';
import type { Agent, Call, KnowledgeBaseDoc, DashboardStats } from '@/types';

// =============================================================================
// Request/Response Types
// =============================================================================

// Organization Types
export interface Organization {
  _id: string;
  name: string;
  slug: string;
  status: 'active' | 'inactive';
  config?: Record<string, unknown>;
  created_at?: number;
}

export interface CreateOrganizationRequest {
  name: string;
  slug: string;
  status?: 'active' | 'inactive';
  config?: Record<string, unknown>;
}

// Agent Types
export interface CreateAgentRequest {
  tenant_id: string;
  name: string;
  role?: string;
  system_prompt?: string;
  config?: Record<string, unknown>;
  ai_persona_name?: string;
  greeting?: string;
  farewell?: string;
  language?: string;
  phone_country_code?: string;
  phone_number?: string;
  phone_location?: string;
  enable_contextual_enrichment?: boolean;
}

export interface UpdateAgentRequest {
  name?: string;
  role?: string;
  system_prompt?: string;
  config?: Record<string, unknown>;
  ai_persona_name?: string;
  greeting?: string;
  farewell?: string;
  language?: string;
  phone_country_code?: string;
  phone_number?: string;
  phone_location?: string;
  enable_contextual_enrichment?: boolean;
}

export interface AgentResponse {
  id: string;
  name: string;
  role: string;
  system_prompt: string;
  config: Record<string, unknown> | null;
  ai_persona_name?: string;
  greeting?: string;
  farewell?: string;
  language?: string;
  phone_country_code?: string;
  phone_number?: string;
  phone_location?: string;
  enable_contextual_enrichment?: boolean;
  status?: 'active' | 'inactive';
  organization_id: string;
  created_at: number;
  updated_at?: number;
}

export interface ListAgentsResponse {
  agents: AgentResponse[];
  total: number;
}

// Call Types
export interface CallResponse {
  session_id: string;
  call_sid?: string;
  phone_number?: string;
  agent_id?: string;
  agent_type?: string;
  call_type?: 'inbound' | 'outbound' | 'web';
  status: string;
  started_at?: number;
  ended_at?: number;
  duration_seconds?: number;
}

export interface ListCallsResponse {
  total: number;
  items: CallResponse[];
}

export interface TranscriptMessage {
  role: 'user' | 'assistant' | 'function';
  content?: string;
  name?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  timestamp: number;
}

export interface TranscriptResponse {
  session_id: string;
  conversation: TranscriptMessage[];
  total_messages: number;
}

export interface OutboundCallRequest {
  organizationId: string;
  agentId: string;
  phoneNumber: string;
  roomName?: string;
  ringTimeout?: number;
  metadata?: Record<string, unknown>;
}

export interface OutboundCallResponse {
  success: boolean;
  callId?: string;
  roomName?: string;
  error?: string;
}

// Knowledge Base Types
export interface DocumentUploadResponse {
  success: boolean;
  sessionId: string;
  previewEnabled: boolean;
  fileName: string;
  chunkCount: number;
  ragIds?: string[];
  chunks?: Array<{
    index: number;
    preview: string;
    characterCount: number;
    metadata: any;
  }>;
  message: string;
}

export interface DocumentResponse {
  documentId: string;
  fileName: string;
  fileType: string;
  fileSize?: number;  // Add fileSize field
  sourceType: string;
  status: string;
  chunkCount: number;
  uploadedAt: number;
  processedAt?: number;
  error?: string;
  previewChunks?: Array<{  // Add preview chunks
    chunkIndex: number;
    text: string;
    metadata?: string | any; // Can be JSON string or object
  }>;  // Expiration info for preview sessions
  expiresAt?: number;
  expiresInHours?: number;
  expiresInMinutes?: number;
}

export interface SessionStatusResponse {
  success: boolean;
  sessionId: string;
  fileName: string;
  stage: 'uploading' | 'parsing' | 'chunking' | 'preview_ready' | 'confirming' | 'persisting' | 'embedding' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  chunkCount?: number;
  error?: string;
  documentId?: string;
  previewChunks?: Array<{
    index: number;
    preview: string;
    characterCount: number;
    metadata?: any;
  }>;
}
export interface ListDocumentsResponse {
  success: boolean;
  documents: DocumentResponse[];
  count: number;
}

export interface SearchResult {
  chunk_text: string;
  score: number;
  entry_id: string;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  results: SearchResult[];
  total: number;
  latency_ms: number;
}

// Session Types
export interface CreateSessionRequest {
  organization_id: string;
  agent_id?: string;
  room_name?: string;
  call_type?: 'inbound' | 'outbound' | 'test' | 'web';
  config?: Record<string, unknown>;
}

export interface SessionResponse {
  session_id: string;
  organization_id: string;
  agent_id?: string;
  room_name: string;
  status: string;
  call_type: string;
  started_at: number;
  ended_at?: number;
  duration_seconds?: number;
}

// Analytics Types
export interface TodayStats {
  total_calls: number;
  completed_calls: number;
  avg_duration_seconds: number;
  total_duration_seconds: number;
}

export interface AnalyticsResponse {
  status: string;
  data: {
    today: TodayStats;
    timestamp: string;
  };
}

export interface AgentAnalyticsResponse {
  status: string;
  agent_id: string;
  stats: {
    total_calls: number;
    completed_calls: number;
    completion_rate: number;
    avg_duration_seconds: number;
    total_duration_seconds: number;
    avg_latency_ms: number | null;
  };
  recent_sessions: SessionResponse[];
}

// Integration Types
export interface IntegrationTool {
  _id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  status: 'active' | 'inactive';
  version?: string;
}

export interface Integration {
  _id: string;
  agentId: string;
  toolId: string;
  name?: string;
  config: Record<string, unknown>;
  enabled: boolean;
  status?: 'active' | 'inactive';
  enabledTriggers?: string[];
  created_at: number;
  updated_at?: number;
}

export interface ConfigureIntegrationRequest {
  agentId: string;
  toolId: string;
  name?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  enabledTriggers?: string[];
  status?: string;
}

// Prompt Enhancement Types
export interface EnhancePromptRequest {
  basePrompt: string;
  agentName: string;
  agentRole?: string;
  businessName?: string;
  tools?: string[];
  includeSections?: string[];
}

export interface EnhancePromptResponse {
  success: boolean;
  enhancedPrompt?: string;
  error?: string;
}

// Health Types
export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime?: number;
  checks?: Record<string, string>;
}

// =============================================================================
// API Endpoints
// =============================================================================

/**
 * Health check endpoints
 */
export const healthApi = {
  check: async (): Promise<HealthResponse> => {
    return apiClient.get<HealthResponse>('/health');
  },

  ready: async (): Promise<HealthResponse> => {
    return apiClient.get<HealthResponse>('/ready');
  },
};

/**
 * Organization endpoints
 */
export const organizationApi = {
  list: async (): Promise<{ organizations: Organization[]; total: number }> => {
    return apiClient.get(getVersionedApiUrl('/organizations'));
  },

  getById: async (id: string): Promise<Organization> => {
    return apiClient.get(getVersionedApiUrl(`/organizations/${id}`));
  },

  getBySlug: async (slug: string): Promise<Organization> => {
    return apiClient.get(getVersionedApiUrl(`/organizations/slug/${slug}`));
  },

  create: async (data: CreateOrganizationRequest): Promise<Organization> => {
    return apiClient.post(getVersionedApiUrl('/organizations/create'), data);
  },
};

/**
 * Agent endpoints
 */
export const agentApi = {
  list: async (tenantId?: string): Promise<ListAgentsResponse> => {
    return apiClient.get(getVersionedApiUrl('/agents'), {
      tenant_id: tenantId || getDefaultTenantId(),
    });
  },

  getById: async (id: string): Promise<AgentResponse> => {
    return apiClient.get(getVersionedApiUrl(`/agents/${id}`));
  },

  create: async (data: CreateAgentRequest): Promise<{ agent: AgentResponse; message: string }> => {
    return apiClient.post(getVersionedApiUrl('/agents/create'), {
      ...data,
      tenant_id: data.tenant_id || getDefaultTenantId(),
    });
  },

  update: async (id: string, data: UpdateAgentRequest): Promise<{ success: boolean; message: string }> => {
    return apiClient.put(getVersionedApiUrl(`/agents/${id}`), data);
  },

  updateStatus: async (id: string, status: 'active' | 'inactive'): Promise<{ success: boolean; message: string; status: string }> => {
    return apiClient.patch(getVersionedApiUrl(`/agents/${id}/status`), { status });
  },

  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete(getVersionedApiUrl(`/agents/${id}`));
  },

  validatePhoneNumber: async (id: string): Promise<{
    valid: boolean;
    hasPhoneNumber: boolean;
    warning: string | null;
    conflictingAgents: Array<{ id: string; name: string; status: string }>;
    totalOnSameNumber: number;
  }> => {
    return apiClient.get(getVersionedApiUrl(`/agents/validate/${id}`));
  },

  routeByPhone: async (phoneCountryCode: string, phoneNumber: string, organizationId?: string): Promise<{
    success: boolean;
    agent?: {
      id: string;
      name: string;
      organization_id: string;
      status: string;
      greeting?: string;
      language?: string;
    };
    error?: string;
  }> => {
    return apiClient.post(getVersionedApiUrl('/agents/route-by-phone'), {
      phone_country_code: phoneCountryCode,
      phone_number: phoneNumber,
      organization_id: organizationId,
    });
  },

  bindNumber: async (agentId: string, phoneNumber: string): Promise<{ success: boolean }> => {
    return apiClient.post(getVersionedApiUrl('/agents/bind_number'), {
      agent_id: agentId,
      phone_number: phoneNumber,
    });
  },
  
  enhancePrompt: async (data: EnhancePromptRequest): Promise<EnhancePromptResponse> => {
    // Use 70 second timeout for AI prompt enhancement (backend uses 60s + network overhead)
    return apiClient.post(getVersionedApiUrl('/agents/enhance-prompt'), data, { timeout: 70000 });
  },
};

/**
 * Integration endpoints
 */
export const integrationApi = {
  listAvailable: async (activeOnly?: boolean): Promise<{ status: string; tools: IntegrationTool[] }> => {
    return apiClient.get(getVersionedApiUrl('/integrations/available'), {
      active_only: activeOnly ? 'true' : 'false',
    });
  },

  listAgentIntegrations: async (agentId: string): Promise<{ status: string; integrations: Integration[] }> => {
    return apiClient.get(getVersionedApiUrl(`/integrations/agent/${agentId}`));
  },

  configure: async (data: ConfigureIntegrationRequest): Promise<{ status: string; integration_id: string }> => {
    return apiClient.post(getVersionedApiUrl('/integrations/configure'), data);
  },

  delete: async (integrationId: string): Promise<{ status: string; message: string }> => {
    return apiClient.delete(getVersionedApiUrl(`/integrations/${integrationId}`));
  },
};

/**
 * Call endpoints
 */
export const callApi = {
  list: async (params?: {
    tenantId?: string;
    agentId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ListCallsResponse> => {
    const queryParams: Record<string, any> = {
      limit: params?.limit || 100,
      offset: params?.offset || 0,
    };
    
    if (params?.agentId) {
      queryParams.agent_id = params.agentId;
    } else if (params?.tenantId) {
      queryParams.tenant_id = params.tenantId;
    } else {
      queryParams.tenant_id = getDefaultTenantId();
    }
    
    return apiClient.get(getVersionedApiUrl('/calls'), queryParams);
  },

  getById: async (sessionId: string): Promise<CallResponse> => {
    return apiClient.get(getVersionedApiUrl(`/calls/${sessionId}`));
  },

  getTranscript: async (sessionId: string): Promise<TranscriptResponse> => {
    return apiClient.get(getVersionedApiUrl(`/calls/${sessionId}/transcript`));
  },

  initiateOutbound: async (data: OutboundCallRequest): Promise<OutboundCallResponse> => {
    return apiClient.post(getVersionedApiUrl('/calls/outbound'), data);
  },
};

/**
 * Knowledge base endpoints
 */
export const knowledgeApi = {
  uploadDocument: async (
    agentId: string,
    file: File,
    sourceType?: string
  ): Promise<DocumentUploadResponse> => {
    // Backend uses /documents/ingest, not /knowledge/upload
    const url = getVersionedApiUrl(`/documents/ingest?agent_id=${agentId}`);
    return apiClient.upload(url, file, sourceType ? { source_type: sourceType } : undefined);
  },

  ingestChunks: async (
    agentId: string,
    chunks: Array<{ text: string; title?: string; keywords?: string[] }>
  ): Promise<{ success: boolean; ingested: number; failed: number }> => {
    // Backend uses /documents/ingest, not /knowledge/chunks
    return apiClient.post(getVersionedApiUrl(`/documents/ingest?agent_id=${agentId}`), { chunks });
  },

  listDocuments: async (agentId: string): Promise<ListDocumentsResponse> => {
    // Backend route is /documents with query param
    return apiClient.get(getVersionedApiUrl('/documents'), {
      agent_id: agentId,
    });
  },

  deleteDocument: async (documentId: string): Promise<{ success: boolean; message: string }> => {
    // Backend route is /documents/:id
    return apiClient.delete(getVersionedApiUrl(`/documents/${documentId}`));
  },

  getSessionStatus: async (sessionId: string): Promise<SessionStatusResponse> => {
    // Backend route is /documents/:sessionId/status
    return apiClient.get(getVersionedApiUrl(`/documents/${sessionId}/status`));
  },

  confirmDocument: async (sessionId: string): Promise<{ success: boolean; chunksCreated: number; ragIds: string[] }> => {
    // Backend route is /documents/:sessionId/confirm
    return apiClient.post(getVersionedApiUrl(`/documents/${sessionId}/confirm`), {});
  },

  cancelDocument: async (sessionId: string): Promise<{ success: boolean }> => {
    // Backend route is /documents/:sessionId/cancel
    return apiClient.post(getVersionedApiUrl(`/documents/${sessionId}/cancel`), {});
  },

  getDocumentChunks: async (documentId: string): Promise<{
    success: boolean;
    documentId: string;
    chunks: Array<{
      chunkId: string;
      chunkIndex: number;
      text: string;
      tokenCount: number;
      pageNumber?: number;
      sectionTitle?: string;
      qualityScore?: number;
    }>;
    count: number;
  }> => {
    return apiClient.get(getVersionedApiUrl(`/documents/${documentId}/chunks`));
  },
};

/**
 * Session endpoints
 */
export const sessionApi = {
  list: async (params?: {
    organizationId?: string;
    status?: 'active';
    limit?: number;
  }): Promise<{ sessions: SessionResponse[]; total: number }> => {
    return apiClient.get(getVersionedApiUrl('/sessions'), {
      organization_id: params?.organizationId,
      status: params?.status,
      limit: params?.limit,
    });
  },

  getById: async (id: string): Promise<SessionResponse> => {
    return apiClient.get(getVersionedApiUrl(`/sessions/${id}`));
  },

  create: async (data: CreateSessionRequest): Promise<SessionResponse> => {
    return apiClient.post(getVersionedApiUrl('/sessions/create'), data);
  },

  end: async (id: string): Promise<{ success: boolean }> => {
    return apiClient.put(getVersionedApiUrl(`/sessions/${id}/end`));
  },
};

/**
 * Analytics endpoints
 */
export const analyticsApi = {
  getOverview: async (params: {
    tenantId: string;
    agentId?: string;
  }): Promise<AnalyticsResponse> => {
    return apiClient.get(getVersionedApiUrl('/analytics'), {
      tenant_id: params.tenantId,
      agent_id: params.agentId,
    });
  },

  getSessions: async (params: {
    tenantId?: string;
    agentId?: string;
    limit?: number;
  }): Promise<{ status: string; sessions: SessionResponse[]; total: number }> => {
    return apiClient.get(getVersionedApiUrl('/analytics/sessions'), params);
  },

  getAgentAnalytics: async (agentId: string): Promise<AgentAnalyticsResponse> => {
    return apiClient.get(getVersionedApiUrl(`/analytics/agent/${agentId}`));
  },
  
  // Chart data endpoints
  getCallVolumeChart: async (params: { tenantId: string; agentId?: string; days?: number }) => {
    return apiClient.get(getVersionedApiUrl('/analytics/charts/call-volume'), {
      tenant_id: params.tenantId,
      agent_id: params.agentId,
      days: params.days || 7,
    });
  },
  
  getStatusDistribution: async (params: { tenantId: string; agentId?: string; days?: number }) => {
    return apiClient.get(getVersionedApiUrl('/analytics/charts/status-distribution'), {
      tenant_id: params.tenantId,
      agent_id: params.agentId,
      days: params.days || 30,
    });
  },
  
  getLatencyTrends: async (params: { tenantId: string; agentId?: string; days?: number }) => {
    return apiClient.get(getVersionedApiUrl('/analytics/charts/latency-trends'), {
      tenant_id: params.tenantId,
      agent_id: params.agentId,
      days: params.days || 7,
    });
  },
  
  getDurationDistribution: async (params: { tenantId: string; agentId?: string; days?: number }) => {
    return apiClient.get(getVersionedApiUrl('/analytics/charts/duration-distribution'), {
      tenant_id: params.tenantId,
      agent_id: params.agentId,
      days: params.days || 30,
    });
  },
  
  getFunctionCalls: async (params: { tenantId: string; agentId?: string; days?: number }) => {
    return apiClient.get(getVersionedApiUrl('/analytics/charts/function-calls'), {
      tenant_id: params.tenantId,
      agent_id: params.agentId,
      days: params.days || 30,
    });
  },
  
  getSentimentAnalytics: async (params: { tenantId: string; agentId?: string; days?: number }) => {
    return apiClient.get(getVersionedApiUrl('/analytics/charts/sentiment'), {
      tenant_id: params.tenantId,
      agent_id: params.agentId,
      days: params.days || 30,
    });
  },
  
  getHeatmapData: async (params: { tenantId: string; agentId?: string; days?: number }) => {
    return apiClient.get(getVersionedApiUrl('/analytics/charts/heatmap'), {
      tenant_id: params.tenantId,
      agent_id: params.agentId,
      days: params.days || 30,
    });
  },
  
  getDashboardChartData: async (params: { tenantId: string; agentId?: string; days?: number }) => {
    return apiClient.get(getVersionedApiUrl('/analytics/charts/dashboard'), {
      tenant_id: params.tenantId,
      agent_id: params.agentId,
      days: params.days || 7,
    });
  },
  
  getAgentComparison: async (params: { tenantId: string; days?: number }) => {
    return apiClient.get(getVersionedApiUrl('/analytics/charts/agent-comparison'), {
      tenant_id: params.tenantId,
      days: params.days || 30,
    });
  },
  
  getSystemHealth: async (params: { tenantId: string }) => {
    return apiClient.get(getVersionedApiUrl('/analytics/health'), {
      tenant_id: params.tenantId,
    });
  },
};

// =============================================================================
// Helper: Convert Backend Response to Frontend Types
// =============================================================================

/**
 * Convert backend agent response to frontend Agent type
 */
export function toFrontendAgent(response: AgentResponse): Agent {
  // Get language from column first, fallback to config
  const lang = response.language || (response.config?.language as string) || 'en-IN';
  
  // Validate it's a proper locale format (en-IN, ta-IN, etc.)
  const validLangs = ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'bn-IN', 'gu-IN', 'pa-IN'];
  const validLang = validLangs.includes(lang) 
    ? lang as Agent['language'] 
    : 'en-IN' as Agent['language'];
  
  // Get voice from config, default to 'anushka'
  const voice = (response.config?.voice as string) || 'anushka';
  const validVoices = ['anushka', 'vidya', 'manisha', 'arya', 'abhilash', 'karun', 'hitesh'];
  const validVoice = validVoices.includes(voice)
    ? voice as Agent['voice']
    : 'anushka' as Agent['voice'];
  
  return {
    id: response.id,
    name: response.name,
    language: validLang,
    voice: validVoice,
    status: (response.status || 'active') as Agent['status'],
    systemPrompt: response.system_prompt || '',
    aiPersonaName: response.ai_persona_name,
    greeting: response.greeting || '',
    farewell: response.farewell || '',
    phoneCountryCode: response.phone_country_code,
    phoneNumber: response.phone_number,
    phoneLocation: response.phone_location,
    enableContextualEnrichment: response.enable_contextual_enrichment ?? true,
    numberOfCalls: 0,
    createdAt: new Date(response.created_at).toISOString(),
    updatedAt: new Date(response.updated_at || response.created_at).toISOString(),
    knowledgeBaseIds: [],
  };
}

/**
 * Convert backend call response to frontend Call type
 */
export function toFrontendCall(response: CallResponse): Call {
  const statusMap: Record<string, Call['status']> = {
    'active': 'in-progress',
    'completed': 'completed',
    'failed': 'failed',
    'expired': 'failed',
    'error': 'failed',
  };
  
  return {
    id: response.session_id,
    agentId: response.agent_type || '',
    fromNumber: response.phone_number || '',
    toNumber: '',
    status: statusMap[response.status] || 'pending',
    duration: response.duration_seconds || 0,
    timestamp: response.started_at ? new Date(response.started_at).toISOString() : new Date().toISOString(),
    endedAt: response.ended_at ? new Date(response.ended_at).toISOString() : undefined,
  };
}

/**
 * Convert backend document response to frontend KnowledgeBaseDoc type
 */
export function toFrontendDocument(response: DocumentResponse): KnowledgeBaseDoc {
  const typeMap: Record<string, KnowledgeBaseDoc['type']> = {
    'pdf': 'pdf', 'txt': 'txt', 'text': 'txt', 'docx': 'docx',
    'doc': 'docx', 'md': 'md', 'markdown': 'md', 'json': 'json',
  };
  
  const statusMap: Record<string, KnowledgeBaseDoc['status']> = {
    'completed': 'completed',
    'processing': 'processing',
    'failed': 'failed',
    'error': 'failed',
    'pending': 'pending',
    'preview': 'preview',  // Add preview status mapping
  };
  
  return {
    id: response.documentId,
    agentId: '',
    title: response.fileName,
    type: typeMap[response.fileType] || 'txt',
    size: response.fileSize || 0,  // Use fileSize from backend
    status: statusMap[response.status] || 'completed',
    uploadedAt: new Date(response.uploadedAt).toISOString(),
    chunksCount: response.chunkCount,
    // Expiration tracking
    expiresInHours: response.expiresInHours,
    expiresInMinutes: response.expiresInMinutes,
    // Add preview data if chunks are available
    previewData: response.previewChunks ? {
      sessionId: response.documentId,
      fileName: response.fileName,
      chunkCount: response.chunkCount,
      chunks: response.previewChunks.map(chunk => ({
        index: chunk.chunkIndex,
        preview: chunk.text,
        characterCount: chunk.text.length,
        metadata: typeof chunk.metadata === 'string' 
          ? JSON.parse(chunk.metadata) 
          : chunk.metadata,
      })),
    } : undefined,
  };
}

/**
 * Convert analytics response to frontend DashboardStats
 */
export function toFrontendDashboardStats(
  analytics: AnalyticsResponse,
  agentCount: number = 0
): DashboardStats {
  const today = analytics.data.today;
  const completionRate = today.total_calls > 0 
    ? (today.completed_calls / today.total_calls) * 100 
    : 0;
  
  return {
    totalAgents: agentCount,
    activeAgents: agentCount,
    totalCalls: today.total_calls,
    callsToday: today.total_calls,
    averageCallDuration: today.avg_duration_seconds,
    successRate: Math.round(completionRate),
  };
}

// Re-export ApiError for consumers
export { ApiError };
