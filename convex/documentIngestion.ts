/**
 * Document Ingestion Orchestrator - Production Pipeline
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE: Parse → Chunk → Preview (Optional) → Persist → Embed
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * DESIGN PRINCIPLES:
 * 1. Parsing & chunking are STATELESS and DETERMINISTIC
 * 2. Preview is a SOFT GATE (removable via flag)
 * 3. DB writes are the ONLY irreversible operation
 * 4. All operations are tracked with progress states
 * 5. Failures stop DB writes (no partial data)
 * 
 * FLOW:
 * ┌─────────────┐
 * │ Upload File │
 * └──────┬──────┘
 *        │
 *        ▼
 * ┌──────────────────┐
 * │  Parse Document  │ ◄── Stateless, reusable
 * └──────┬───────────┘
 *        │
 *        ▼
 * ┌──────────────────┐
 * │  Chunk Content   │ ◄── Stateless, deterministic
 * └──────┬───────────┘
 *        │
 *        ▼
 * ┌──────────────────────────────┐
 * │  Preview (Optional Gate)     │ ◄── Can be disabled via flag
 * │  - Show chunks to user       │
 * │  - Wait for confirmation     │
 * └──────┬───────────────────────┘
 *        │
 *        ▼
 * ┌──────────────────┐
 * │  Persist to DB   │ ◄── IRREVERSIBLE: Document + Chunks
 * └──────┬───────────┘
 *        │
 *        ▼
 * ┌──────────────────┐
 * │ Create Embeddings│ ◄── Vector embeddings in RAG
 * └──────┬───────────┘
 *        │
 *        ▼
 * ┌──────────────────┐
 * │   Update Agent   │ ◄── Agent ↔ KB mapping
 * │    Metadata      │
 * └──────────────────┘
 * 
 * @module convex/documentIngestion
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server.js";
import { api, internal } from "./_generated/api.js";
import { rag } from "./rag.js";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ingestion stages for progress tracking
 */
export const INGESTION_STAGES = {
    UPLOADING: "uploading",           // File being uploaded
    PARSING: "parsing",               // Document parsing in progress
    CHUNKING: "chunking",             // Content chunking in progress
    PREVIEW_READY: "preview_ready",   // Chunks ready for preview (soft gate)
    CONFIRMING: "confirming",         // User confirmed, starting persistence
    PERSISTING: "persisting",         // Saving to database
    EMBEDDING: "embedding",           // Creating vector embeddings
    COMPLETED: "completed",           // Successfully completed
    FAILED: "failed",                 // Failed at any stage
    CANCELLED: "cancelled",           // User cancelled during preview
} as const;

/**
 * Feature flags
 */
