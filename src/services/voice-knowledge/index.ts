/**
 * Voice Knowledge Module
 * 
 * Optimized knowledge retrieval service for voice agents with caching
 * and low-latency responses.
 * 
 * @module voice-knowledge
 */

// Types
export type {
    ParsedItem,
    VoiceSearchItem,
    VoiceSearchResponse,
    AgentRagConfig,
    BusinessInfoResult,
    HybridSearchResult,
    HybridSearchOptions,
    CacheStats,
    WarmupResult,
} from './types.js';

// Text parsing utilities
export {
    parseEnrichedText,
    cleanName,
    cleanDescription,
    formatPrice,
    getPriceRange,
} from './parser.js';

// Query expansion
export {
    expandQuery,
    getAdjustedThreshold,
    INFO_TYPE_KEYWORDS,
} from './expander.js';

// Main service
export {
    VoiceKnowledgeService,
    createVoiceKnowledgeService,
} from './service.js';
