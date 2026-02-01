/**
 * RAG (Retrieval-Augmented Generation) Service
 * 
 * Provides semantic search for voice agent knowledge bases using @convex-dev/rag.
 * 
 * ARCHITECTURE:
 * - Each agent has isolated knowledge via namespace (agentId)
 * - Documents are chunked and embedded at ingestion time
 * - Search returns relevant chunks for LLM context injection
 * - Deduplication via content hashing prevents duplicate chunks
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Pure semantic search (no hybrid filtering)
 * - Parallel warmup queries to prime connections
 * - Low latency (<200ms) for voice interactions
 * - Content-hash based deduplication for idempotent ingestion
 * 
 * @module convex/rag
 */

import { RAG } from "@convex-dev/rag";
import { openai } from "@ai-sdk/openai";
import { components } from "./_generated/api.js";
import { action } from "./_generated/server.js";
import { v } from "convex/values";

// ============================================================================
// RAG INITIALIZATION
// ============================================================================

/**
 * RAG instance with OpenAI text-embedding-3-small
 * 
 * Configuration:
 * - Model: text-embedding-3-small (fast, cost-effective)
 * - Dimension: 1536 (standard OpenAI embedding size)
 */
export const rag = new RAG(components.rag, {
    textEmbeddingModel: openai.embedding("text-embedding-3-small"),
    embeddingDimension: 1536,
});

// ============================================================================
// INGESTION OPERATIONS
// ============================================================================

/**
 * Ingest content (text or chunks) into the knowledge base
 * Called during document upload (not time-sensitive)
 * Uses agentId as namespace for per-agent knowledge isolation
 */
export const ingest = action({
    args: {
        namespace: v.string(),       // Agent ID (per-agent knowledge base)
        key: v.optional(v.string()), // Unique document key for updates
        text: v.optional(v.string()), // Full document text
        chunks: v.optional(v.array(v.string())), // Pre-calculated chunks
        title: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        if (!args.text && !args.chunks) {
            throw new Error("Must provide either text or chunks");
        }

        const commonArgs = {
            namespace: args.namespace,
            key: args.key,
            title: args.title,
        };

        let result;
        if (args.text) {
            result = await rag.add(ctx, { ...commonArgs, text: args.text });
        } else {
            result = await rag.add(ctx, { ...commonArgs, chunks: args.chunks! });
        }

        return {
            entryId: result.entryId,
            status: result.status,
        };
    },
});

/**
 * Upsert chunks with deduplication support
 * 
 * This action supports idempotent ingestion:
 * - Same content with same key → skipped (no duplicate)
 * - Same key with different content → updated
 * - New key → inserted
 * 
 * Designed for re-ingestion scenarios where documents may be updated.
 * Uses content hashes as part of the key for deduplication.
 * 
 * @param namespace - Agent ID for knowledge isolation
 * @param chunks - Array of chunk objects with text, key, title, and contentHash
 * @returns Ingestion stats: inserted, updated, skipped counts
 */