const FEATURE_FLAGS = {
    ENABLE_PREVIEW: true,  // Set to false to skip preview gate
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// INGESTION SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create ingestion session
 * Tracks progress through the pipeline
 */
export const createIngestionSession = mutation({
    args: {
        agentId: v.string(),
        organizationId: v.string(),
        fileName: v.string(),
        fileType: v.string(),
        fileSize: v.number(),
        sourceType: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const sessionId = crypto.randomUUID();
        const now = Date.now();

        // Create ingestion session (preview workflow)
        await ctx.db.insert("ingestionSessions", {
            sessionId: sessionId,
            agentId: args.agentId,
            organizationId: args.organizationId,
            fileName: args.fileName,
            fileType: args.fileType,
            fileSize: args.fileSize,
            sourceType: args.sourceType || "general",
            stage: "uploading",
            progress: 0,
            createdAt: now,
            expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
        });

        return {
            sessionId,
            stage: INGESTION_STAGES.UPLOADING,
            previewEnabled: FEATURE_FLAGS.ENABLE_PREVIEW,
        };
    },
});

/**
 * Update ingestion stage
 */
export const updateIngestionStage = internalMutation({
    args: {
        sessionId: v.string(),
        stage: v.string(),
        progress: v.optional(v.number()), // 0-100
        error: v.optional(v.string()),
        metadata: v.optional(v.string()), // JSON metadata
    },
    handler: async (ctx, args) => {
        console.log('[updateIngestionStage] Called with:', {
            sessionId: args.sessionId,
            stage: args.stage,
            progress: args.progress,
        });

        const session = await ctx.db
            .query("ingestionSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) {
            // Session might be already completed and cleaned up
            console.log('[updateIngestionStage] Session not found (likely already completed):', args.sessionId);
            return { success: true }; // Gracefully ignore
        }

        console.log('[updateIngestionStage] Current session stage:', session.stage);

        // Update session stage and metadata
        const updatePayload = {
            stage: args.stage as any, // Stage validation handled by schema
            progress: args.progress,
            errorMessage: args.error,
            ...(args.metadata && { previewMetadata: args.metadata }),
            ...(args.stage === INGESTION_STAGES.PREVIEW_READY && { previewedAt: Date.now() }),
            ...(args.stage === INGESTION_STAGES.CONFIRMING && { confirmedAt: Date.now() }),
            ...(args.stage === INGESTION_STAGES.COMPLETED && { completedAt: Date.now() }),
        };

        console.log('[updateIngestionStage] Updating with payload:', updatePayload);

        await ctx.db.patch(session._id, updatePayload);

        // Verify the update
        const updated = await ctx.db.get(session._id);
        console.log('[updateIngestionStage] After update, stage is:', updated?.stage);

        return { success: true };
    },
});

/**
 * Get ingestion session by sessionId (internal - detailed info)
 */
export const getIngestionSession = internalQuery({
    args: { sessionId: v.string() },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("ingestionSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) {
            return null;
        }

        return {
            sessionId: session.sessionId,
            agentId: session.agentId,
            organizationId: session.organizationId,
            fileName: session.fileName,
            fileType: session.fileType,
            stage: session.stage,
            progress: session.progress,
            chunkCount: session.chunkCount,
            error: session.errorMessage,
            documentId: session.documentId,
            previewChunks: session.previewChunks,
            metadata: session.previewMetadata ? JSON.parse(session.previewMetadata) : null,
        };
    },
});

/**
 * Get ingestion session status (public - for API)
 */
export const getIngestionSessionStatus = query({
    args: { sessionId: v.string() },
    handler: async (ctx, args) => {
        console.log('[getIngestionSessionStatus] Querying for sessionId:', args.sessionId);

        const session = await ctx.db
            .query("ingestionSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) {
            console.log('[getIngestionSessionStatus] Session not found');
            return null;
        }

        console.log('[getIngestionSessionStatus] Found session:', {
            sessionId: session.sessionId,
            stage: session.stage,
            chunkCount: session.chunkCount,
            hasPreviewChunks: !!session.previewChunks,
        });

        return {
            sessionId: session.sessionId,
            fileName: session.fileName,
            fileType: session.fileType,
            stage: session.stage,
            progress: session.progress,
            chunkCount: session.chunkCount,
            error: session.errorMessage,
            documentId: session.documentId,
            previewChunks: session.previewChunks ? JSON.parse(session.previewChunks) : null,
        };
    },
});

/**
 * List ingestion sessions by agent (for pending/preview documents)
 */
export const listSessionsByAgent = query({
    args: { agentId: v.string() },
    handler: async (ctx, args) => {
        // Get sessions that are still in progress or ready for preview
        // Exclude completed, failed, and cancelled sessions
        const sessions = await ctx.db
            .query("ingestionSessions")
            .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
            .collect();

        // Filter to only show active sessions (not completed/failed/cancelled)
        const activeSessions = sessions.filter(s => 
            s.stage !== INGESTION_STAGES.COMPLETED && 
            s.stage !== INGESTION_STAGES.FAILED && 
            s.stage !== INGESTION_STAGES.CANCELLED
        );

        return activeSessions.map(session => {
            // Calculate expiration: 24 hours from creation
            const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
            const expiresAt = session.expiresAt || (session.createdAt + TWENTY_FOUR_HOURS_MS);
            const now = Date.now();
            const timeRemainingMs = Math.max(0, expiresAt - now);
            const hoursRemaining = Math.floor(timeRemainingMs / (60 * 60 * 1000));
            const minutesRemaining = Math.floor((timeRemainingMs % (60 * 60 * 1000)) / (60 * 1000));

            return {
                sessionId: session.sessionId,
                fileName: session.fileName,
                fileType: session.fileType,
                fileSize: session.fileSize,
                stage: session.stage,
                chunkCount: session.chunkCount,
                sourceType: session.sourceType,
                createdAt: session.createdAt,
                uploadedAt: session.uploadedAt,
                previewedAt: session.previewedAt,
                errorMessage: session.errorMessage,
                previewChunks: session.previewChunks,
                // Expiration info
                expiresAt,
                timeRemainingMs,
                expiresInHours: hoursRemaining,
                expiresInMinutes: minutesRemaining,
            };
        });
    },
});

