/**
 * React Query Hooks for Knowledge Base
 * Production-grade data fetching with caching, refetching, and optimistic updates
 */

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { knowledgeAPI, QUERY_KEYS } from "@/api/knowledge";
import type {
  UploadDocumentRequest,
  ConfirmIngestionRequest,
  SessionStatusResponse,
  SoftDeleteDocumentRequest,
} from "@/types/knowledge";

// ============================================================================
// DOCUMENT QUERIES
// ============================================================================

/**
 * Fetch documents for an agent
 */
export function useDocuments(agentId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.documents(agentId),
    queryFn: () => knowledgeAPI.listDocuments(agentId),
    staleTime: 10000, // 10 seconds
    enabled: !!agentId,
  });
}

/**
 * Fetch agent knowledge statistics
 */
export function useAgentStats(agentId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.agentStats(agentId),
    queryFn: () => knowledgeAPI.getAgentStats(agentId),
    staleTime: 30000, // 30 seconds
    enabled: !!agentId,
  });
}

/**
 * Fetch session status
 */
export function useSessionStatus(sessionId: string | null, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: QUERY_KEYS.sessionStatus(sessionId!),
    queryFn: () => knowledgeAPI.getSessionStatus(sessionId!),
    enabled: !!sessionId,
    refetchInterval: options?.refetchInterval || false,
  });
}

// ============================================================================
// DOCUMENT MUTATIONS
// ============================================================================

/**
 * Upload document mutation
 */
export function useUploadDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: UploadDocumentRequest) => knowledgeAPI.uploadDocument(request),
    onSuccess: (data, variables) => {
      // Invalidate documents list for this agent
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.documents(variables.agentId),
      });
      
      // Invalidate agent stats
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.agentStats(variables.agentId),
      });
    },
  });
}

/**
 * Confirm ingestion mutation
 */
export function useConfirmIngestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ConfirmIngestionRequest) => knowledgeAPI.confirmIngestion(request),
    onSuccess: () => {
      // Invalidate all documents and stats
      queryClient.invalidateQueries({
        queryKey: ["documents"],
      });
      queryClient.invalidateQueries({
        queryKey: ["agentStats"],
      });
    },
  });
}

/**
 * Cancel ingestion mutation
 */
export function useCancelIngestion() {
  return useMutation({
    mutationFn: (sessionId: string) => knowledgeAPI.cancelIngestion(sessionId),
  });
}

/**
 * Delete document mutation
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => knowledgeAPI.deleteDocument(documentId),
    onSuccess: () => {
      // Invalidate all documents and stats
      queryClient.invalidateQueries({
        queryKey: ["documents"],
      });
      queryClient.invalidateQueries({
        queryKey: ["agentStats"],
      });
    },
  });
}

// ============================================================================
// SOFT DELETE MUTATIONS
// ============================================================================

/**
 * Soft delete document mutation (recoverable for 30 days)
 */
export function useSoftDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: SoftDeleteDocumentRequest) => knowledgeAPI.softDeleteDocument(request),
    onSuccess: (_data, _variables) => {
      // Invalidate documents list
      queryClient.invalidateQueries({
        queryKey: ["documents"],
      });
      
      // Invalidate deleted documents list
      queryClient.invalidateQueries({
        queryKey: ["deletedDocuments"],
      });
      
      // Invalidate agent stats
      queryClient.invalidateQueries({
        queryKey: ["agentStats"],
      });
    },
  });
}

/**
 * Recover soft-deleted document mutation
 */
export function useRecoverDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => knowledgeAPI.recoverDocument(documentId),
    onSuccess: () => {
      // Invalidate both lists
      queryClient.invalidateQueries({
        queryKey: ["documents"],
      });
      queryClient.invalidateQueries({
        queryKey: ["deletedDocuments"],
      });
      queryClient.invalidateQueries({
        queryKey: ["agentStats"],
      });
    },
  });
}

/**
 * Fetch deleted documents for an agent
 */
export function useDeletedDocuments(agentId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.deletedDocuments(agentId),
    queryFn: () => knowledgeAPI.listDeletedDocuments(agentId),
    staleTime: 10000, // 10 seconds
    enabled: !!agentId,
  });
}

// ============================================================================
// CHUNK ANALYTICS QUERIES
// ============================================================================

/**
 * Fetch chunk analytics for an agent
 */
export function useChunksAnalytics(agentId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.chunksAnalytics(agentId),
    queryFn: () => knowledgeAPI.getChunksAnalytics(agentId),
    staleTime: 30000, // 30 seconds
    enabled: !!agentId,
  });
}

/**
 * Fetch hot chunks (most accessed) for an agent
 */
export function useHotChunks(agentId: string, limit: number = 10) {
  return useQuery({
    queryKey: QUERY_KEYS.hotChunks(agentId, limit),
    queryFn: () => knowledgeAPI.getHotChunks(agentId, limit),
    staleTime: 30000, // 30 seconds
    enabled: !!agentId,
  });
}

/**
 * Fetch chunks for a specific document
 */
export function useChunksByDocument(documentId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.documentChunks(documentId!),
    queryFn: () => knowledgeAPI.getChunksByDocument(documentId!),
    staleTime: 60000, // 1 minute - chunks don't change often
    enabled: !!documentId,
  });
}

// ============================================================================
// POLLING HOOK
// ============================================================================

/**
 * Poll session status until completion
 */
export function usePollSessionStatus(
  sessionId: string | null,
  onProgress?: (status: SessionStatusResponse) => void
) {
  return useQuery({
    queryKey: QUERY_KEYS.sessionStatus(sessionId!),
    queryFn: async () => {
      if (!sessionId) return null;
      
      const status = await knowledgeAPI.getSessionStatus(sessionId);
      
      if (onProgress) {
        onProgress(status);
      }
      
      return status;
    },
    enabled: !!sessionId,
    refetchInterval: (query) => {
      // Stop polling if completed or failed
      if (!query.state.data || query.state.data.status === "completed" || query.state.data.status === "failed") {
        return false;
      }
      return 1000; // Poll every second
    },
    retry: 3,
  });
}