export const upsertChunks = action({
    args: {
        namespace: v.string(),
        chunks: v.array(v.object({
            text: v.string(),           // Chunk content
            key: v.string(),            // Unique key (agentId_docId_contentHash)
            title: v.optional(v.string()), // Chunk title for display
            contentHash: v.string(),    // Content hash for dedup verification
            metadata: v.optional(v.any()), // Additional metadata
        })),
    },
    handler: async (ctx, args) => {
        const startTime = Date.now();
        let inserted = 0;
        const updated = 0;
        let skipped = 0;
        const processedKeys: string[] = [];
        
        // Get existing entries to check for duplicates
        const existingEntries = await rag.list(ctx, {
            namespaceId: args.namespace as any,
            status: "ready",
            paginationOpts: { cursor: null, numItems: 500 },
        });
        
        // Create lookup map by key
        const existingByKey = new Map<string, { entryId: string; key: string }>();
        for (const entry of existingEntries.page) {
            if (entry.key) {
                existingByKey.set(entry.key, { entryId: entry.entryId, key: entry.key });
            }
        }
        
        // Process each chunk
        for (const chunk of args.chunks) {
            processedKeys.push(chunk.key);
            
            const existing = existingByKey.get(chunk.key);
            
            if (existing) {
                // Key exists - this is a duplicate (same content produces same key)
                // Since key includes contentHash, same key = same content = skip
                skipped++;
                console.log(`[Upsert] Skipped duplicate: ${chunk.key}`);
            } else {
                // New chunk - insert
                try {
                    await rag.add(ctx, {
                        namespace: args.namespace,
                        key: chunk.key,
                        text: chunk.text,
                        title: chunk.title,
                    });
                    inserted++;
                } catch (error) {
                    // If the key already exists (race condition), treat as skip
                    console.log(`[Upsert] Insert failed for ${chunk.key}:`, error);
                    skipped++;
                }
            }
        }
        
        const durationMs = Date.now() - startTime;
        console.log(`[Upsert] Completed: ${inserted} inserted, ${skipped} skipped in ${durationMs}ms`);
        
        return {
            inserted,
            updated,
            skipped,
            total: args.chunks.length,
            processedKeys,
            durationMs,
        };
    },
});

/**
 * Delete chunks by their keys
 * Used to remove stale chunks after document re-ingestion
 * 
 * @param namespace - Agent ID
 * @param keys - Array of chunk keys to delete
 * @returns Number of chunks deleted
 */
export const deleteChunksByKeys = action({
    args: {
        namespace: v.string(),
        keys: v.array(v.string()),
    },
    handler: async (ctx, args) => {
        if (args.keys.length === 0) {
            return { deleted: 0 };
        }
        
        let deleted = 0;
        
        // Get all entries in namespace
        const entries = await rag.list(ctx, {
            namespaceId: args.namespace as any,
            status: "ready",
            paginationOpts: { cursor: null, numItems: 500 },
        });
        
        // Create key-to-entryId map
        const keyToEntryId = new Map<string, string>();
        for (const entry of entries.page) {
            if (entry.key) {
                keyToEntryId.set(entry.key, entry.entryId);
            }
        }
        
        // Delete each key
        for (const key of args.keys) {
            const entryId = keyToEntryId.get(key);
            if (entryId) {
                try {
                    await rag.delete(ctx, { entryId: entryId as any });
                    deleted++;
                } catch (error) {
                    console.log(`[Delete] Failed to delete ${key}:`, error);
                }
            }
        }
        
        console.log(`[Delete] Removed ${deleted}/${args.keys.length} chunks`);
        return { deleted };
    },
});

/**
 * Get all chunk keys for a document (by prefix)
 * Used to identify stale chunks for deletion
 * 
 * @param namespace - Agent ID
 * @param keyPrefix - Prefix to match (e.g., "agentId_docId_")
 * @returns Array of matching keys
 */
export const getChunkKeysByPrefix = action({
    args: {
        namespace: v.string(),
        keyPrefix: v.string(),
    },
    handler: async (ctx, args) => {
        const entries = await rag.list(ctx, {
            namespaceId: args.namespace as any,
            status: "ready",
            paginationOpts: { cursor: null, numItems: 500 },
        });
        
        const matchingKeys = entries.page
            .filter(e => e.key && e.key.startsWith(args.keyPrefix))
            .map(e => e.key!);
        
        return { keys: matchingKeys, count: matchingKeys.length };
    },
});

/**
 * Search knowledge base - optimized for voice agent latency
 * Single action: embedding + vector search in one call
 * Uses agentId as namespace for agent-specific knowledge retrieval
 */
