/**
 * Voice Knowledge Types
 * 
 * Type definitions for voice knowledge service.
 */

/**
 * Parsed item from enriched text
 */
export interface ParsedItem {
    name: string;
    category: string;
    price: number;
    description: string;
    tags: string[];
}

/**
 * Search result item for voice response
 */
export interface VoiceSearchItem extends ParsedItem {
    score: number;
}

/**
 * Voice search response
 */
export interface VoiceSearchResponse {
    found: boolean;
    count?: number;
    items?: VoiceSearchItem[];
    message?: string;
    suggestions?: string[];
    error?: string;
}

/**
 * Agent configuration for RAG
 */
export interface AgentRagConfig {
    topK?: number;
    similarityThreshold?: number;
}

/**
 * Business info result
 */
export interface BusinessInfoResult {
    found: boolean;
    message?: string;
    data?: any;
    [key: string]: any;
}

/**
 * Hybrid search result
 */
export interface HybridSearchResult {
    results: {
        items?: VoiceSearchResponse;
        knowledge?: VoiceSearchResponse;
    };
    latencyMs: number;
}

/**
 * Hybrid search options
 */
export interface HybridSearchOptions {
    includeItems?: boolean;
    includeKnowledge?: boolean;
    itemsLimit?: number;
    knowledgeLimit?: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
    hits: number;
    misses: number;
    hitRate: string;
}

/**
 * Warmup result
 */
export interface WarmupResult {
    success: boolean;
    latency: number;
    message: string;
}