/**
 * Convert confirmed ingestion session to permanent document
 * Called after user confirms preview
 */
export const convertSessionToDocument = internalMutation({
    args: {
        sessionId: v.string(),
        chunkCount: v.number(),
        ragEntryIds: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        // Get session
        const session = await ctx.db
            .query("ingestionSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();
        
        if (!session) {
            throw new Error(`Session not found: ${args.sessionId}`);
        }
        
        // Create permanent document
        const _documentId = await ctx.db.insert("documents", {
            documentId: session.sessionId,
            organizationId: session.organizationId,
            agentId: session.agentId,
            fileName: session.fileName,
            fileType: session.fileType,
            fileSize: session.fileSize,
            sourceType: session.sourceType,
            status: "completed",
            chunkCount: args.chunkCount,
            ragEntryIds: args.ragEntryIds,
            uploadedAt: session.uploadedAt || session.createdAt,
            processedAt: Date.now(),
        });
        
        // Update session with document link
        await ctx.db.patch(session._id, {
            documentId: session.sessionId,
            completedAt: Date.now(),
            stage: "completed",
        });
        
        return { documentId: session.sessionId };
    },
});

// ═══════════════════════════════════════════════════════════════════════════
// PREVIEW MANAGEMENT (SOFT GATE)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Store parsed chunks for preview
 * This is the soft gate - data stays in session until confirmed
 */
export const storeChunksForPreview = internalMutation({
    args: {
        sessionId: v.string(),
        chunks: v.array(v.object({
            chunkIndex: v.number(),
            text: v.string(),
            metadata: v.optional(v.string()), // JSON
        })),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("ingestionSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) {
            throw new Error(`Session not found: ${args.sessionId}`);
        }

        // Store chunks in preview data
        const _previewData = {
            chunks: args.chunks,
            totalChunks: args.chunks.length,
            previewedAt: Date.now(),
        };

        await ctx.db.patch(session._id, {
            previewChunks: JSON.stringify(args.chunks),
            previewMetadata: JSON.stringify({ totalChunks: args.chunks.length }),
            chunkCount: args.chunks.length,
            stage: "preview_ready",
            previewedAt: Date.now(),
        });

        return {
            success: true,
            chunkCount: args.chunks.length,
        };
    },
});

/**
 * Confirm chunks and proceed with persistence (internal)
 * This is where the preview gate opens
 */
export const confirmAndPersist = internalAction({
    args: {
        sessionId: v.string(),
    },
    handler: async (ctx, args): Promise<{
        success: boolean;
        ragIds: string[];
        chunksCreated: number;
    }> => {
        // Update stage
        await ctx.runMutation(internal.documentIngestion.updateIngestionStage, {
            sessionId: args.sessionId,
            stage: INGESTION_STAGES.CONFIRMING,
        });

        // Get session data
        const session = await ctx.runQuery(internal.documentIngestion.getIngestionSession, {
            sessionId: args.sessionId,
        });

        // Check if session not found - might be already completed
        if (!session) {
            // Check if document already exists (completed ingestion)
            const existingDoc = await ctx.runQuery(api.documents.getByDocumentId, {
                documentId: args.sessionId,
            });

            if (existingDoc && existingDoc.status === 'completed') {
                console.log('[confirmAndPersist] Session already completed, returning existing result');
                return {
                    success: true,
                    ragIds: existingDoc.ragEntryIds || [],
                    chunksCreated: existingDoc.ragEntryIds?.length || 0,
                };
            }

            throw new Error("Session not found");
        }

        // Parse chunks from previewChunks JSON string
        let chunks: any[];
        if (session.previewChunks) {
            // previewChunks is already a string, parse it
            chunks = typeof session.previewChunks === 'string' 
                ? JSON.parse(session.previewChunks) 
                : session.previewChunks;
        } else if (session.metadata?.chunks) {
            chunks = session.metadata.chunks;
        } else {
            throw new Error("No chunks found for session");
        }

        console.log('[confirmAndPersist] Found chunks:', chunks.length);

        const agentId = session.agentId;
        const organizationId = session.organizationId;

        try {
            // Step 1: Create permanent document record
            await ctx.runMutation(internal.documentIngestion.convertSessionToDocument, {
                sessionId: args.sessionId,
                chunkCount: chunks.length,
                ragEntryIds: [], // Will be updated in finalizeIngestion
            });

            // Step 2: Persist to RAG (this is the irreversible operation)
            await ctx.runMutation(internal.documentIngestion.updateIngestionStage, {
                sessionId: args.sessionId,
                stage: INGESTION_STAGES.PERSISTING,
            });

            const ragIds = await persistChunksToRAG(ctx, agentId, organizationId, args.sessionId, chunks);

            // Step 3: Update document with RAG IDs
            await ctx.runMutation(internal.documentIngestion.finalizeIngestion, {
                sessionId: args.sessionId,
                ragIds,
            });

            // Update agent metadata
            await ctx.runMutation(internal.ragManagement.updateAgentMetadata, {
                agentId: agentId,
                organizationId: organizationId,
                chunksAdded: chunks.length,
                documentsAdded: 1,
                sizeBytes: chunks.reduce((sum: number, c: any) => sum + (c.text?.length || 0), 0) * 2,
            });

            // Mark ingestion as completed
            await ctx.runMutation(internal.documentIngestion.updateIngestionStage, {
                sessionId: args.sessionId,
                stage: INGESTION_STAGES.COMPLETED,
            });

            // Cleanup: Delete the ingestionSession (temporary storage no longer needed)
            await ctx.runMutation(internal.documentIngestion.cleanupCompletedSession, {
                sessionId: args.sessionId,
            });

            console.log('[confirmAndPersist] Successfully persisted', chunks.length, 'chunks to RAG');

            return {
                success: true,
                ragIds,
                chunksCreated: chunks.length,
            };
        } catch (error) {
            console.error('[confirmAndPersist] Error during persistence:', error);
            
            // ROLLBACK: Delete the document record if it was created
            try {
                await ctx.runMutation(internal.documentIngestion.deleteDocumentRecord, {
                    documentId: args.sessionId,
                });
                console.log('[confirmAndPersist] Rolled back document creation');
            } catch (rollbackError) {
                console.error('[confirmAndPersist] Failed to rollback document:', rollbackError);
            }
            
            // Mark session as failed
            await ctx.runMutation(internal.documentIngestion.updateIngestionStage, {
                sessionId: args.sessionId,
                stage: INGESTION_STAGES.FAILED,
                error: error instanceof Error ? error.message : String(error),
            });

            throw error;
        }
    },
});

/**
 * Confirm chunks and proceed with persistence (public API)
 */
export const confirmIngestion = action({
    args: {
        sessionId: v.string(),
    },
    handler: async (ctx, args): Promise<{
        success: boolean;
        ragIds: string[];
        chunksCreated: number;
    }> => {
        return await ctx.runAction(internal.documentIngestion.confirmAndPersist, {
            sessionId: args.sessionId,
        });
    },
});

/**
 * Helper: Persist chunks to RAG
 */
async function persistChunksToRAG(
    ctx: any,
    agentId: string,
    organizationId: string,
    documentId: string,
    chunks: any[]
): Promise<string[]> {
    const ragIds: string[] = [];
    const batchSize = 10;

    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        
        const promises = batch.map(async (chunk: any) => {
            // Parse metadata first
            const chunkMetadata = chunk.metadata ? (
                typeof chunk.metadata === 'string' ? JSON.parse(chunk.metadata) : chunk.metadata
            ) : {};

            // Add to RAG vector store with metadata
            // IMPORTANT: Pass as chunks array to prevent RAG from re-chunking
            // We already chunked the content optimally, RAG should just embed it
            const result = await rag.add(ctx, {
                namespace: agentId, // Correct: Use agentId as namespace
                chunks: [{
                    text: chunk.text,
                    metadata: {
                        chunkIndex: chunk.chunkIndex,
                        documentId: documentId,
                        pageNumber: chunkMetadata.pageNumber,
                        sectionTitle: chunkMetadata.sectionTitle,
                        title: chunkMetadata.title,
                    },
                }],
                key: `${documentId}_chunk_${chunk.chunkIndex}`,
                title: chunkMetadata.title || chunkMetadata.sectionTitle,
            });

            // DUAL STORAGE: Also store in chunks table for metadata tracking

            await ctx.runMutation(internal.documentIngestion.storeChunkMetadata, {
                chunkId: `${documentId}_chunk_${chunk.chunkIndex}`,
                documentId: documentId,
                organizationId: organizationId,
                agentId: agentId,
                text: chunk.text,
                tokenCount: Math.ceil(chunk.text.length / 4), // Rough estimate: 1 token ≈ 4 chars
                chunkIndex: chunk.chunkIndex,
                totalChunks: chunks.length,
                ragEntryId: result.entryId,
                ragNamespace: agentId,
                pageNumber: chunkMetadata.pageNumber,
                qualityScore: chunkMetadata.qualityScore,
            });

            return result.entryId;
        });

        const batchIds = await Promise.all(promises);
        ragIds.push(...batchIds);
    }

    return ragIds;
}