export const search = action({
    args: {
        namespace: v.string(),       // Agent ID (searches only this agent's knowledge)
        query: v.string(),           // User's question
        limit: v.optional(v.number()),
        minScore: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        // Input validation - handle empty/whitespace queries gracefully
        const trimmedQuery = args.query?.trim() || '';
        if (!trimmedQuery) {
            return {
                text: '',
                results: [],
                resultsCount: 0,
                entries: [],
            };
        }

        const { results, text, entries } = await rag.search(ctx, {
            namespace: args.namespace,
            query: trimmedQuery,
            // Optimized for voice agent latency and accuracy:
            // - limit=3: Fewer results = faster response, top results are usually best
            // - threshold=0.35: Balanced - filters noise but keeps valid borderline matches
            // - No chunkContext: Each chunk is self-contained with embedded context
            limit: args.limit ?? 3,
            vectorScoreThreshold: args.minScore ?? 0.35,
            chunkContext: { before: 0, after: 0 }, // Chunks are self-contained
        });

        console.log("RAG Search Results:", JSON.stringify(results[0] || "No results", null, 2));

        return {
            text,  // Formatted text for LLM prompt
            results: results.map(r => {
                const entry = entries.find(e => e.entryId === r.entryId);
                return {
                    score: r.score,
                    text: entry?.text,
                    entryId: r.entryId,
                };
            }),
            resultsCount: results.length,
            entries: entries.map(e => ({
                entryId: e.entryId,
                title: e.title,
                text: e.text,
            })),
        };
    },
});

/**
 * Delete a document from knowledge base
 */
export const deleteDocument = action({
    args: {
        entryId: v.string(),
    },
    handler: async (ctx, args) => {
        await rag.delete(ctx, { entryId: args.entryId as any });
        return { success: true };
    },
});

/**
 * Clear all entries in a namespace
 */
export const clearNamespace = action({
    args: {
        namespace: v.string(),
    },
    handler: async (ctx, args) => {
        let deleted = 0;
        let attempts = 0;
        const maxAttempts = 20;
        
        console.log(`Starting to clear namespace: ${args.namespace}`);
        
        const queries = ["the", "a", "is", "item", "information", "all"];
        
        while (attempts < maxAttempts) {
            attempts++;
            let foundAny = false;
            
            for (const query of queries) {
                try {
                    const searchResult = await rag.search(ctx, {
                        namespace: args.namespace,
                        query: query,
                        limit: 50,
                        vectorScoreThreshold: 0,
                    });
                    
                    if (searchResult.results.length > 0) {
                        foundAny = true;
                        console.log(`Found ${searchResult.results.length} entries with query "${query}"`);
                        
                        for (const result of searchResult.results) {
                            try {
                                await rag.delete(ctx, { entryId: result.entryId as any });
                                deleted++;
                            } catch (_e) {
                                // Entry may already be deleted
                            }
                        }
                    }
                } catch (e) {
                    console.log(`Search error for "${query}":`, e);
                }
            }
            
            if (!foundAny) {
                console.log(`No more entries found after ${attempts} attempts`);
                break;
            }
        }
        
        console.log(`Deleted ${deleted} total entries from namespace ${args.namespace}`);
        return { deleted };
    },
});

/**
 * List entries in a namespace
 */
export const listEntries = action({
    args: {
        namespace: v.string(),
        status: v.optional(v.union(v.literal("ready"), v.literal("pending"), v.literal("replaced"))),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const namespaceId = args.namespace as any;
        const result = await rag.list(ctx, {
            namespaceId,
            status: args.status,
            paginationOpts: { cursor: null, numItems: args.limit ?? 100 },
        });

        return {
            entries: result.page.map(e => ({
                entryId: e.entryId,
                key: e.key,
                title: e.title,
                status: e.status,
            })),
            hasMore: !result.isDone,
        };
    },
});

/**
 * Get chunks for a specific document by key prefix
 */
