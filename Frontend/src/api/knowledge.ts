/**
 * Knowledge Base API Client
 * Production-grade API client for document ingestion
 * 
 * Features:
 * - Type-safe API calls
 * - Error handling with detailed messages
 * - Progress tracking
 * - Retry logic for failed requests
 * - Request/response logging
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import type {
  UploadDocumentRequest,
  UploadDocumentResponse,
  StoreChunksRequest,
  ConfirmIngestionRequest,
  ConfirmIngestionResponse,
  SessionStatusResponse,
  DeleteDocumentResponse,
  ListDocumentsResponse,
  AgentKnowledgeStats,
  SoftDeleteDocumentRequest,
  SoftDeleteDocumentResponse,
  RecoverDocumentResponse,
  ListDeletedDocumentsResponse,
  ChunkAnalytics,
  HotChunk,
  DocumentChunk,
} from "@/types/knowledge";

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_VERSION = "v1";
const API_PREFIX = `/api/${API_VERSION}`;

// ============================================================================
// ERROR HANDLING
// ============================================================================

export class KnowledgeAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: any
  ) {
    super(message);
    this.name = "KnowledgeAPIError";
  }
}

function handleAPIError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: string; message?: string }>;
    const message =
      axiosError.response?.data?.error ||
      axiosError.response?.data?.message ||
      axiosError.message ||
      "An unknown error occurred";
    
    throw new KnowledgeAPIError(
      message,
      axiosError.response?.status,
      axiosError.response?.data
    );
  }
  
  if (error instanceof Error) {
    throw new KnowledgeAPIError(error.message);
  }
  
  throw new KnowledgeAPIError("An unknown error occurred");
}

// ============================================================================
// API CLIENT
// ============================================================================

export class KnowledgeAPI {
  private client: AxiosInstance;

  constructor(baseURL: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL: `${baseURL}${API_PREFIX}`,
      timeout: 300000, // 5 minutes for large file uploads
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
          params: config.params,
          data: config.data instanceof FormData ? "[FormData]" : config.data,
        });
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[API] ✓ ${response.config.method?.toUpperCase()} ${response.config.url}`, {
          status: response.status,
          data: response.data,
        });
        return response;
      },
      (error) => {
        console.error(`[API] ✗ ${error.config?.method?.toUpperCase()} ${error.config?.url}`, {
          status: error.response?.status,
          error: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  // ==========================================================================
  // DOCUMENT INGESTION
  // ==========================================================================

  /**
   * Upload document and start ingestion pipeline
   */
  async uploadDocument(request: UploadDocumentRequest): Promise<UploadDocumentResponse> {
    try {
      const formData = new FormData();
      formData.append("file", request.file);
      if (request.sourceType) {
        formData.append("sourceType", request.sourceType);
      }

      const response = await this.client.post<UploadDocumentResponse>(
        `/documents/ingest`,
        formData,
        {
          params: {
            agent_id: request.agentId,
            organization_id: request.organizationId,
          },
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      return response.data;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  /**
   * Store chunks for preview (internal - called by backend)
   */
  async storeChunksForPreview(request: StoreChunksRequest): Promise<{ success: boolean; chunkCount: number }> {
    try {
      const response = await this.client.post(`/documents/${request.sessionId}/preview`, {
        chunks: request.chunks,
      });

      return response.data;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  /**
   * Confirm ingestion and persist chunks
   */
  async confirmIngestion(request: ConfirmIngestionRequest): Promise<ConfirmIngestionResponse> {
    try {
      const response = await this.client.post<ConfirmIngestionResponse>(
        `/documents/${request.sessionId}/confirm`
      );

      return response.data;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  /**
   * Cancel ingestion session
   */
  async cancelIngestion(sessionId: string): Promise<{ success: boolean }> {
    try {
      const response = await this.client.post(`/documents/${sessionId}/cancel`);
      return response.data;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  /**
   * Get ingestion session status
   */
  async getSessionStatus(sessionId: string): Promise<SessionStatusResponse> {
    try {
      const response = await this.client.get<SessionStatusResponse>(
        `/documents/${sessionId}/status`
      );
      return response.data;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  /**
   * Poll session status until completion or failure
   */
  async pollSessionStatus(
    sessionId: string,
    onProgress?: (status: SessionStatusResponse) => void,
    intervalMs: number = 1000
  ): Promise<SessionStatusResponse> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.getSessionStatus(sessionId);
          
          if (onProgress) {
            onProgress(status);
          }

          if (status.status === "completed") {
            resolve(status);
          } else if (status.status === "failed") {
            reject(new KnowledgeAPIError(status.error || "Ingestion failed"));
          } else {
            setTimeout(poll, intervalMs);
          }
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }

  // ==========================================================================
  // DOCUMENT MANAGEMENT
  // ==========================================================================

  /**
   * List documents for an agent
   */
  async listDocuments(agentId: string): Promise<ListDocumentsResponse> {
    try {
      console.log('[KnowledgeAPI] listDocuments called with agentId:', agentId);
      const response = await this.client.get<ListDocumentsResponse>(`/documents`, {
        params: { agent_id: agentId },
      });
      console.log('[KnowledgeAPI] listDocuments response:', response.data);
      return response.data;
    } catch (error) {
      console.error('[KnowledgeAPI] listDocuments error:', error);
      return handleAPIError(error);
    }
  }

  /**
   * Delete document with cascade
   */
  async deleteDocument(documentId: string): Promise<DeleteDocumentResponse> {
    try {
      const response = await this.client.delete<DeleteDocumentResponse>(
        `/documents/${documentId}`
      );
      return response.data;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  /**
   * Soft delete document (recoverable for 30 days)
   */
  async softDeleteDocument(request: SoftDeleteDocumentRequest): Promise<SoftDeleteDocumentResponse> {
    try {
      const response = await this.client.post<SoftDeleteDocumentResponse>(
        `/documents/${request.documentId}/soft-delete`,
        { reason: request.reason }
      );
      return response.data;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  /**
   * Recover soft-deleted document
   */
  async recoverDocument(documentId: string): Promise<RecoverDocumentResponse> {
    try {
      const response = await this.client.post<RecoverDocumentResponse>(
        `/documents/${documentId}/recover`
      );
      return response.data;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  /**
   * List soft-deleted documents for an agent
   */
  async listDeletedDocuments(agentId: string): Promise<ListDeletedDocumentsResponse> {
    try {
      const response = await this.client.get<ListDeletedDocumentsResponse>(
        `/documents/deleted`,
        { params: { agent_id: agentId } }
      );
      return response.data;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  // ==========================================================================
  // AGENT KNOWLEDGE STATS
  // ==========================================================================

  /**
   * Get agent knowledge base statistics
   */
  async getAgentStats(agentId: string): Promise<AgentKnowledgeStats> {
    try {
      const response = await this.client.get<AgentKnowledgeStats>(
        `/knowledge/agents/${agentId}/stats`
      );
      return response.data;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  /**
   * Get chunk-level analytics for an agent
   */
  async getChunksAnalytics(agentId: string): Promise<ChunkAnalytics> {
    try {
      const response = await this.client.get<ChunkAnalytics>(
        `/knowledge/agents/${agentId}/chunks/analytics`
      );
      return response.data;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  /**
   * Get hot chunks (most accessed) for an agent
   */
  async getHotChunks(agentId: string, limit: number = 10): Promise<HotChunk[]> {
    try {
      const response = await this.client.get<{ hotChunks: HotChunk[] }>(
        `/knowledge/agents/${agentId}/chunks/hot`,
        { params: { limit } }
      );
      return response.data.hotChunks;
    } catch (error) {
      return handleAPIError(error);
    }
  }

  /**
   * Get chunks for a specific document
   */
  async getChunksByDocument(documentId: string): Promise<DocumentChunk[]> {
    try {
      const response = await this.client.get<{ chunks: DocumentChunk[] }>(
        `/knowledge/documents/${documentId}/chunks`
      );
      return response.data.chunks;
    } catch (error) {
      return handleAPIError(error);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const knowledgeAPI = new KnowledgeAPI();

// ============================================================================
// REACT QUERY HOOKS (Production-grade data fetching)
// ============================================================================

export const QUERY_KEYS = {
  documents: (agentId: string) => ["documents", agentId] as const,
  document: (documentId: string) => ["document", documentId] as const,
  deletedDocuments: (agentId: string) => ["deletedDocuments", agentId] as const,
  agentStats: (agentId: string) => ["agentStats", agentId] as const,
  chunksAnalytics: (agentId: string) => ["chunksAnalytics", agentId] as const,
  hotChunks: (agentId: string, limit: number) => ["hotChunks", agentId, limit] as const,
  documentChunks: (documentId: string) => ["documentChunks", documentId] as const,
  sessionStatus: (sessionId: string) => ["sessionStatus", sessionId] as const,
};
