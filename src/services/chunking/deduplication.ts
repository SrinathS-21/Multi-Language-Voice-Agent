/**
 * Content Deduplication Service
 * 
 * Provides content-hash based deduplication for idempotent chunk ingestion.
 * Works correctly for all languages (English, Tamil, Hindi, etc.) and content types.
 * 
 * @module chunking/deduplication
 * @version 1.0.0
 */

import crypto from 'crypto';
import { logger } from '../../core/logging.js';
import { getTokenizer } from './tokenizer.js';

/**
 * Normalization options for content hashing
 */
export interface NormalizationOptions {
    /** Collapse multiple whitespace to single space (default: true) */
    collapseWhitespace: boolean;
    /** Remove leading/trailing whitespace (default: true) */
    trim: boolean;
    /** Apply Unicode NFKC normalization (default: true) */
    unicodeNormalize: boolean;
    /** Convert to lowercase - ONLY for search, NOT for hashing (default: false) */
    lowercase: boolean;
}

const DEFAULT_NORMALIZATION: NormalizationOptions = {
    collapseWhitespace: true,
    trim: true,
    unicodeNormalize: true,
    lowercase: false, // Keep case-sensitive for code and proper nouns
};

/**
 * Normalize text for consistent hashing
 * 
 * IMPORTANT: This normalization is language-agnostic and works for:
 * - English, Tamil, Hindi, and all Unicode scripts
 * - Code blocks and technical content (case-preserved)
 * - Special characters (™®©₹µ etc.)
 * 
 * @param text - The text to normalize
 * @param options - Normalization options
 * @returns Normalized text
 */
export function normalizeForHash(
    text: string,
    options: Partial<NormalizationOptions> = {}
): string {
    const opts = { ...DEFAULT_NORMALIZATION, ...options };
    
    let normalized = text;
    
    // Step 1: Unicode NFKC normalization
    // - Handles all scripts (Latin, Tamil, Devanagari, etc.)
    // - Converts compatibility characters to canonical form
    // - Preserves meaning while ensuring consistent representation
    if (opts.unicodeNormalize) {
        normalized = normalized.normalize('NFKC');
    }
    
    // Step 2: Collapse whitespace (tabs, newlines, multiple spaces → single space)
    if (opts.collapseWhitespace) {
        normalized = normalized.replace(/\s+/g, ' ');
    }
    
    // Step 3: Trim leading/trailing whitespace
    if (opts.trim) {
        normalized = normalized.trim();
    }
    
    // Step 4: Lowercase (ONLY if explicitly requested - NOT for hashing)
    if (opts.lowercase) {
        normalized = normalized.toLowerCase();
    }
    
    return normalized;
}

/**
 * Generate a deterministic content hash for deduplication
 * 
 * Uses SHA-256 with first 16 hex characters (64 bits) for compact but collision-resistant keys.
 * 
 * @param text - The content to hash
 * @returns 16-character hex hash
 */
export function generateContentHash(text: string): string {
    const normalized = normalizeForHash(text);
    const hash = crypto
        .createHash('sha256')
        .update(normalized, 'utf8')
        .digest('hex')
        .substring(0, 16);
    
    return hash;
}

/**
 * Generate a unique chunk key for upsert operations
 * 
 * Key format: {agentId}_{documentId}_{contentHash}
 * 
 * This ensures:
 * - Same content in same document → same key → upsert (no duplicates)
 * - Same content in different documents → different keys → both stored
 * - Different content in same document → different keys → both stored
 * 
 * @param agentId - The agent ID
 * @param documentId - The document ID
 * @param contentHash - The content hash from generateContentHash()
 * @returns Unique chunk key
 */
export function generateChunkKey(
    agentId: string,
    documentId: string,
    contentHash: string
): string {
    // Sanitize inputs to prevent key injection
    const sanitizedAgentId = agentId.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedDocId = documentId.replace(/[^a-zA-Z0-9_-]/g, '');
    
    return `${sanitizedAgentId}_${sanitizedDocId}_${contentHash}`;
}

