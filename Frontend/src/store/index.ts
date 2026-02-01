// ============================================
// ZUSTAND STORE - Global State Management
// ============================================

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import {
  Agent,
  Call,
  KnowledgeBaseDoc,
  DashboardStats,
  CreateAgentPayload,
  UpdateAgentPayload,
  OutboundCallPayload,
  KBUploadPayload,
} from "@/types";
import { agentApi, callApi, knowledgeBaseApi, dashboardApi } from "@/api/adapter";

// ============================================
// AGENT STORE
// ============================================

interface AgentState {
  agents: Agent[];
  currentAgent: Agent | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchAgents: () => Promise<void>;
  fetchAgent: (id: string) => Promise<void>;
  createAgent: (payload: CreateAgentPayload) => Promise<Agent | null>;
  updateAgent: (id: string, payload: UpdateAgentPayload) => Promise<Agent | null>;
  deleteAgent: (id: string) => Promise<boolean>;
  toggleAgentStatus: (id: string) => Promise<void>;
  clearCurrentAgent: () => void;
  clearError: () => void;
}

export const useAgentStore = create<AgentState>()(
  devtools(
    (set, _get) => ({
      agents: [],
      currentAgent: null,
      isLoading: false,
      error: null,

      fetchAgents: async () => {
        set({ isLoading: true, error: null });
        try {
          console.log("[useAgentStore] fetchAgents called");
          const response = await agentApi.getAll();
          console.log("[useAgentStore] fetchAgents response:", response);
          if (response.success && response.data) {
            console.log("[useAgentStore] Setting agents:", response.data);
            set({ agents: response.data });
          } else {
            console.error("[useAgentStore] API returned error:", response.error);
            set({ error: response.error || "Failed to fetch agents" });
          }
        } catch (error) {
          console.error("[useAgentStore] fetchAgents exception:", error);
          set({ error: "Network error" });
        } finally {
          set({ isLoading: false });
        }
      },

      fetchAgent: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await agentApi.getById(id);
          if (response.success && response.data) {
            set({ currentAgent: response.data });
          } else {
            set({ error: response.error || "Failed to fetch agent" });
          }
        } catch {
          set({ error: "Network error" });
        } finally {
          set({ isLoading: false });
        }
      },

      createAgent: async (payload: CreateAgentPayload) => {
        set({ isLoading: true, error: null });
        try {
          const response = await agentApi.create(payload);
          if (response.success && response.data) {
            set((state) => ({
              agents: [...state.agents, response.data!],
            }));
            return response.data;
          } else {
            set({ error: response.error || "Failed to create agent" });
            return null;
          }
        } catch {
          set({ error: "Network error" });
          return null;
        } finally {
          set({ isLoading: false });
        }
      },

      updateAgent: async (id: string, payload: UpdateAgentPayload) => {
        set({ isLoading: true, error: null });
        try {
          const response = await agentApi.update(id, payload);
          if (response.success && response.data) {
            set((state) => ({
              agents: state.agents.map((a) => (a.id === id ? response.data! : a)),
              currentAgent: state.currentAgent?.id === id ? response.data : state.currentAgent,
            }));
            return response.data;
          } else {
            set({ error: response.error || "Failed to update agent" });
            return null;
          }
        } catch {
          set({ error: "Network error" });
          return null;
        } finally {
          set({ isLoading: false });
        }
      },

      deleteAgent: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await agentApi.delete(id);
          if (response.success) {
            set((state) => ({
              agents: state.agents.filter((a) => a.id !== id),
              currentAgent: state.currentAgent?.id === id ? null : state.currentAgent,
            }));
            return true;
          } else {
            set({ error: response.error || "Failed to delete agent" });
            return false;
          }
        } catch {
          set({ error: "Network error" });
          return false;
        } finally {
          set({ isLoading: false });
        }
      },

      toggleAgentStatus: async (id: string) => {
        try {
          console.log('🏪 Store: Toggling agent status for', id);
          const response = await agentApi.toggleStatus(id);
          console.log('🏪 Store: Toggle response', response);
          
          if (response.success && response.data) {
            console.log('🏪 Store: Updating state with new agent', response.data);
            set((state) => ({
              agents: state.agents.map((a) => (a.id === id ? response.data! : a)),
              currentAgent: state.currentAgent?.id === id ? response.data : state.currentAgent,
            }));
          } else {
            console.error('🏪 Store: Toggle failed', response.error);
            set({ error: response.error || "Failed to update agent status" });
          }
        } catch (err) {
          console.error('🏪 Store: Toggle exception', err);
          set({ error: "Failed to update agent status" });
        }
      },

      clearCurrentAgent: () => set({ currentAgent: null }),
      clearError: () => set({ error: null }),
    }),
    { name: "agent-store" }
  )
);