/**
 * Store chunk metadata in chunks table (internal)
 * Part of dual storage pattern - stores metadata alongside RAG vectors
 */
export const storeChunkMetadata = internalMutation({
    args: {
        chunkId: v.string(),
        documentId: v.string(),
        organizationId: v.string(),
        agentId: v.string(),
        text: v.string(),
        tokenCount: v.number(),
        chunkIndex: v.number(),
        totalChunks: v.number(),
        ragEntryId: v.string(),
        ragNamespace: v.string(),
        pageNumber: v.optional(v.number()),
        qualityScore: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("chunks", {
            chunkId: args.chunkId,
            documentId: args.documentId,
            organizationId: args.organizationId,
            agentId: args.agentId,
            text: args.text,
            tokenCount: args.tokenCount,
            chunkIndex: args.chunkIndex,
            totalChunks: args.totalChunks,
            ragEntryId: args.ragEntryId,
            ragNamespace: args.ragNamespace,
            pageNumber: args.pageNumber,
            qualityScore: args.qualityScore,
            createdAt: Date.now(),
        });
    },
});

/**
 * Finalize ingestion (internal)
 */
export const finalizeIngestion = internalMutation({
    args: {
        sessionId: v.string(),
        ragIds: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        const doc = await ctx.db
            .query("documents")
            .withIndex("by_document_id", (q) => q.eq("documentId", args.sessionId))
            .unique();

        if (!doc) {
            throw new Error(`Session not found: ${args.sessionId}`);
        }

        await ctx.db.patch(doc._id, {
            status: "completed",
            ragEntryIds: args.ragIds,
            processedAt: Date.now(),
        });

        return { success: true };
    },
});