/**
 * Chunk with deduplication metadata
 */
export interface DeduplicatedChunk {
    /** Original chunk text */
    text: string;
    /** Content hash for deduplication */
    contentHash: string;
    /** Unique key for upsert */
    key: string;
    /** Token count */
    tokenCount: number;
    /** Original chunk index */
    index: number;
    /** Additional metadata */
    metadata: Record<string, any>;
}

/**
 * Ingestion result with deduplication stats
 */
export interface IngestionResult {
    /** Number of chunks inserted (new) */
    inserted: number;
    /** Number of chunks updated (existing) */
    updated: number;
    /** Number of chunks skipped (identical) */
    skipped: number;
    /** Number of stale chunks deleted */
    deleted: number;
    /** Total chunks processed */
    total: number;
    /** List of chunk keys processed */
    processedKeys: string[];
    /** Duration in milliseconds */
    durationMs: number;
}

/**
 * Chunk comparison result
 */
export interface ChunkComparison {
    /** Whether content is identical */
    isIdentical: boolean;
    /** Content hash */
    hash: string;
    /** Token count */
    tokenCount: number;
}

/**
 * Compare chunk content for deduplication
 * 
 * @param newText - New chunk text
 * @param existingText - Existing chunk text (if any)
 * @returns Comparison result
 */
export function compareChunkContent(
    newText: string,
    existingText?: string
): ChunkComparison {
    const tokenizer = getTokenizer();
    const newHash = generateContentHash(newText);
    const tokenCount = tokenizer.countTokens(newText);
    
    if (!existingText) {
        return { isIdentical: false, hash: newHash, tokenCount };
    }
    
    const existingHash = generateContentHash(existingText);
    return {
        isIdentical: newHash === existingHash,
        hash: newHash,
        tokenCount,
    };
}

/**
 * Prepare chunks for idempotent ingestion
 * 
 * @param chunks - Array of chunk texts
 * @param agentId - Agent ID
 * @param documentId - Document ID
 * @param metadata - Additional metadata to attach
 * @returns Array of deduplicated chunks with keys
 */
export function prepareChunksForIngestion(
    chunks: string[],
    agentId: string,
    documentId: string,
    metadata: Record<string, any> = {}
): DeduplicatedChunk[] {
    const tokenizer = getTokenizer();
    
    return chunks.map((text, index) => {
        const contentHash = generateContentHash(text);
        const key = generateChunkKey(agentId, documentId, contentHash);
        const tokenCount = tokenizer.countTokens(text);
        
        return {
            text,
            contentHash,
            key,
            tokenCount,
            index,
            metadata: {
                ...metadata,
                chunkIndex: index,
                documentId,
                agentId,
            },
        };
    });
}

/**
 * Find stale chunk keys that should be deleted
 * 
 * Compares existing keys with new keys to find chunks that no longer exist
 * in the updated document.
 * 
 * @param existingKeys - Keys currently in the database
 * @param newKeys - Keys from the new ingestion
 * @param documentPrefix - Prefix to filter by document (e.g., "{agentId}_{documentId}_")
 * @returns Array of keys to delete
 */
export function findStaleChunkKeys(
    existingKeys: string[],
    newKeys: string[],
    documentPrefix: string
): string[] {
    const newKeySet = new Set(newKeys);
    
    return existingKeys.filter(key => {
        // Only consider keys that belong to this document
        if (!key.startsWith(documentPrefix)) {
            return false;
        }
        // If key is not in new keys, it's stale
        return !newKeySet.has(key);
    });
}

/**
 * Calculate deduplication statistics
 */
export interface DeduplicationStats {
    /** Total chunks before dedup */
    totalChunks: number;
    /** Unique content hashes */
    uniqueHashes: number;
    /** Duplicate chunks found */
    duplicates: number;
    /** Deduplication ratio (0-1, higher = more duplicates removed) */
    dedupRatio: number;
    /** Total tokens before dedup */
    totalTokens: number;
    /** Tokens saved by dedup */
    tokensSaved: number;
}