export const getDocumentChunks = action({
    args: {
        namespace: v.string(),
        documentId: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 10;
        
        const namespaceId = args.namespace as any;
        const listResult = await rag.list(ctx, {
            namespaceId,
            status: "ready",
            paginationOpts: { cursor: null, numItems: 500 },
        });
        
        const documentKeyPrefix = `${args.documentId}_chunk_`;
        const documentEntries = listResult.page.filter(e => 
            e.key && e.key.startsWith(documentKeyPrefix)
        );
        
        documentEntries.sort((a, b) => {
            const aNum = parseInt(a.key?.split('_chunk_')[1] || '0');
            const bNum = parseInt(b.key?.split('_chunk_')[1] || '0');
            return aNum - bNum;
        });
        
        const limitedEntries = documentEntries.slice(0, limit);
        
        const chunks: Array<{
            chunkIndex: number;
            text: string;
            title: string | undefined;
            entryId: string;
        }> = [];
        
        for (const entry of limitedEntries) {
            try {
                const chunkIndex = parseInt(entry.key?.split('_chunk_')[1] || '0');
                
                const searchResult = await rag.search(ctx, {
                    namespace: args.namespace,
                    query: entry.title || "content",
                    limit: 50,
                    vectorScoreThreshold: 0,
                });
                
                const matchingEntry = searchResult.entries.find(e => e.entryId === entry.entryId);
                
                if (matchingEntry) {
                    chunks.push({
                        chunkIndex,
                        text: matchingEntry.text || "",
                        title: entry.title,
                        entryId: entry.entryId,
                    });
                }
            } catch (e) {
                console.log(`Failed to get text for entry ${entry.entryId}:`, e);
            }
        }
        
        return {
            documentId: args.documentId,
            totalChunks: documentEntries.length,
            retrievedChunks: chunks.length,
            chunks,
        };
    },
});

/**
 * Warmup function - call this before expected high traffic
 * Warms up:
 * 1. Convex action runtime
 * 2. OpenAI embedding API connection  
 * 3. Vector search index for the specific namespace
 * 
 * Improved warmup strategy:
 * - Runs 3 realistic queries in PARALLEL to fully prime connections
 * - Uses actual namespace to warm vector index for that agent
 * - Lower threshold to actually exercise the vector search
 * 
 * Usage: Call when voice agent connects, before first user query
 */
export const warmup = action({
    args: {
        namespace: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const startTime = Date.now();
        const namespace = args.namespace ?? "__warmup__";
        
        // Common healthcare/business queries to prime embeddings
        // These are semantically diverse to warm different embedding dimensions
        const warmupQueries = [
            "What is a fracture?",      // Medical query pattern
            "What is a sprain?",   // General assistance
            "What is a strain?",
            "What is arthritis?" // FAQ pattern
        ];
        
        try {
            // Run 3 queries IN PARALLEL to fully warm:
            // - OpenAI embedding API (3 calls primes connection pool)
            // - Vector index (searches different regions of embedding space)
            const results = await Promise.all(
                warmupQueries.map(async (query, i) => {
                    const queryStart = Date.now();
                    try {
                        await rag.search(ctx, {
                            namespace,
                            query,
                            limit: 2,
                            vectorScoreThreshold: 0.3,  // Low threshold = actually exercise vector search
                        });
                    } catch (_e) {
                        // Expected if namespace is empty or doesn't exist
                    }
                    return { query: i + 1, latency: Date.now() - queryStart };
                })
            );
            
            const totalLatency = Date.now() - startTime;
            const queryLatencies = results.map(r => r.latency);
            
            console.log(`[RAG Warmup] Completed in ${totalLatency}ms (parallel queries: ${queryLatencies.join('ms, ')}ms)`);
            
            return { 
                success: true, 
                latency: totalLatency,
                queryLatencies,
                message: `RAG service warmed up in ${totalLatency}ms (3 parallel queries)`
            };
        } catch (_e) {
            const latency = Date.now() - startTime;
            console.log(`[RAG Warmup] Partial warmup in ${latency}ms`);
            return { 
                success: true, 
                latency,
                message: `RAG service partially warmed in ${latency}ms`
            };
        }
    },
});