/**
 * Cancel ingestion session
 * No DB writes were made, just clean up the session
 */
/**
 * Cancel ingestion - Delete session and all temporary data
 * This clears the ingestionSession (temporary storage)
 */
export const cancelIngestion = mutation({
    args: { sessionId: v.string() },
    handler: async (ctx, args) => {
        console.log('[cancelIngestion] Cancelling session:', args.sessionId);

        // Find the ingestion session
        const session = await ctx.db
            .query("ingestionSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) {
            console.log('[cancelIngestion] Session not found:', args.sessionId);
            return { success: false, error: 'Session not found' };
        }

        console.log('[cancelIngestion] Found session, stage:', session.stage);

        // Mark as cancelled
        await ctx.db.patch(session._id, {
            stage: INGESTION_STAGES.CANCELLED,
            errorMessage: "Cancelled by user",
        });

        // Delete the session (cleanup temporary storage)
        await ctx.db.delete(session._id);

        console.log('[cancelIngestion] Session cancelled and deleted');

        return { success: true };
    },
});

/**
 * Cleanup completed ingestion session (internal helper)
 * Called after successful RAG persistence to remove temporary storage
 */
export const cleanupCompletedSession = internalMutation({
    args: { sessionId: v.string() },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("ingestionSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) {
            console.log('[cleanupCompletedSession] Session not found:', args.sessionId);
            return { success: false };
        }

        // Only delete if stage is COMPLETED (safety check)
        if (session.stage === INGESTION_STAGES.COMPLETED) {
            await ctx.db.delete(session._id);
            console.log('[cleanupCompletedSession] Successfully deleted completed session:', args.sessionId);
            return { success: true };
        }

        console.log('[cleanupCompletedSession] Session not in COMPLETED stage:', session.stage);
        return { success: false };
    },
});

