/**
 * API Adapter
 * 
 * Switches between mock API and real API based on environment configuration.
 * This provides a unified interface for the stores to use.
 */

import { Agent, Call, KnowledgeBaseDoc, DashboardStats, CreateAgentPayload, UpdateAgentPayload, OutboundCallPayload, KBUploadPayload, ApiResponse } from '@/types';
import { agentApi as mockAgentApi, callApi as mockCallApi, knowledgeBaseApi as mockKBApi, dashboardApi as mockDashboardApi } from './mockApi';
import { agentApi as realAgentApi, callApi as realCallApi, knowledgeApi as realKBApi, analyticsApi as realAnalyticsApi, toFrontendAgent, toFrontendCall, toFrontendDocument, toFrontendDashboardStats } from './endpoints';
import { getDefaultTenantId } from './config';

// Check if we should use mock API (dev mode)
const USE_MOCK_API = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

// =============================================================================
// Agent API Adapter
// =============================================================================

export const agentApiAdapter = {
  getAll: async (): Promise<ApiResponse<Agent[]>> => {
    if (USE_MOCK_API) {
      return mockAgentApi.getAll();
    }
    
    try {
      console.log("[agentApiAdapter] Fetching agents with tenantId:", getDefaultTenantId());
      const response = await realAgentApi.list(getDefaultTenantId());
      console.log("[agentApiAdapter] API response:", response);
      const agents = response.agents.map(toFrontendAgent);
      console.log("[agentApiAdapter] Converted agents:", agents);
      return {
        success: true,
        data: agents,
      };
    } catch (err) {
      console.error("[agentApiAdapter] Error fetching agents:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to fetch agents',
      };
    }
  },

  getById: async (id: string): Promise<ApiResponse<Agent>> => {
    if (USE_MOCK_API) {
      return mockAgentApi.getById(id);
    }
    
    try {
      const response = await realAgentApi.getById(id);
      return {
        success: true,
        data: toFrontendAgent(response),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to fetch agent',
      };
    }
  },

  create: async (payload: CreateAgentPayload): Promise<ApiResponse<Agent>> => {
    if (USE_MOCK_API) {
      return mockAgentApi.create(payload);
    }
    
    try {
      const response = await realAgentApi.create({
        tenant_id: payload.organizationId || getDefaultTenantId(),
        name: payload.name,
        role: 'assistant',
        system_prompt: payload.systemPrompt || '',
        ai_persona_name: payload.aiPersonaName,
        greeting: payload.greeting,
        farewell: payload.farewell,
        language: payload.language,
        phone_country_code: payload.phoneCountryCode,
        phone_number: payload.phoneNumber,
        phone_location: payload.phoneLocation,
        enable_contextual_enrichment: payload.enableContextualEnrichment ?? true,
        config: {
          language: payload.language,
          voice: payload.voice,
          pace: 0.85,        // Default speech pace
        },
      });
      return {
        success: true,
        data: toFrontendAgent(response.agent),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create agent',
      };
    }
  },

  update: async (id: string, payload: UpdateAgentPayload): Promise<ApiResponse<Agent>> => {
    if (USE_MOCK_API) {
      return mockAgentApi.update(id, payload);
    }
    
    try {
      await realAgentApi.update(id, {
        name: payload.name,
        system_prompt: payload.systemPrompt,
        ai_persona_name: payload.aiPersonaName,
        greeting: payload.greeting,
        farewell: payload.farewell,
        language: payload.language,
        phone_country_code: payload.phoneCountryCode,
        phone_number: payload.phoneNumber,
        phone_location: payload.phoneLocation,
        enable_contextual_enrichment: payload.enableContextualEnrichment,
        config: payload.voice ? {
          language: payload.language,
          voice: payload.voice,
          pace: 0.85,        // Default speech pace
        } : undefined,
      });
      // Refetch the agent to get the updated data
      const updated = await realAgentApi.getById(id);
      return {
        success: true,
        data: toFrontendAgent(updated),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update agent',
      };
    }
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    if (USE_MOCK_API) {
      return mockAgentApi.delete(id);
    }
    
    try {
      await realAgentApi.delete(id);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete agent',
      };
    }
  },

  toggleStatus: async (id: string): Promise<ApiResponse<Agent>> => {
    if (USE_MOCK_API) {
      return mockAgentApi.toggleStatus(id);
    }
    
    // Use the new updateStatus endpoint
    try {
      const agent = await realAgentApi.getById(id);
      const currentStatus = toFrontendAgent(agent).status;
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      
      console.log('🔄 Toggling agent status:', { id, currentStatus, newStatus });
      
      const updateResponse = await realAgentApi.updateStatus(id, newStatus);
      console.log('✅ Update response:', updateResponse);
      
      const updated = await realAgentApi.getById(id);
      const updatedAgent = toFrontendAgent(updated);
      console.log('📥 Updated agent:', { id: updatedAgent.id, status: updatedAgent.status });
      
      return {
        success: true,
        data: updatedAgent,
      };
    } catch (err) {
      console.error('❌ Toggle status error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to toggle agent status',
      };
    }
  },
};

