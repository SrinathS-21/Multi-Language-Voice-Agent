/**
 * Production Tokenizer Service
 * 
 * Provides accurate token counting using gpt-tokenizer (cl100k_base)
 * which matches OpenAI's text-embedding-3-small tokenizer exactly.
 * 
 * Features:
 * - LRU cache for repeated token counts (10K entries)
 * - Token-aware text truncation
 * - Token boundary splitting
 * - ~1M tokens/sec throughput
 * 
 * @module chunking/tokenizer
 * @version 1.0.0
 */

import { encode, decode } from 'gpt-tokenizer';
import { LRUCache } from 'lru-cache';
import { logger } from '../../core/logging.js';

/**
 * Configuration for the tokenizer
 */
export interface TokenizerConfig {
    /** Maximum entries in the token count cache */
    cacheSize: number;
    /** Log cache statistics periodically */
    enableCacheStats: boolean;
}

const DEFAULT_CONFIG: TokenizerConfig = {
    cacheSize: 10000,
    enableCacheStats: false,
};

/**
 * Production Tokenizer Class
 * 
 * Provides accurate token counting that matches OpenAI's embedding model.
 * Uses cl100k_base tokenizer (same as text-embedding-3-small).
 */
export class ProductionTokenizer {
    private cache: LRUCache<string, number>;
    private config: TokenizerConfig;
    private cacheHits = 0;
    private cacheMisses = 0;

    constructor(config: Partial<TokenizerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.cache = new LRUCache<string, number>({
            max: this.config.cacheSize,
        });

        logger.info('ProductionTokenizer initialized', {
            cacheSize: this.config.cacheSize,
            tokenizer: 'cl100k_base',
        });
    }

    /**
     * Count tokens in text with LRU caching
     * 
     * @param text - Text to count tokens for
     * @returns Number of tokens
     */
    countTokens(text: string): number {
        if (!text || text.length === 0) {
            return 0;
        }

        // Check cache first
        const cached = this.cache.get(text);
        if (cached !== undefined) {
            this.cacheHits++;
            return cached;
        }

        // Count tokens using gpt-tokenizer
        this.cacheMisses++;
        const tokens = encode(text);
        const count = tokens.length;

        // Cache the result
        this.cache.set(text, count);

        return count;
    }

    /**
     * Encode text to token array
     * 
     * @param text - Text to encode
     * @returns Array of token IDs
     */
    encode(text: string): number[] {
        if (!text || text.length === 0) {
            return [];
        }
        return encode(text);
    }

    /**
     * Decode token array back to text
     * 
     * @param tokens - Array of token IDs
     * @returns Decoded text
     */
    decode(tokens: number[]): string {
        if (!tokens || tokens.length === 0) {
            return '';
        }
        return decode(tokens);
    }

    /**
     * Truncate text to maximum tokens while preserving word boundaries
     * 
     * @param text - Text to truncate
     * @param maxTokens - Maximum number of tokens
     * @returns Truncated text
     */
    truncateToTokens(text: string, maxTokens: number): string {
        if (!text || text.length === 0) {
            return '';
        }

        const tokens = encode(text);
        if (tokens.length <= maxTokens) {
            return text;
        }

        // Decode truncated tokens
        let truncated = decode(tokens.slice(0, maxTokens));

        // Find last complete word boundary (80% threshold to avoid losing too much)
        const minLength = Math.floor(truncated.length * 0.8);
        const lastSpace = truncated.lastIndexOf(' ');
        
        if (lastSpace > minLength) {
            truncated = truncated.slice(0, lastSpace);
        }

        return truncated.trim();
    }

    /**
     * Split text at approximately target token count
     * Returns [firstPart, remainingPart]
     * 
     * @param text - Text to split
     * @param targetTokens - Target number of tokens for first part
     * @returns Tuple of [firstPart, remainingPart]
     */
    splitAtTokenBoundary(text: string, targetTokens: number): [string, string] {
        if (!text || text.length === 0) {
            return ['', ''];
        }

        const tokens = encode(text);
        if (tokens.length <= targetTokens) {
            return [text, ''];
        }

        const firstPart = decode(tokens.slice(0, targetTokens));
        const rest = decode(tokens.slice(targetTokens));

        return [firstPart, rest];
    }