// ═══════════════════════════════════════════════════════════════════════════
// NO-PREVIEW MODE (DIRECT PERSISTENCE)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Direct ingestion (skip preview)
 * Used when ENABLE_PREVIEW = false
 * Same parsing/chunking logic, but auto-confirms
 */
export const ingestDirect = action({
    args: {
        sessionId: v.string(),
        chunks: v.array(v.object({
            chunkIndex: v.number(),
            text: v.string(),
            metadata: v.optional(v.string()),
        })),
    },
    handler: async (ctx, args): Promise<{
        success: boolean;
        ragIds: string[];
        chunksCreated: number;
    }> => {
        // Store chunks in metadata
        await ctx.runMutation(internal.documentIngestion.storeChunksForPreview, {
            sessionId: args.sessionId,
            chunks: args.chunks,
        });

        // Auto-confirm (uses the same confirmAndPersist which now correctly gets agentId)
        return await ctx.runAction(internal.documentIngestion.confirmAndPersist, {
            sessionId: args.sessionId,
        });
    },
});

// ═══════════════════════════════════════════════════════════════════════════
// CASCADE DELETE (DATA INTEGRITY)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get document directly using the documentId index (internal)
 * Simple and efficient - uses proper index lookup
 */
export const getDocumentDirect = internalQuery({
    args: { documentId: v.string() },
    handler: async (ctx, args) => {
        console.log('[getDocumentDirect] Looking for documentId:', args.documentId);
        
        // Use the index for efficient lookup
        const doc = await ctx.db
            .query("documents")
            .withIndex("by_document_id", (q) => q.eq("documentId", args.documentId))
            .unique();
        
        if (doc) {
            console.log('[getDocumentDirect] ✓ Found document:', doc.fileName);
            return {
                documentId: doc.documentId,
                agentId: doc.agentId,
                organizationId: doc.organizationId,
                fileName: doc.fileName,
                fileType: doc.fileType,
                chunkCount: doc.chunkCount,
                ragEntryIds: doc.ragEntryIds,
            };
        }
        
        console.log('[getDocumentDirect] ✗ Document not found');
        
        // Debug: list all documents
        const allDocs = await ctx.db.query("documents").collect();
        console.log('[getDocumentDirect] Total docs in DB:', allDocs.length);
        allDocs.forEach((d: any) => {
            console.log(`  - "${d.documentId}" (${d.fileName})`);
        });
        
        return null;
    },
});

/**
 * Cancel ingestion session (internal version)
 */
export const cancelIngestionInternal = internalMutation({
    args: { sessionId: v.string() },
    handler: async (ctx, args) => {
        console.log('[cancelIngestionInternal] Cancelling session:', args.sessionId);

        const session = await ctx.db
            .query("ingestionSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) {
            console.log('[cancelIngestionInternal] Session not found');
            return { success: false, error: 'Session not found' };
        }

        // Delete the session
        await ctx.db.delete(session._id);
        console.log('[cancelIngestionInternal] Session deleted');
        
        return { success: true };
    },
});

/**
 * Get document (not session) by documentId or fileName (internal)
 * For deletion and document management operations
 * Handles both new documents with proper documentId field and older documents
 */
