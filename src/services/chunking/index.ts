/**
 * Chunking Module
 * 
 * Re-exports all chunking functionality for backward compatibility.
 * Import from this file to maintain existing import paths.
 * 
 * Usage:
 *   import { ChunkingService, getChunkingService, ChunkingStrategy } from './chunking/index.js';
 *   // or
 *   import { ChunkingService } from './chunking.js'; // backward compatible
 */

// Types and interfaces
export { 
    ChunkingStrategy, 
    ContentType, 
    DEFAULT_CHUNKING_CONFIG,
} from './types.js';

export type { 
    Chunk, 
    ChunkingConfig,
    AutoChunkResult,
} from './types.js';

// Text utilities
export { 
    decodeHtmlEntities, 
    tableRowToSentence, 
    cleanTableText,
    cleanText,
    cleanName,
    cleanDescription,
} from './utilities.js';

// Context formatting
export { 
    formatChunkWithContext,
    formatChunkCompact,
    formatChunkLegacy,
    extractSearchKeywords,
} from './context.js';

// Field extraction
export { 
    extractStructuredFields, 
    parseEnrichedText,
} from './fields.js';

// Strategy helpers (public API)
export {
    detectOptimalStrategy,
    isCategoryHeader,
    isItemStart,
    createChunk,
    createSimpleChunk,
} from './text.js';

// Structured document chunking (public API)
export {
    detectFaqPattern,
    isSectionHeader,
} from './structured.js';

// Tokenizer (public API)
export {
    ProductionTokenizer,
    getTokenizer,
    resetTokenizer,
} from './tokenizer.js';

export type { TokenizerConfig } from './tokenizer.js';

// Recursive text splitter (public API)
export {
    RecursiveTextSplitter,
    ContentDensity,
    detectContentDensity,
    createSplitterForContent,
} from './splitter.js';

export type { AdaptiveSizingConfig } from './splitter.js';

// Deduplication (public API)
export {
    normalizeForHash,
    generateContentHash,
    generateChunkKey,
    compareChunkContent,
    prepareChunksForIngestion,
    findStaleChunkKeys,
    calculateDeduplicationStats,
    batchChunks,
    sleep,
    processBatches,
} from './deduplication.js';

export type {
    NormalizationOptions,
    ChunkComparison,
    DeduplicatedChunk,
    DeduplicationStats,
    IngestionResult,
    BatchConfig,
} from './deduplication.js';

// Main service
export { 
    ChunkingService, 
    getChunkingService,
    resetChunkingService,
    analyzeContentType,
} from './service.js';

// Default export for backward compatibility
export { ChunkingService as default } from './service.js';
