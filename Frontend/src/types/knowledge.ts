/**
 * Knowledge Base Type Definitions
 * Production-grade types for document ingestion pipeline
 */

// ============================================================================
// CORE ENTITIES
// ============================================================================

/**
 * Ingestion stages matching backend pipeline
 */
export type IngestionStage =
  | "uploading"
  | "parsing"
  | "chunking"
  | "preview_ready"
  | "confirming"
  | "persisting"
  | "embedding"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Document status in ConvexDB
 */
export type DocumentStatus = "uploading" | "processing" | "preview" | "completed" | "failed";

/**
 * Document entity
 */
export interface Document {
  _id: string;
  documentId: string;
  agentId: string;
  organizationId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  sourceType: string;
  status: DocumentStatus;
  chunkCount: number;
  ragEntryIds?: string[];
  metadata?: Record<string, any>;
  errorMessage?: string;
  uploadedAt: number;
  processedAt?: number;
  // Expiration tracking for preview sessions
  expiresInHours?: number;
  expiresInMinutes?: number;
}

/**
 * Deleted document entity (soft delete)
 */
export interface DeletedDocument {
  _id: string;
  documentId: string;
  agentId: string;
  organizationId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  deletedAt: number;
  deletedBy?: string;
  deletionReason?: string;
  purgeAt: number;
  isPurged: boolean;
  originalMetadata?: Record<string, any>;
}

/**
 * Chunk entity (preview representation)
 */
export interface Chunk {
  chunkIndex: number;
  text: string;
  metadata?: {
    title?: string;
    section?: string;
    pageNumber?: number;
    [key: string]: any;
  };
}

/**
 * Ingestion session
 */
export interface IngestionSession {
  sessionId: string;
  agentId: string;
  organizationId: string;
  fileName: string;
  fileType: string;
  stage: IngestionStage;
  progress?: number; // 0-100
  previewEnabled: boolean;
  chunks?: Chunk[];
  error?: string;
  createdAt: number;
}

/**
 * Agent knowledge statistics
 */
export interface AgentKnowledgeStats {
  exists: boolean;
  totalChunks: number;
  documentCount: number;
  totalSizeBytes: number;
  status: "active" | "deleting" | "deleted" | "unknown";
  lastIngestedAt?: number;
  lastSearchedAt?: number;
}

/**
 * Chunk analytics for an agent
 */
export interface ChunkAnalytics {
  totalChunks: number;
  totalTokens: number;
  avgQualityScore: number;
  totalAccessCount: number;
  avgRelevanceScore: number;
  contentTypeDistribution: {
    text: number;      // chunks without special content
    code: number;      // chunks with code
    table: number;     // chunks with tables
    image: number;     // chunks with images
  };
  qualityScoreDistribution: {
    excellent: number;  // 0.8 - 1.0
    good: number;       // 0.6 - 0.8
    average: number;    // 0.4 - 0.6
    poor: number;       // 0.0 - 0.4
  };
}

/**
 * Hot chunk (most accessed)
 */
export interface HotChunk {
  chunkId: string;
  text: string;
  accessCount: number;
  avgRelevanceScore: number;
  qualityScore: number;
  documentFileName?: string;
  pageNumber?: number;
}

/**
 * Document chunk (for viewing)
 */