export const getDocument = internalQuery({
    args: { documentId: v.string() },
    handler: async (ctx, args) => {
        console.log('=== [getDocument] START ===');
        console.log('[getDocument] Looking for document with ID:', args.documentId);
        console.log('[getDocument] DocumentId type:', typeof args.documentId);
        console.log('[getDocument] DocumentId length:', args.documentId.length);
        
        // Get all documents and log them to debug
        const allDocs = await ctx.db.query("documents").collect();
        console.log('[getDocument] Total documents in DB:', allDocs.length);
        
        // Log ALL documents for debugging
        console.log('[getDocument] All documents in DB:');
        allDocs.forEach((doc: any, index: number) => {
            console.log(`  [${index}] documentId: "${doc.documentId}" | fileName: "${doc.fileName}" | status: "${doc.status}"`);
            console.log(`      documentId type: ${typeof doc.documentId} | length: ${doc.documentId?.length}`);
            console.log(`      Exact match?: ${doc.documentId === args.documentId}`);
        });
        
        // Try finding by documentId field first - use exact string comparison
        const doc = allDocs.find((d: any) => {
            const match = d.documentId === args.documentId;
            console.log(`[getDocument] Comparing: "${d.documentId}" === "${args.documentId}" => ${match}`);
            return match;
        });
        
        if (doc) {
            console.log('[getDocument] ✓ Found by documentId field');
            return {
                documentId: doc.documentId,
                agentId: doc.agentId,
                organizationId: doc.organizationId,
                fileName: doc.fileName,
                fileType: doc.fileType,
                chunkCount: doc.chunkCount,
                ragEntryIds: doc.ragEntryIds,
            };
        }

        // Also try using the index directly
        console.log('[getDocument] Trying with index by_document_id...');
        const indexDoc = await ctx.db
            .query("documents")
            .withIndex("by_document_id", (q) => q.eq("documentId", args.documentId))
            .unique();
        
        if (indexDoc) {
            console.log('[getDocument] ✓ Found using index!');
            return {
                documentId: indexDoc.documentId,
                agentId: indexDoc.agentId,
                organizationId: indexDoc.organizationId,
                fileName: indexDoc.fileName,
                fileType: indexDoc.fileType,
                chunkCount: indexDoc.chunkCount,
                ragEntryIds: indexDoc.ragEntryIds,
            };
        }

        console.log('[getDocument] ✗ Document NOT found after all search attempts');
        console.log('=== [getDocument] END ===');
        
        return null;
    },
});

/**
 * Delete document with cascade
 * Removes: Document record + All chunks + All embeddings + Updates agent metadata
 */