/**
 * Calculate deduplication statistics for a batch of chunks
 * 
 * @param chunks - Array of deduplicated chunks
 * @returns Deduplication statistics
 */
export function calculateDeduplicationStats(
    chunks: DeduplicatedChunk[]
): DeduplicationStats {
    const hashCounts = new Map<string, { count: number; tokens: number }>();
    
    let totalTokens = 0;
    
    chunks.forEach(chunk => {
        const existing = hashCounts.get(chunk.contentHash);
        if (existing) {
            existing.count++;
        } else {
            hashCounts.set(chunk.contentHash, { count: 1, tokens: chunk.tokenCount });
        }
        totalTokens += chunk.tokenCount;
    });
    
    const uniqueHashes = hashCounts.size;
    const duplicates = chunks.length - uniqueHashes;
    
    // Calculate tokens saved (tokens from duplicate chunks)
    let tokensSaved = 0;
    hashCounts.forEach(({ count, tokens }) => {
        if (count > 1) {
            tokensSaved += tokens * (count - 1);
        }
    });
    
    return {
        totalChunks: chunks.length,
        uniqueHashes,
        duplicates,
        dedupRatio: chunks.length > 0 ? duplicates / chunks.length : 0,
        totalTokens,
        tokensSaved,
    };
}

/**
 * Batch processing configuration
 */
export interface BatchConfig {
    /** Number of chunks per batch (default: 10) */
    batchSize: number;
    /** Delay between batches in ms (default: 100) */
    batchDelayMs: number;
    /** Maximum retries per batch (default: 3) */
    maxRetries: number;
    /** Retry delay in ms (default: 1000) */
    retryDelayMs: number;
}

const DEFAULT_BATCH_CONFIG: BatchConfig = {
    batchSize: 10,
    batchDelayMs: 100,
    maxRetries: 3,
    retryDelayMs: 1000,
};

/**
 * Split chunks into batches for processing
 * 
 * @param chunks - Array of chunks to batch
 * @param batchSize - Number of chunks per batch
 * @returns Array of chunk batches
 */
export function batchChunks<T>(chunks: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < chunks.length; i += batchSize) {
        batches.push(chunks.slice(i, i + batchSize));
    }
    
    return batches;
}

/**
 * Sleep utility for batch delays
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Process chunks in batches with retry logic
 * 
 * @param chunks - Chunks to process
 * @param processor - Function to process each batch
 * @param config - Batch configuration
 * @returns Processing results
 */
export async function processBatches<T, R>(
    chunks: T[],
    processor: (batch: T[]) => Promise<R>,
    config: Partial<BatchConfig> = {}
): Promise<R[]> {
    const cfg = { ...DEFAULT_BATCH_CONFIG, ...config };
    const batches = batchChunks(chunks, cfg.batchSize);
    const results: R[] = [];
    
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        let lastError: Error | null = null;
        
        for (let retry = 0; retry < cfg.maxRetries; retry++) {
            try {
                const result = await processor(batch);
                results.push(result);
                lastError = null;
                break;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                logger.warning(
                    `Batch ${i + 1}/${batches.length} failed (attempt ${retry + 1}/${cfg.maxRetries}):`,
                    lastError.message
                );
                
                if (retry < cfg.maxRetries - 1) {
                    await sleep(cfg.retryDelayMs * (retry + 1)); // Exponential backoff
                }
            }
        }
        
        if (lastError) {
            throw new Error(
                `Batch ${i + 1} failed after ${cfg.maxRetries} retries: ${lastError.message}`
            );
        }
        
        // Delay between batches (except after last batch)
        if (i < batches.length - 1) {
            await sleep(cfg.batchDelayMs);
        }
    }
    
    return results;
}

// Export batch config for external use
export { DEFAULT_BATCH_CONFIG };
