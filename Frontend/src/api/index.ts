/**
 * API Module - Barrel Export
 *
 * Central export for all API-related functionality.
 * Use this for clean imports throughout the application.
 *
 * @example
 * import { agentApi, useAgents, ApiError } from '@/api';
 */

// Core client and configuration
export { apiClient, ApiClient, ApiError } from './client';
export {
  API_CONFIG,
  getApiUrl,
  getVersionedApiUrl,
  getDefaultHeaders,
  getDefaultTenantId,
} from './config';

// API endpoints (for direct API calls)
export {
  // Health
  healthApi,
  // Organizations
  organizationApi,
  // Agents
  agentApi,
  // Calls
  callApi,
  // Knowledge Base
  knowledgeApi,
  // Sessions
  sessionApi,
  // Analytics
  analyticsApi,
} from './endpoints';

// Type exports from endpoints
export type {
  // Organization types
  Organization,
  CreateOrganizationRequest,
  // Agent types
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentResponse,
  ListAgentsResponse,
  // Call types
  CallResponse,
  ListCallsResponse,
  TranscriptMessage,
  TranscriptResponse,
  OutboundCallRequest,
  OutboundCallResponse,
  // Knowledge types
  DocumentUploadResponse,
  DocumentResponse,
  ListDocumentsResponse,
  SearchResult,
  SearchResponse,
  // Session types
  CreateSessionRequest,
  SessionResponse,
  // Analytics types
  TodayStats,
  AnalyticsResponse,
  AgentAnalyticsResponse,
  // Health types
  HealthResponse,
} from './endpoints';

// Data transformation helpers
export {
  toFrontendAgent,
  toFrontendCall,
  toFrontendDocument,
  toFrontendDashboardStats,
} from './endpoints';

// React hooks (for component usage)
export {
  // Health
  useHealthCheck,
  useReadyCheck,
  // Agents
  useAgents,
  useAgent,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  // Calls
  useCalls,
  useCall,
  useCallTranscript,
  useInitiateOutboundCall,
  // Knowledge Base
  useDocuments,
  useUploadDocument,
  useDeleteDocument,
  // Analytics
  useAnalytics,
  useAgentAnalytics,
  // Organizations
  useOrganizations,
  useOrganization,
  useCreateOrganization,
  // Composite
  useDashboard,
  useActiveCalls,
  usePolling,
} from './hooks';

// Mock API (for development/testing)
// Uncomment when mock data is needed
// export * as mockApi from './mockApi';