export const deleteDocumentCascade = action({
    args: {
        documentId: v.string(),
    },
    handler: async (ctx, args): Promise<{
        success: boolean;
        error?: string;
        deletedChunks?: number;
    }> => {
        console.log('[deleteDocumentCascade] Starting deletion for documentId:', args.documentId);
        
        // Try to get document details - first try the documents table directly
        const docDetails = await ctx.runQuery(internal.documentIngestion.getDocumentDirect, {
            documentId: args.documentId,
        });

        console.log('[deleteDocumentCascade] getDocumentDirect result:', docDetails);

        // If not found, also try looking in ingestionSessions (maybe it's a pending session)
        if (!docDetails) {
            console.log('[deleteDocumentCascade] Document not in documents table, checking ingestionSessions...');
            const session = await ctx.runQuery(internal.documentIngestion.getIngestionSession, {
                sessionId: args.documentId,
            });
            
            if (session) {
                console.log('[deleteDocumentCascade] Found in ingestionSessions:', session.sessionId);
                // It's a pending session - cancel it instead
                await ctx.runMutation(internal.documentIngestion.cancelIngestionInternal, {
                    sessionId: args.documentId,
                });
                return { success: true, deletedChunks: 0 };
            }
            
            console.log('[deleteDocumentCascade] Not found in either table');
            return { success: false, error: "Document not found in documents or ingestionSessions table" };
        }

        try {
            // Step 1: Delete chunks from chunks table
            console.log('[deleteDocumentCascade] Step 1: Deleting chunks...');
            await ctx.runMutation(internal.documentIngestion.deleteChunksByDocument, {
                documentId: args.documentId,
            });

            // Step 2: Delete RAG entries
            if (docDetails.ragEntryIds && docDetails.ragEntryIds.length > 0) {
                console.log('[deleteDocumentCascade] Step 2: Deleting', docDetails.ragEntryIds.length, 'RAG entries...');
                for (const ragId of docDetails.ragEntryIds) {
                    try {
                        await rag.delete(ctx, { entryId: ragId as any });
                    } catch (e) {
                        console.log(`[deleteDocumentCascade] Failed to delete RAG entry ${ragId}:`, e);
                    }
                }
            }

            // Step 3: Delete document record
            console.log('[deleteDocumentCascade] Step 3: Deleting document record...');
            await ctx.runMutation(internal.documentIngestion.deleteDocumentRecord, {
                documentId: args.documentId,
            });

            // Update agent metadata
            console.log('[deleteDocumentCascade] Step 4: Updating agent metadata...');
            await ctx.runMutation(internal.ragManagement.updateAgentMetadata, {
                agentId: docDetails.agentId,
                organizationId: docDetails.organizationId,
                chunksAdded: -(docDetails.chunkCount || 0),
                documentsAdded: -1,
                sizeBytes: 0,
            });

            console.log('[deleteDocumentCascade] Deletion complete!');
            return {
                success: true,
                deletedChunks: docDetails.chunkCount || 0,
            };
        } catch (error) {
            console.error('[deleteDocumentCascade] Error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    },
});

/**
 * Delete document record (internal)
 */
export const deleteDocumentRecord = internalMutation({
    args: { documentId: v.string() },
    handler: async (ctx, args) => {
        const doc = await ctx.db
            .query("documents")
            .withIndex("by_document_id", (q) => q.eq("documentId", args.documentId))
            .unique();

        if (doc) {
            await ctx.db.delete(doc._id);
        }

        return { success: true };
    },
});

/**
 * Delete all chunks for a document (internal)
 */
export const deleteChunksByDocument = internalMutation({
    args: { documentId: v.string() },
    handler: async (ctx, args) => {
        const chunks = await ctx.db
            .query("chunks")
            .withIndex("by_document_id", (q) => q.eq("documentId", args.documentId))
            .collect();

        for (const chunk of chunks) {
            await ctx.db.delete(chunk._id);
        }

        console.log(`[deleteChunksByDocument] Deleted ${chunks.length} chunks for document ${args.documentId}`);
        return { success: true, deletedCount: chunks.length };
    },
});

/**
 * Get chunks for a document (for viewing confirmed document chunks)
 */
export const getChunksByDocument = query({
    args: { documentId: v.string() },
    handler: async (ctx, args) => {
        const chunks = await ctx.db
            .query("chunks")
            .withIndex("by_document_id", (q) => q.eq("documentId", args.documentId))
            .collect();

        // Sort by chunkIndex to maintain order
        const sortedChunks = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

        return sortedChunks.map(chunk => ({
            chunkId: chunk.chunkId,
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            tokenCount: chunk.tokenCount,
            pageNumber: chunk.pageNumber,
            sectionTitle: chunk.sectionTitle,
            qualityScore: chunk.qualityScore,
        }));
    },
});

/**
 * Cleanup expired ingestion sessions (internal)
 * Called by cron job daily to remove stale preview data
 * Sessions expire after 24 hours if not confirmed
 */
export const cleanupExpiredSessions = internalMutation({
    args: {},
    handler: async (ctx, _args) => {
        const now = Date.now();
        
        // Find expired sessions
        const expiredSessions = await ctx.db
            .query("ingestionSessions")
            .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
            .take(100); // Process 100 at a time

        let deletedCount = 0;
        const errors: string[] = [];

        for (const session of expiredSessions) {
            try {
                // Delete the session
                await ctx.db.delete(session._id);
                deletedCount++;
            } catch (error) {
                console.error(`Failed to delete session ${session.sessionId}:`, error);
                errors.push(`${session.sessionId}: ${error}`);
            }
        }

        return {
            success: true,
            deletedCount,
            errors: errors.length > 0 ? errors : undefined,
            message: `Cleaned up ${deletedCount} expired sessions`,
        };
    },
});