/**
 * Chunking Types and Interfaces
 * 
 * Core type definitions for the chunking service.
 * Separating types improves maintainability and reduces circular dependencies.
 */

/**
 * Available chunking strategies
 */
export enum ChunkingStrategy {
    PARAGRAPH = 'paragraph',    // Standard paragraph-based
    ITEM = 'item',              // One item per chunk (products, menu items)
    FAQ = 'faq',                // One Q&A pair per chunk
    SECTION = 'section',        // Section-based (headers)
    SENTENCE = 'sentence',      // Sentence-level (for dense content)
    FIXED = 'fixed',            // Fixed character size
}

/**
 * Document content type classification
 */
export enum ContentType {
    STRUCTURED = 'structured',  // Tables, hierarchies, menus (>30% tables OR >5 heading levels)
    NARRATIVE = 'narrative',    // Prose, articles, descriptions (>70% paragraphs)
    MIXED = 'mixed',            // Combination of both
}

/**
 * Chunk with metadata
 */
export interface Chunk {
    text: string;
    chunkIndex: number;
    tokenCount: number;      // Token count for the chunk text (using cl100k_base)
    metadata: Record<string, any>;
}

/**
 * Chunking service configuration
 * 
 * Supports both character-based (legacy) and token-based (new) sizing.
 * Token-based sizing is recommended for production use.
 */
export interface ChunkingConfig {
    // Character-based settings (legacy - kept for backward compatibility)
    chunkSize: number;       // Target chunk size in characters
    chunkOverlap: number;    // Overlap between chunks in characters
    minChunkSize: number;    // Minimum chunk size in characters (discard smaller)
    
    // Token-based settings (new - recommended)
    targetTokens?: number;   // Target tokens per chunk (default: 384)
    minTokens?: number;      // Minimum tokens per chunk (default: 192)
    maxTokens?: number;      // Maximum tokens per chunk (default: 512)
    overlapTokens?: number;  // Overlap tokens between chunks (default: 64)
    useTokenSizing?: boolean; // Use token-based sizing (default: true)
}

/**
 * Default configuration values
 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
    // Character-based settings (legacy)
    chunkSize: 800,
    chunkOverlap: 100,
    minChunkSize: 100,
    
    // Token-based settings (recommended)
    targetTokens: 384,
    minTokens: 192,
    maxTokens: 512,
    overlapTokens: 64,
    useTokenSizing: true,
};

/**
 * Result from auto-chunking with detected strategy and density
 */
export interface AutoChunkResult {
    chunks: Chunk[];
    strategy: ChunkingStrategy;
    density: import('./splitter.js').ContentDensity;
}