export interface DocumentChunk {
  chunkId: string;
  chunkIndex: number;
  text: string;
  tokenCount: number;
  pageNumber?: number;
  sectionTitle?: string;
  qualityScore?: number;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Upload request
 */
export interface UploadDocumentRequest {
  agentId: string;
  organizationId: string;
  file: File;
  sourceType?: string;
}

/**
 * Upload response
 */
export interface UploadDocumentResponse {
  sessionId: string;
  stage: IngestionStage;
  previewEnabled: boolean;
  fileName: string;
  fileSize: number;
}

/**
 * Chunk preview request
 */
export interface StoreChunksRequest {
  sessionId: string;
  chunks: Chunk[];
}

/**
 * Confirm ingestion request
 */
export interface ConfirmIngestionRequest {
  sessionId: string;
}

/**
 * Confirm ingestion response
 */
export interface ConfirmIngestionResponse {
  success: boolean;
  ragIds: string[];
  chunksCreated: number;
}

/**
 * Session status response
 */
export interface SessionStatusResponse {
  sessionId: string;
  fileName: string;
  fileType: string;
  status: DocumentStatus;
  chunkCount: number;
  error?: string;
  metadata?: {
    chunks?: Chunk[];
    totalChunks?: number;
    previewedAt?: number;
  };
}

/**
 * Delete document response
 */
export interface DeleteDocumentResponse {
  success: boolean;
  error?: string;
  deletedChunks?: number;
}

/**
 * List documents response
 */
export interface ListDocumentsResponse {
  documents: Document[];
  total: number;
}

/**
 * Soft delete document request
 */
export interface SoftDeleteDocumentRequest {
  documentId: string;
  reason?: string;
}

/**
 * Soft delete document response
 */
export interface SoftDeleteDocumentResponse {
  success: boolean;
  deletedFile: DeletedDocument;
  message: string;
}

/**
 * Recover document response
 */
export interface RecoverDocumentResponse {
  success: boolean;
  recoveredDocument: Document;
  message: string;
}

/**
 * List deleted documents response
 */
export interface ListDeletedDocumentsResponse {
  deletedFiles: DeletedDocument[];
  total: number;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/**
 * Upload progress state
 */
export interface UploadProgress {
  stage: IngestionStage;
  progress: number;
  message: string;
  error?: string;
}

/**
 * Preview modal state
 */
export interface PreviewState {
  isOpen: boolean;
  sessionId: string | null;
  chunks: Chunk[];
  isConfirming: boolean;
  fileName: string;
}

/**
 * File upload state
 */
export interface FileUploadState {
  file: File | null;
  uploading: boolean;
  sessionId: string | null;
  progress: UploadProgress | null;
  error: string | null;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Stage metadata for progress display
 */
export interface StageMetadata {
  label: string;
  description: string;
  icon: string;
  order: number;
}

/**
 * Stage to metadata mapping
 */
export const STAGE_METADATA: Record<IngestionStage, StageMetadata> = {
  uploading: {
    label: "Uploading",
    description: "Uploading file to server",
    icon: "upload",
    order: 1,
  },
  parsing: {
    label: "Parsing",
    description: "Extracting text from document",
    icon: "file-search",
    order: 2,
  },
  chunking: {
    label: "Chunking",
    description: "Splitting content into segments",
    icon: "split",
    order: 3,
  },
  preview_ready: {
    label: "Preview Ready",
    description: "Chunks ready for review",
    icon: "eye",
    order: 4,
  },
  confirming: {
    label: "Confirming",
    description: "Starting persistence",
    icon: "check-circle",
    order: 5,
  },
  persisting: {
    label: "Persisting",
    description: "Saving to database",
    icon: "database",
    order: 6,
  },
  embedding: {
    label: "Embedding",
    description: "Creating vector embeddings",
    icon: "git-branch",
    order: 7,
  },
  completed: {
    label: "Completed",
    description: "Successfully ingested",
    icon: "check-circle-2",
    order: 8,
  },
  failed: {
    label: "Failed",
    description: "An error occurred",
    icon: "x-circle",
    order: 9,
  },
  cancelled: {
    label: "Cancelled",
    description: "User cancelled",
    icon: "ban",
    order: 10,
  },
};

/**
 * File type icons
 */
export const FILE_TYPE_ICONS: Record<string, string> = {
  ".pdf": "file-text",
  ".docx": "file-text",
  ".doc": "file-text",
  ".txt": "file-text",
  ".md": "file-text",
  ".csv": "table",
  ".xlsx": "table",
  ".xls": "table",
  ".json": "code",
  ".html": "code",
  ".htm": "code",
  default: "file",
};

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format timestamp
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

/**
 * Get file type icon
 */
export function getFileTypeIcon(fileType: string): string {
  return FILE_TYPE_ICONS[fileType.toLowerCase()] || FILE_TYPE_ICONS.default;
}
