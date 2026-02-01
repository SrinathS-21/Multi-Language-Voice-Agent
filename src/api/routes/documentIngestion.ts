/**
 * Document Ingestion API - Production Endpoint
 * 
 * Implements the complete ingestion pipeline with progress tracking
 * 
 * POST /api/v1/documents/ingest
 * - Upload file
 * - Parse & chunk (deterministic)
 * - Return preview data OR auto-persist
 * 
 * POST /api/v1/documents/:sessionId/confirm
 * - Confirm chunks and persist to DB
 * 
 * DELETE /api/v1/documents/:documentId
 * - Cascade delete (document + chunks + embeddings)
 * 
 * GET /api/v1/documents?agent_id=xxx
 * - List agent documents
 * 
 * GET /api/v1/documents/:sessionId/status
 * - Get ingestion progress
 */

import { RequestContext, sendJson, sendError, parseMultipartBody } from '../server.js';
import { logger } from '../../core/logging.js';
import { getConvexClient } from '../../core/convex-client.js';
import { getDocumentParser } from '../../services/document-parser/index.js';
import { getChunkingService, analyzeContentType } from '../../services/chunking.js';
import * as fs from 'fs';
import * as path from 'path';

export async function handleDocumentIngestionRoutes(ctx: RequestContext): Promise<void> {
    const { pathname, method, query, res, req } = ctx;
    const convex = getConvexClient();

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/v1/documents/ingest
    // ═══════════════════════════════════════════════════════════════════════
    if (pathname === '/api/v1/documents/ingest' && method === 'POST') {
        const agentId = query.agent_id;
        const organizationId = query.organization_id || 'default_org';
        const sourceType = query.source_type || 'general';

        if (!agentId) {
            sendError(res, 'agent_id query parameter is required', 400);
            return;
        }

        try {
            // Parse multipart form data
            const { files } = await parseMultipartBody(req);
            if (files.length === 0) {
                sendError(res, 'No file uploaded', 400);
                return;
            }

            const file = files[0];
            const fileName = file.filename;
            const fileSize = file.data.length;
            const fileType = path.extname(fileName);

            logger.info('Starting document ingestion', { fileName, agentId, fileSize });

            // Step 1: Create ingestion session
            const session = await convex.mutation('documentIngestion:createIngestionSession', {
                agentId,
                organizationId,
                fileName,
                fileType,
                fileSize,
                sourceType,
            });

            const sessionId = session.sessionId;
            const previewEnabled = session.previewEnabled;

            // Step 2: Update stage to PARSING
            await convex.mutation('documentIngestion:updateIngestionStage', {
                sessionId,
                stage: 'parsing',
            });

            // Save temp file for parsing
            const tempDir = process.env.TEMP || '/tmp';
            const tempPath = path.join(tempDir, `${sessionId}_${fileName}`);
            fs.writeFileSync(tempPath, file.data);

            let parsedContent: string;
            let structuredElements: any[] = [];

            try {
                // Step 3: Parse document (STATELESS, DETERMINISTIC)
                logger.info(`Parsing document: ${fileName}`);
                const documentParser = getDocumentParser();
                const parsed = await documentParser.parseFile(tempPath);

                if (!parsed.content) {
                    throw new Error('Document parsing returned empty content');
                }

                parsedContent = parsed.content;
                structuredElements = parsed.structuredElements || [];

                logger.info(`Parsing complete: ${parsedContent.length} chars, ${structuredElements.length} elements`);

                // Step 4: Update stage to CHUNKING
                await convex.mutation('documentIngestion:updateIngestionStage', {
                    sessionId,
                    stage: 'chunking',
                });

                // Step 5: Chunk content (STATELESS, DETERMINISTIC)
                logger.info('Chunking document...');
                const chunkingService = getChunkingService();
                let chunks: { text: string; chunkIndex: number; metadata: any }[];

                if (structuredElements.length > 0) {
                    const contentType = analyzeContentType(structuredElements);
                    chunks = chunkingService.chunkDocumentIntelligent(
                        structuredElements,
                        contentType,
                        [fileName]
                    );
                } else {
                    const cleanedText = chunkingService.cleanText(parsedContent);
                    chunks = chunkingService.chunkText(cleanedText, {
                        filename: fileName,
                        sourceType,
                    });
                }

                logger.info(`Chunking complete: ${chunks.length} chunks`);

                // Step 6: Decision point - Preview or Direct Persist
                if (previewEnabled) {
                    // PREVIEW MODE: Store chunks temporarily, wait for confirmation
                    await convex.mutation('documentIngestion:updateIngestionStage', {
                        sessionId,
                        stage: 'preview_ready',
                    });

                    await convex.mutation('documentIngestion:storeChunksForPreview', {
                        sessionId,
                        chunks: chunks.map(c => ({
                            chunkIndex: c.chunkIndex,
                            text: c.text,
                            metadata: JSON.stringify(c.metadata || {}),
                        })),
                    });

                    // Return preview data
                    sendJson(res, {
                        success: true,
                        sessionId,
                        previewEnabled: true,
                        fileName,
                        chunkCount: chunks.length,
                        chunks: chunks.map(c => ({
                            index: c.chunkIndex,
                            preview: c.text.substring(0, 200) + (c.text.length > 200 ? '...' : ''),
                            characterCount: c.text.length,
                            metadata: c.metadata,
                        })),
                        message: 'Document parsed and chunked. Call /confirm to persist.',
                    }, 200);
                } else {
                    // DIRECT MODE: Auto-persist without preview
                    logger.info('Preview disabled, auto-persisting...');

                    const result = await convex.action('documentIngestion:ingestDirect', {
                        sessionId,
                        chunks: chunks.map(c => ({
                            chunkIndex: c.chunkIndex,
                            text: c.text,
                            metadata: JSON.stringify(c.metadata || {}),
                        })),
                    });

                    sendJson(res, {
                        success: true,
                        sessionId,
                        previewEnabled: false,
                        fileName,
                        chunkCount: result.chunksCreated,
                        ragIds: result.ragIds,
                        message: 'Document ingested successfully.',
                    }, 201);
                }
            } finally {
                // Cleanup temp file
                try {
                    fs.unlinkSync(tempPath);
                } catch (e) {
                    // Ignore cleanup errors
                }
            }
        } catch (error) {
            logger.error('Document ingestion failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/v1/documents/:sessionId/confirm
    // ═══════════════════════════════════════════════════════════════════════
    if (pathname.startsWith('/api/v1/documents/') && pathname.endsWith('/confirm') && method === 'POST') {
        const sessionId = pathname.split('/')[4];

        if (!sessionId) {
            sendError(res, 'Session ID is required', 400);
            return;
        }

        try {
            logger.info(`Confirming ingestion: ${sessionId}`);

            const result = await convex.action('documentIngestion:confirmIngestion', {
                sessionId,
            });

            logger.info(`Ingestion confirmed: ${result.chunksCreated} chunks persisted`);

            sendJson(res, {
                success: true,
                sessionId,
                chunksCreated: result.chunksCreated,
                ragIds: result.ragIds,
                message: 'Document persisted successfully.',
            }, 200);
        } catch (error) {
            logger.error('Ingestion confirmation failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/v1/documents/:sessionId/cancel
    // ═══════════════════════════════════════════════════════════════════════
    if (pathname.startsWith('/api/v1/documents/') && pathname.endsWith('/cancel') && method === 'POST') {
        const sessionId = pathname.split('/')[4];

        logger.info(`[CANCEL] Received cancel request for sessionId: ${sessionId}`);

        try {
            logger.info(`[CANCEL] Calling convex cancelIngestion mutation...`);
            const result = await convex.mutation('documentIngestion:cancelIngestion', {
                sessionId,
            });

            logger.info(`[CANCEL] Result from convex:`, result);

            if (!result.success) {
                logger.error(`[CANCEL] Cancellation failed:`, result.error);
                sendError(res, result.error || 'Cancellation failed', 500);
                return;
            }

            logger.info(`[CANCEL] Session cancelled successfully: ${sessionId}`);
            sendJson(res, {
                success: true,
                message: 'Ingestion cancelled.',
            }, 200);
        } catch (error) {
            logger.error('[CANCEL] Ingestion cancellation failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/v1/documents?agent_id=xxx
    // ═══════════════════════════════════════════════════════════════════════
    if (pathname === '/api/v1/documents' && method === 'GET') {
        const agentId = query.agent_id;

        if (!agentId) {
            sendError(res, 'agent_id query parameter is required', 400);
            return;
        }

        try {
            // Get confirmed documents from documents table
            const documents = await convex.query('documents:listByAgentId', {
                agentId,
            });

            logger.info('Found documents:', { count: documents.length, documents: documents.map((d: any) => ({ documentId: d.documentId, fileName: d.fileName })) });

            // ALSO get ingestion sessions that are in preview_ready or processing states
            // These should appear in the UI even though they haven't been confirmed yet
            const sessions = await convex.query('documentIngestion:listSessionsByAgent', {
                agentId,
            });

            // Only log if there are active sessions (reduce noise in logs)
            if (sessions.length > 0) {
                logger.debug('Active sessions:', { count: sessions.length });
            }

            // Combine both: confirmed documents + pending sessions
            const allDocuments = [
                ...documents.map((doc: any) => ({
                    documentId: doc.documentId,
                    fileName: doc.fileName,
                    fileType: doc.fileType,
                    fileSize: doc.fileSize,
                    status: doc.status,
                    chunkCount: doc.chunkCount,
                    sourceType: doc.sourceType,
                    uploadedAt: doc.uploadedAt,
                    processedAt: doc.processedAt,
                    error: doc.errorMessage,
                })),
                ...sessions.map((session: any) => ({
                    documentId: session.sessionId, // Use sessionId as documentId for pending docs
                    fileName: session.fileName,
                    fileType: session.fileType,
                    expiresAt: session.expiresAt,
                    expiresInHours: session.expiresInHours,
                    expiresInMinutes: session.expiresInMinutes,
                    fileSize: session.fileSize,
                    status: session.stage === 'preview_ready' ? 'preview' : 'processing', // Map stage to status (must match frontend's 'preview')
                    chunkCount: session.chunkCount || 0,
                    sourceType: session.sourceType,
                    uploadedAt: session.uploadedAt || session.createdAt,
                    processedAt: session.previewedAt,
                    error: session.errorMessage,
                    // Include preview chunks for preview_ready sessions
                    previewChunks: session.stage === 'preview_ready' && session.previewChunks 
                        ? JSON.parse(session.previewChunks) 
                        : undefined,
                })),
            ];

            logger.info('Returning all documents:', { count: allDocuments.length, docs: allDocuments.map((d: any) => ({ documentId: d.documentId, status: d.status, fileName: d.fileName })) });

            sendJson(res, {
                success: true,
                documents: allDocuments,
                count: allDocuments.length,
            }, 200);
        } catch (error) {
            logger.error('Failed to list documents', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/v1/documents/:sessionId/status
    // ═══════════════════════════════════════════════════════════════════════
    if (pathname.startsWith('/api/v1/documents/') && pathname.endsWith('/status') && method === 'GET') {
        const sessionId = pathname.split('/')[4];

        try {
            const session = await convex.query('documentIngestion:getIngestionSessionStatus', {
                sessionId,
            });

            if (!session) {
                sendError(res, 'Session not found', 404);
                return;
            }

            // Debug logging
            logger.info('Session status response:', {
                sessionId: session.sessionId,
                fileName: session.fileName,
                stage: session.stage,
                chunkCount: session.chunkCount,
                hasPreviewChunks: !!session.previewChunks,
                rawSession: session,
            });

            sendJson(res, {
                success: true,
                sessionId: session.sessionId,
                fileName: session.fileName,
                stage: session.stage,
                chunkCount: session.chunkCount,
                error: session.error,
                previewChunks: session.previewChunks,
            }, 200);
        } catch (error) {
            logger.error('Failed to get session status', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/v1/documents/:documentId/chunks
    // ═══════════════════════════════════════════════════════════════════════
    // Fetches chunks from the RAG content table (chunks), NOT from ingestionSessions
    // ingestionSessions are temporary and cleaned up after confirmation
    if (pathname.startsWith('/api/v1/documents/') && pathname.endsWith('/chunks') && method === 'GET') {
        const documentId = pathname.split('/')[4];

        if (!documentId) {
            sendError(res, 'Document ID is required', 400);
            return;
        }

        logger.info(`[CHUNKS] Fetching chunks for documentId: ${documentId}`);

        try {
            // First try to fetch from permanent chunks table
            const chunks = await convex.query('documentIngestion:getChunksByDocument', {
                documentId,
            });

            logger.info(`[CHUNKS] Found ${chunks.length} chunks in permanent table`);

            // If no chunks found, check if this is a pending session with preview chunks
            if (chunks.length === 0) {
                logger.info(`[CHUNKS] No permanent chunks, checking ingestionSessions...`);
                
                // Try to get chunks from ingestion session (preview mode)
                const session = await convex.query('documentIngestion:getIngestionSessionStatus', {
                    sessionId: documentId,
                });
                
                if (session && session.previewChunks) {
                    logger.info(`[CHUNKS] Found preview chunks in session`);
                    const previewChunks = typeof session.previewChunks === 'string' 
                        ? JSON.parse(session.previewChunks)
                        : session.previewChunks;
                    
                    sendJson(res, {
                        success: true,
                        documentId,
                        chunks: previewChunks,
                        count: previewChunks.length,
                        source: 'preview',
                    }, 200);
                    return;
                }
            }

            sendJson(res, {
                success: true,
                documentId,
                chunks,
                count: chunks.length,
                source: 'permanent',
            }, 200);
        } catch (error) {
            logger.error('Failed to fetch chunks', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DELETE /api/v1/documents/:documentId
    // ═══════════════════════════════════════════════════════════════════════
    if (pathname.startsWith('/api/v1/documents/') && method === 'DELETE') {
        const documentId = pathname.split('/')[4];

        if (!documentId) {
            sendError(res, 'Document ID is required', 400);
            return;
        }

        logger.info(`[DELETE] Received delete request for documentId: ${documentId}`);

        try {
            logger.info(`[DELETE] Calling convex deleteDocumentCascade action...`);
            const result = await convex.action('documentIngestion:deleteDocumentCascade', {
                documentId,
            });

            logger.info(`[DELETE] Result from convex:`, result);

            if (!result.success) {
                logger.error(`[DELETE] Deletion failed:`, result.error);
                sendError(res, result.error || 'Deletion failed', 500);
                return;
            }

            logger.info(`Document deleted: ${documentId} (${result.deletedChunks} chunks)`);

            sendJson(res, {
                success: true,
                documentId,
                deletedChunks: result.deletedChunks,
                message: 'Document and all related data deleted.',
            }, 200);
        } catch (error) {
            logger.error('[DELETE] Document deletion failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }

    // No matching route
    sendError(res, 'Not Found', 404);
}
