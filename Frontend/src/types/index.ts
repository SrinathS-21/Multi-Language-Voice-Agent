// ============================================
// VOICE AGENT DASHBOARD - TYPE DEFINITIONS
// ============================================

// Agent Types
export type AgentStatus = "active" | "inactive" | "busy" | "error";
// Use full locale format (e.g., en-IN, ta-IN) as expected by Sarvam AI SDK
export type AgentLanguage = "en-IN" | "hi-IN" | "ta-IN" | "te-IN" | "kn-IN" | "ml-IN" | "mr-IN" | "bn-IN" | "gu-IN" | "pa-IN";

// Voice Types - Based on Sarvam AI TTS speakers
export type AgentVoice = "anushka" | "vidya" | "manisha" | "arya" | "abhilash" | "karun" | "hitesh";

// Language code to full name mapping
export const LANGUAGE_NAMES: Record<AgentLanguage, string> = {
  'en-IN': 'English',
  'hi-IN': 'Hindi',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam',
  'mr-IN': 'Marathi',
  'bn-IN': 'Bengali',
  'gu-IN': 'Gujarati',
  'pa-IN': 'Punjabi',
};

// Helper to get language name
export function getLanguageName(code: AgentLanguage): string {
  return LANGUAGE_NAMES[code] || 'English';
}

// Voice configuration with display names and characteristics
export const VOICE_CONFIG: Record<AgentVoice, { name: string; gender: 'Female' | 'Male'; description: string }> = {
  'anushka': { name: 'Anushka', gender: 'Female', description: 'Clear and Professional' },
  'vidya': { name: 'Vidya', gender: 'Female', description: 'Warm and Friendly' },
  'manisha': { name: 'Manisha', gender: 'Female', description: 'Energetic and Engaging' },
  'arya': { name: 'Arya', gender: 'Female', description: 'Calm and Soothing' },
  'abhilash': { name: 'Abhilash', gender: 'Male', description: 'Deep and Authoritative' },
  'karun': { name: 'Karun', gender: 'Male', description: 'Professional and Clear' },
  'hitesh': { name: 'Hitesh', gender: 'Male', description: 'Friendly and Approachable' },
};

// Helper to get voice display name
export function getVoiceName(voice: AgentVoice): string {
  return VOICE_CONFIG[voice]?.name || 'Anushka';
}

// Grouped voices for UI selection
export const FEMALE_VOICES: AgentVoice[] = ['anushka', 'vidya', 'manisha', 'arya'];
export const MALE_VOICES: AgentVoice[] = ['abhilash', 'karun', 'hitesh'];

export interface Agent {
  id: string;
  name: string;
  organizationId?: string;
  language: AgentLanguage;
  voice: AgentVoice;
  status: AgentStatus;
  systemPrompt: string;
  aiPersonaName?: string;
  greeting: string;
  farewell: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  phoneLocation?: string;
  enableContextualEnrichment?: boolean;
  numberOfCalls: number;
  createdAt: string;
  updatedAt: string;
  knowledgeBaseIds: string[];
}

export interface CreateAgentPayload {
  name: string;
  organizationId: string;
  language: AgentLanguage;
  voice: AgentVoice;
  aiPersonaName: string;
  systemPrompt: string;
  greeting: string;
  farewell: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  phoneLocation?: string;
  enableContextualEnrichment?: boolean;
}

export interface UpdateAgentPayload extends Partial<CreateAgentPayload> {
  status?: AgentStatus;
}

// Call Types
export type CallStatus = "pending" | "ringing" | "in-progress" | "completed" | "failed" | "no-answer";

export interface Call {
  id: string;
  agentId: string;
  fromNumber: string;
  toNumber: string;
  status: CallStatus;
  duration?: number;
  timestamp: string;
  endedAt?: string;
  transcript?: TranscriptEntry[];
  metadata?: Record<string, unknown>;
}

export interface TranscriptEntry {
  role: "agent" | "user";
  content: string;
  timestamp: string;
}

export interface OutboundCallPayload {
  agentId: string;
  fromNumber: string;
  toNumber: string;
}

// Knowledge Base Types
export type KBDocumentType = "pdf" | "txt" | "docx" | "md" | "json";
export type KBUploadStatus = 
  | "pending" 
  | "uploading" 
  | "processing" 
  | "completed" 
  | "failed" 
  | "preview" 
  | "pending_push"  // Uploaded but not pushed to RAG (24hr window)
  | "pushed";        // Successfully pushed to RAG

export interface KnowledgeBaseDoc {
  id: string;
  agentId: string;
  title: string;
  type: KBDocumentType;
  content?: string;
  size: number;
  uploadedAt: string;
  status: KBUploadStatus;
  chunksCount?: number;
  expiresAt?: string;  // 24hr expiration timestamp for pending_push
  embedCode?: string;  // HTML embed code for iframe
  retryCount?: number; // Track retry attempts
  lastError?: string;  // Last error message
  // Expiration tracking (for preview sessions)
  expiresInHours?: number;
  expiresInMinutes?: number;
  previewData?: {
    sessionId: string;
    fileName: string;
    chunkCount: number;
    chunks?: Array<{
      index: number;
      preview: string;
      characterCount: number;
      metadata?: any;
    }>;
  };
}

export interface KBUploadPayload {
  agentId: string;
  file: File;
  title?: string;
}

export interface KBUploadProgress {
  id: string;
  progress: number;
  status: KBUploadStatus;
  error?: string;
}

// Dashboard Analytics
export interface DashboardStats {
  totalAgents: number;
  activeAgents: number;
  totalCalls: number;
  callsToday: number;
  averageCallDuration: number;
  successRate: number;
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

// Form Types
export interface AgentFormData {
  name: string;
  language: AgentLanguage;
  voice: AgentVoice;
  aiPersonaName: string;
  systemPrompt: string;
  greeting: string;
  farewell: string;
  phoneCountryCode: string;
  phoneNumber: string;
  phoneLocation: string;
}

export interface OutboundCallFormData {
  agentId: string;
  fromNumber: string;
  toNumber: string;
}

// Language Config
export const SUPPORTED_LANGUAGES: Record<AgentLanguage, string> = {
  'en-IN': "English",
  'hi-IN': "Hindi",
  'ta-IN': "Tamil",
  'te-IN': "Telugu",
  'kn-IN': "Kannada",
  'ml-IN': "Malayalam",
  'mr-IN': "Marathi",
  'bn-IN': "Bengali",
  'gu-IN': "Gujarati",
  'pa-IN': "Punjabi",
};

// Status Colors
export const STATUS_COLORS: Record<AgentStatus, string> = {
  active: "bg-green-500",
  inactive: "bg-gray-400",
  busy: "bg-yellow-500",
  error: "bg-red-500",
};

export const CALL_STATUS_COLORS: Record<CallStatus, string> = {
  pending: "bg-gray-400",
  ringing: "bg-blue-400",
  "in-progress": "bg-green-500",
  completed: "bg-green-600",
  failed: "bg-red-500",
  "no-answer": "bg-orange-400",
};