    /**
     * Check if text fits within token limit
     * 
     * @param text - Text to check
     * @param maxTokens - Maximum allowed tokens
     * @returns True if text fits within limit
     */
    fitsInTokenLimit(text: string, maxTokens: number): boolean {
        return this.countTokens(text) <= maxTokens;
    }

    /**
     * Get text that fits within token budget, preferring sentence boundaries
     * 
     * @param text - Source text
     * @param tokenBudget - Maximum tokens allowed
     * @returns Text that fits within budget at sentence boundary
     */
    getTextWithinBudget(text: string, tokenBudget: number): string {
        if (this.countTokens(text) <= tokenBudget) {
            return text;
        }

        // Start with truncation
        let result = this.truncateToTokens(text, tokenBudget);

        // Try to end at sentence boundary
        const sentenceEnders = ['. ', '? ', '! ', '.\n', '?\n', '!\n'];
        let bestEnd = -1;

        for (const ender of sentenceEnders) {
            const pos = result.lastIndexOf(ender);
            if (pos > result.length * 0.5 && pos > bestEnd) {
                bestEnd = pos + ender.length - 1; // Include the punctuation
            }
        }

        if (bestEnd > 0) {
            result = result.slice(0, bestEnd).trim();
        }

        return result;
    }

    /**
     * Estimate character count from token count
     * (Useful for pre-filtering before expensive token operations)
     * 
     * Average: ~4 chars per token for English
     * Range: 1-10 chars per token depending on content
     * 
     * @param tokenCount - Number of tokens
     * @returns Estimated character count (conservative lower bound)
     */
    estimateCharsFromTokens(tokenCount: number): number {
        // Conservative estimate: 3 chars per token (lower bound)
        return tokenCount * 3;
    }

    /**
     * Estimate token count from character count
     * (Useful for pre-filtering before expensive token operations)
     * 
     * @param charCount - Number of characters
     * @returns Estimated token count (conservative upper bound)
     */
    estimateTokensFromChars(charCount: number): number {
        // Conservative estimate: 1 token per 3 chars (upper bound)
        return Math.ceil(charCount / 3);
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { hits: number; misses: number; hitRate: number; size: number } {
        const total = this.cacheHits + this.cacheMisses;
        return {
            hits: this.cacheHits,
            misses: this.cacheMisses,
            hitRate: total > 0 ? this.cacheHits / total : 0,
            size: this.cache.size,
        };
    }

    /**
     * Clear the token count cache
     */
    clearCache(): void {
        this.cache.clear();
        this.cacheHits = 0;
        this.cacheMisses = 0;
        logger.debug('ProductionTokenizer cache cleared');
    }

    /**
     * Log cache statistics (useful for debugging)
     */
    logCacheStats(): void {
        const stats = this.getCacheStats();
        logger.info('ProductionTokenizer cache statistics', {
            hits: stats.hits,
            misses: stats.misses,
            hitRate: `${(stats.hitRate * 100).toFixed(2)}%`,
            cacheSize: stats.size,
            maxSize: this.config.cacheSize,
        });
    }
}

// Singleton instance for global use
let tokenizerInstance: ProductionTokenizer | null = null;

/**
 * Get the global tokenizer singleton
 * 
 * @param config - Optional configuration (only used on first call)
 * @returns ProductionTokenizer instance
 */
export function getTokenizer(config?: Partial<TokenizerConfig>): ProductionTokenizer {
    if (!tokenizerInstance) {
        tokenizerInstance = new ProductionTokenizer(config);
    }
    return tokenizerInstance;
}

/**
 * Reset the global tokenizer singleton (useful for testing)
 */
export function resetTokenizer(): void {
    if (tokenizerInstance) {
        tokenizerInstance.clearCache();
    }
    tokenizerInstance = null;
}

export default ProductionTokenizer;
