// ============================================
// VOICE AGENT DASHBOARD - TYPE DEFINITIONS
// ============================================
// Aligned with backend API responses from:
// - src/api/routes/agents.ts
// - src/api/routes/calls.ts
// - src/api/routes/knowledge.ts
// - src/models/session.ts
// ============================================

// Agent Types
export type AgentStatus = "active" | "inactive" | "busy" | "error";
export type AgentLanguage = "en" | "hi" | "ta" | "te" | "kn" | "ml" | "mr" | "bn" | "gu" | "pa";

export interface Agent {
  id: string;
  name: string;
  role: string; // Backend: role field
  language: AgentLanguage;
  status: AgentStatus;
  systemPrompt: string; // Backend: system_prompt
  greeting?: string;
  farewell?: string;
  config?: AgentConfig; // Backend: config JSON
  organizationId?: string; // Backend: organization_id
  numberOfCalls: number;
  callQuota?: number;
  createdAt: string;
  updatedAt?: string;
  knowledgeBaseIds: string[];
}

export interface AgentConfig {
  llmModel?: string;
  llmTemperature?: number;
  voice?: string;
  sttModel?: string;
  ttsModel?: string;
  ttsSpeaker?: string;
  ttsPace?: number;
  [key: string]: unknown;
}

export interface CreateAgentPayload {
  tenant_id: string; // Backend: tenant_id (required)
  name: string;
  role?: string;
  system_prompt?: string; // Backend uses snake_case
  config?: AgentConfig;
}

export interface UpdateAgentPayload {
  name?: string;
  role?: string;
  system_prompt?: string;
  config?: AgentConfig;
}

// Call/Session Types - Aligned with backend SessionStatus & CallType
export type CallStatus = "active" | "completed" | "expired" | "error" | "failed";
export type CallType = "inbound" | "outbound" | "test" | "web";

export interface Call {
  id: string; // Maps to session_id
  sessionId: string;
  agentId?: string;
  agentType?: string;
  organizationId?: string;
  callSid?: string;
  phoneNumber?: string;
  fromNumber?: string;
  toNumber?: string;
  status: CallStatus;
  callType: CallType;
  roomName?: string;
  duration?: number; // duration_seconds
  startedAt: string;
  endedAt?: string;
  transcript?: TranscriptEntry[];
  metadata?: Record<string, unknown>;
}

export interface TranscriptEntry {
  role: "user" | "assistant" | "function";
  content?: string;
  name?: string; // For function calls
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  timestamp: number;
}

export interface OutboundCallPayload {
  organizationId: string;
  agentId: string;
  phoneNumber: string; // E.164 format
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

// Knowledge Base Types - Aligned with backend knowledge routes
export type KBDocumentType = "pdf" | "txt" | "docx" | "md" | "json" | "csv" | "text" | "doc" | "xlsx" | "xls" | "markdown";
export type KBUploadStatus = "pending" | "uploading" | "processing" | "completed" | "failed";

export interface KnowledgeBaseDoc {
  id: string; // document_id
  documentId: string;
  agentId: string;
  title: string;
  filename: string;
  type: KBDocumentType; // file_type
  sourceType?: string; // source_type
  size?: number;
  uploadedAt: string;
  status: KBUploadStatus;
  chunksCount?: number; // chunk_count
  ragEntryIds?: string[]; // rag_entry_ids
}

export interface KBUploadPayload {
  agentId: string;
  file: File;
  sourceType?: string;
}

export interface KBUploadProgress {
  id: string;
  progress: number;
  status: KBUploadStatus;
  error?: string;
}

export interface KBSearchResult {
  chunkText: string;
  score: number;
  entryId: string;
}

// Dashboard Analytics - Aligned with backend analytics routes
export interface DashboardStats {
  totalAgents: number;
  activeAgents: number;
  totalCalls: number;
  callsToday: number;
  completedCalls: number;
  averageCallDuration: number; // avg_duration_seconds
  totalDuration: number; // total_duration_seconds
  successRate: number;
}

export interface AgentAnalytics {
  agentId: string;
  totalCalls: number;
  completedCalls: number;
  completionRate: number;
  avgDurationSeconds: number;
  totalDurationSeconds: number;
  avgLatencyMs?: number;
}

// Organization Types - From backend organizations routes
export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: "active" | "inactive";
  config?: Record<string, unknown>;
  createdAt?: string;
}

// Session Types - From backend sessions routes
export interface Session {
  sessionId: string;
  organizationId: string;
  agentId?: string;
  roomName: string;
  status: CallStatus;
  callType: CallType;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionPayload {
  organization_id: string;
  agent_id?: string;
  room_name?: string;
  call_type?: CallType;
  config?: Record<string, unknown>;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Form State Types
export interface FormState {
  isSubmitting: boolean;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
}

// UI State Types
export interface UIState {
  sidebarOpen: boolean;
  activeModal: string | null;
  notifications: Notification[];
  theme: 'light' | 'dark' | 'system';
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}