// =============================================================================
// Call API Adapter
// =============================================================================

export const callApiAdapter = {
  getAll: async (): Promise<ApiResponse<Call[]>> => {
    if (USE_MOCK_API) {
      return mockCallApi.getAll();
    }
    
    try {
      const response = await realCallApi.list({ limit: 100 });
      return {
        success: true,
        data: response.items.map(toFrontendCall),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to fetch calls',
      };
    }
  },

  getByAgentId: async (agentId: string): Promise<ApiResponse<Call[]>> => {
    if (USE_MOCK_API) {
      return mockCallApi.getByAgentId(agentId);
    }
    
    try {
      // Backend doesn't filter by agentId directly, so we filter client-side
      const response = await realCallApi.list({ limit: 100 });
      const filtered = response.items
        .map(toFrontendCall)
        .filter(call => call.agentId === agentId);
      return {
        success: true,
        data: filtered,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to fetch calls',
      };
    }
  },

  initiateCall: async (payload: OutboundCallPayload): Promise<ApiResponse<Call>> => {
    if (USE_MOCK_API) {
      return mockCallApi.initiateOutbound(payload);
    }
    
    try {
      const response = await realCallApi.initiateOutbound({
        organizationId: getDefaultTenantId(),
        agentId: payload.agentId,
        phoneNumber: payload.toNumber,
      });
      
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Failed to initiate call',
        };
      }
      
      // Return a minimal Call object
      return {
        success: true,
        data: {
          id: response.callId || '',
          agentId: payload.agentId,
          fromNumber: payload.fromNumber,
          toNumber: payload.toNumber,
          status: 'pending',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to initiate call',
      };
    }
  },

  endCall: async (id: string): Promise<ApiResponse<void>> => {
    if (USE_MOCK_API) {
      // Mock API returns Call, but we only need success status
      const result = await mockCallApi.endCall(id);
      return { success: result.success, error: result.error };
    }
    
    // Real API endpoint for ending calls - may need to implement
    return { success: true };
  },
};

// =============================================================================
// Knowledge Base API Adapter
// =============================================================================