// ============================================
// CALL STORE
// ============================================

interface CallState {
  calls: Call[];
  currentCall: Call | null;
  activeCall: Call | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchCalls: () => Promise<void>;
  fetchCallsByAgent: (agentId: string) => Promise<void>;
  initiateCall: (payload: OutboundCallPayload) => Promise<Call | null>;
  endCall: (id: string) => Promise<void>;
  setActiveCall: (call: Call | null) => void;
  clearError: () => void;
}

export const useCallStore = create<CallState>()(
  devtools(
    (set) => ({
      calls: [],
      currentCall: null,
      activeCall: null,
      isLoading: false,
      error: null,

      fetchCalls: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await callApi.getAll();
          if (response.success && response.data) {
            set({ calls: response.data });
          } else {
            set({ error: response.error || "Failed to fetch calls" });
          }
        } catch {
          set({ error: "Network error" });
        } finally {
          set({ isLoading: false });
        }
      },

      fetchCallsByAgent: async (agentId: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await callApi.getByAgentId(agentId);
          if (response.success && response.data) {
            set({ calls: response.data });
          } else {
            set({ error: response.error || "Failed to fetch calls" });
          }
        } catch {
          set({ error: "Network error" });
        } finally {
          set({ isLoading: false });
        }
      },

      initiateCall: async (payload: OutboundCallPayload) => {
        set({ isLoading: true, error: null });
        try {
          const response = await callApi.initiateCall(payload);
          if (response.success && response.data) {
            set((state) => ({
              calls: [response.data!, ...state.calls],
              activeCall: response.data,
            }));
            return response.data;
          } else {
            set({ error: response.error || "Failed to initiate call" });
            return null;
          }
        } catch {
          set({ error: "Network error" });
          return null;
        } finally {
          set({ isLoading: false });
        }
      },

      endCall: async (id: string) => {
        try {
          const response = await callApi.endCall(id);
          if (response.success && response.data) {
            set((state) => ({
              calls: state.calls.map((c) => (c.id === id ? response.data! : c)),
              activeCall: state.activeCall?.id === id ? null : state.activeCall,
            }));
          }
        } catch {
          set({ error: "Network error" });
        }
      },

      setActiveCall: (call: Call | null) => set({ activeCall: call }),
      clearError: () => set({ error: null }),
    }),
    { name: "call-store" }
  )
);

// ============================================
// KNOWLEDGE BASE STORE
// ============================================

interface KBState {
  documents: KnowledgeBaseDoc[];
  uploadProgress: Record<string, number>;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchDocsByAgent: (agentId: string) => Promise<void>;
  uploadDocument: (payload: KBUploadPayload) => Promise<KnowledgeBaseDoc | null>;
  uploadStage: string | null;
  uploadMessage: string | null;
  deleteDocument: (id: string) => Promise<boolean>;
  confirmDocument: (sessionId: string) => Promise<boolean>;
  cancelDocument: (sessionId: string) => Promise<boolean>;
  getSessionStatus: (sessionId: string, agentId: string) => Promise<KnowledgeBaseDoc | null>;
  setUploadProgress: (id: string, progress: number) => void;
  clearError: () => void;
}