export const knowledgeBaseApiAdapter = {
  getByAgentId: async (agentId: string): Promise<ApiResponse<KnowledgeBaseDoc[]>> => {
    if (USE_MOCK_API) {
      return mockKBApi.getByAgentId(agentId);
    }
    
    try {
      console.log('[KB Adapter] Fetching documents for agent:', agentId);
      const response = await realKBApi.listDocuments(agentId);
      console.log('[KB Adapter] Backend response:', response);
      
      const mappedDocs = response.documents.map((doc) => ({
        ...toFrontendDocument(doc),
        agentId,
      }));
      console.log('[KB Adapter] Mapped documents:', mappedDocs);
      
      return {
        success: true,
        data: mappedDocs,
      };
    } catch (err) {
      console.error('[KB Adapter] Error fetching documents:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to fetch documents',
      };
    }
  },

  upload: async (
    payload: KBUploadPayload,
    onProgress?: (progress: number, stage?: string, message?: string) => void
  ): Promise<ApiResponse<KnowledgeBaseDoc>> => {
    if (USE_MOCK_API) {
      return mockKBApi.upload(payload, onProgress);
    }
    
    try {
      // Start upload - NON-BLOCKING approach
      console.log('📤 Starting upload:', payload.file.name);
      if (onProgress) {
        onProgress(10, 'uploading', 'Uploading file...');
      }
      
      const response = await realKBApi.uploadDocument(payload.agentId, payload.file);
      const sessionId = response.sessionId;
      console.log('✅ Upload initiated, sessionId:', sessionId);
      
      // Return immediately with "processing" status
      // The document will appear in the list right away
      // Backend processes it asynchronously
      if (onProgress) {
        onProgress(100, 'processing', 'Processing in background...');
      }
      
      return {
        success: true,
        data: {
          id: sessionId,
          agentId: payload.agentId,
          title: payload.file.name,
          type: 'txt' as const,
          size: payload.file.size,
          status: 'processing' as any, // Will show as "processing" in the list
          uploadedAt: new Date().toISOString(),
          chunksCount: 0,
        },
      };
    } catch (err) {
      console.error('❌ Upload error:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to upload document',
      };
    }
  },

  delete: async (documentId: string): Promise<ApiResponse<void>> => {
    if (USE_MOCK_API) {
      return mockKBApi.delete(documentId);
    }
    
    try {
      await realKBApi.deleteDocument(documentId);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete document',
      };
    }
  },

  confirmDocument: async (sessionId: string): Promise<ApiResponse<void>> => {
    if (USE_MOCK_API) {
      // Mock API doesn't have this method
      return { success: true };
    }
    
    try {
      await realKBApi.confirmDocument(sessionId);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to confirm document',
      };
    }
  },

  cancelDocument: async (sessionId: string): Promise<ApiResponse<void>> => {
    if (USE_MOCK_API) {
      // Mock API doesn't have this method
      return { success: true };
    }
    
    try {
      await realKBApi.cancelDocument(sessionId);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to cancel document',
      };
    }
  },

  getSessionStatus: async (sessionId: string): Promise<ApiResponse<KnowledgeBaseDoc>> => {
    if (USE_MOCK_API) {
      // Mock API doesn't have this method
      return { 
        success: true, 
        data: {
          id: sessionId,
          agentId: 'mock',
          title: 'Mock Document',
          type: 'txt',
          size: 0,
          status: 'completed',
          uploadedAt: new Date().toISOString(),
        }
      };
    }
    
    try {
      const status = await realKBApi.getSessionStatus(sessionId);
      console.log('📊 Session status fetched:', {
        sessionId,
        stage: status.stage,
        chunkCount: status.chunkCount,
        hasPreviewChunks: !!status.previewChunks,
      });

      // Map backend stage to frontend status
      const stageToStatus: Record<string, KnowledgeBaseDoc['status']> = {
        'uploading': 'uploading',
        'parsing': 'processing',
        'chunking': 'processing',
        'preview_ready': 'preview',
        'confirming': 'processing',
        'persisting': 'processing',
        'embedding': 'processing',
        'completed': 'completed',
        'failed': 'failed',
        'cancelled': 'failed',
      };

      return {
        success: true,
        data: {
          id: sessionId,
          agentId: '', // Will be filled by caller
          title: status.fileName,
          type: 'txt' as const,
          size: 0, // Not available in status
          status: stageToStatus[status.stage] || 'processing',
          uploadedAt: new Date().toISOString(),
          chunksCount: status.chunkCount,
          previewData: status.stage === 'preview_ready' && status.previewChunks ? {
            sessionId,
            fileName: status.fileName,
            chunkCount: status.chunkCount || 0,
            chunks: status.previewChunks,
          } : undefined,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to get session status',
      };
    }
  },
};

// =============================================================================
// Dashboard API Adapter
// =============================================================================

export const dashboardApiAdapter = {
  getStats: async (): Promise<ApiResponse<DashboardStats>> => {
    if (USE_MOCK_API) {
      return mockDashboardApi.getStats();
    }
    
    try {
      const [analytics, agents] = await Promise.all([
        realAnalyticsApi.getOverview({ tenantId: getDefaultTenantId() }),
        realAgentApi.list(getDefaultTenantId()),
      ]);
      
      return {
        success: true,
        data: toFrontendDashboardStats(analytics, agents.agents.length),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to fetch dashboard stats',
      };
    }
  },
};

// =============================================================================
// Export for store use
// =============================================================================

export const agentApi = agentApiAdapter;
export const callApi = callApiAdapter;
export const knowledgeBaseApi = knowledgeBaseApiAdapter;
export const dashboardApi = dashboardApiAdapter;