export const useKBStore = create<KBState>()(
  devtools(
    (set) => ({
      documents: [],
      uploadProgress: {},
      uploadStage: null,
      uploadMessage: null,
      isLoading: false,
      error: null,

      fetchDocsByAgent: async (agentId: string) => {
        console.log('[Store] fetchDocsByAgent called with agentId:', agentId);
        set({ isLoading: true, error: null });
        try {
          const response = await knowledgeBaseApi.getByAgentId(agentId);
          console.log('[Store] fetchDocsByAgent response:', response);
          if (response.success && response.data) {
            console.log('[Store] Setting documents:', response.data);
            set({ documents: response.data });
          } else {
            console.error('[Store] fetchDocsByAgent error:', response.error);
            set({ error: response.error || "Failed to fetch documents" });
          }
        } catch (err) {
          console.error('[Store] fetchDocsByAgent network error:', err);
          set({ error: "Network error" });
        } finally {
          set({ isLoading: false });
        }
      },

      uploadDocument: async (payload: KBUploadPayload) => {
        const uploadId = `upload-${Date.now()}`;
        set((state) => ({
          isLoading: true,
          error: null,
          uploadProgress: { ...state.uploadProgress, [uploadId]: 0 },
          uploadStage: 'uploading',
          uploadMessage: 'Starting upload...',
        }));

        try {
          const response = await knowledgeBaseApi.upload(payload, (progress, stage, message) => {
            set((state) => ({
              uploadProgress: { ...state.uploadProgress, [uploadId]: progress },
              uploadStage: stage || state.uploadStage,
              uploadMessage: message || state.uploadMessage,
            }));
          });

          if (response.success && response.data) {
            set((state) => ({
              documents: [...state.documents, response.data!],
              uploadStage: null,
              uploadMessage: null,
            }));
            return response.data;
          } else {
            set({ error: response.error || "Failed to upload document", uploadStage: null, uploadMessage: null });
            return null;
          }
        } catch {
          set({ error: "Network error", uploadStage: null, uploadMessage: null });
          return null;
        } finally {
          set((state) => {
            const { [uploadId]: _removed, ...rest } = state.uploadProgress;
            return { isLoading: false, uploadProgress: rest };
          });
        }
      },

      deleteDocument: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await knowledgeBaseApi.delete(id);
          if (response.success) {
            set((state) => ({
              documents: state.documents.filter((d) => d.id !== id),
            }));
            return true;
          } else {
            set({ error: response.error || "Failed to delete document" });
            return false;
          }
        } catch {
          set({ error: "Network error" });
          return false;
        } finally {
          set({ isLoading: false });
        }
      },

      confirmDocument: async (sessionId: string) => {
        set({ isLoading: true, error: null });
        try {
          await knowledgeBaseApi.confirmDocument(sessionId);
          // Document was confirmed, will be persisted to RAG
          // Remove temporary preview doc from list
          set((state) => ({
            documents: state.documents.filter((d) => d.id !== sessionId),
          }));
          return true;
        } catch {
          set({ error: "Failed to confirm document" });
          return false;
        } finally {
          set({ isLoading: false });
        }
      },

      cancelDocument: async (sessionId: string) => {
        set({ isLoading: true, error: null });
        try {
          await knowledgeBaseApi.cancelDocument(sessionId);
          // Remove from documents list
          set((state) => ({
            documents: state.documents.filter((d) => d.id !== sessionId),
          }));
          return true;
        } catch {
          set({ error: "Failed to cancel document" });
          return false;
        } finally {
          set({ isLoading: false });
        }
      },

      getSessionStatus: async (sessionId: string, agentId: string) => {
        try {
          const response = await knowledgeBaseApi.getSessionStatus(sessionId);
          if (response.success && response.data) {
            const updatedDoc = { ...response.data, agentId };
            // Update document in list
            set((state) => ({
              documents: state.documents.map((d) =>
                d.id === sessionId ? updatedDoc : d
              ),
            }));
            return updatedDoc;
          }
          return null;
        } catch {
          return null;
        }
      },

      setUploadProgress: (id: string, progress: number) => {
        set((state) => ({
          uploadProgress: { ...state.uploadProgress, [id]: progress },
        }));
      },

      clearError: () => set({ error: null }),
    }),
    { name: "kb-store" }
  )
);

// ============================================
// DASHBOARD STORE
// ============================================

interface DashboardState {
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;

  fetchStats: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>()(
  devtools(
    (set) => ({
      stats: null,
      isLoading: false,
      error: null,

      fetchStats: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await dashboardApi.getStats();
          if (response.success && response.data) {
            set({ stats: response.data });
          } else {
            set({ error: response.error || "Failed to fetch stats" });
          }
        } catch {
          set({ error: "Network error" });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    { name: "dashboard-store" }
  )
);

// ============================================
// UI STORE
// ============================================

interface UIState {
  isNewAgentModalOpen: boolean;
  isOutboundCallModalOpen: boolean;
  selectedAgentForCall: string | null;
  sidebarOpen: boolean;

  // Actions
  openNewAgentModal: () => void;
  closeNewAgentModal: () => void;
  openOutboundCallModal: (agentId?: string) => void;
  closeOutboundCallModal: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      isNewAgentModalOpen: false,
      isOutboundCallModalOpen: false,
      selectedAgentForCall: null,
      sidebarOpen: true,

      openNewAgentModal: () => set({ isNewAgentModalOpen: true }),
      closeNewAgentModal: () => set({ isNewAgentModalOpen: false }),
      openOutboundCallModal: (agentId?: string) =>
        set({ isOutboundCallModalOpen: true, selectedAgentForCall: agentId || null }),
      closeOutboundCallModal: () =>
        set({ isOutboundCallModalOpen: false, selectedAgentForCall: null }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    }),
    { name: "ui-store" }
  )
);
