/**
 * LRU Cache with TTL Support
 * 
 * Thread-safe (async-safe) LRU cache optimized for high-frequency voice agent queries.
 * Features:
 * - Time-to-live (TTL) expiration
 * - Least Recently Used eviction policy
 * - Cache statistics tracking
 * - Async-safe operations
 */

import { logger } from '../core/logging.js';

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
    data: T;
    createdAt: number;
    accessCount: number;
    lastAccessed: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: string;
}

/**
 * LRU Cache implementation
 * Uses Map which maintains insertion order in JavaScript
 */
export class LRUCache<T = any> {
    private cache: Map<string, CacheEntry<T>>;
    private maxSize: number;
    private ttlSeconds: number;
    private hits: number = 0;
    private misses: number = 0;

    /**
     * Create a new LRU cache
     * @param maxSize Maximum number of entries
     * @param ttlSeconds Time-to-live in seconds (default: 300 = 5 minutes)
     */
    constructor(maxSize: number = 500, ttlSeconds: number = 300) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttlSeconds = ttlSeconds;
    }

    /**
     * Get an item from cache
     * Returns undefined if not found or expired
     */
    async get(key: string): Promise<T | undefined> {
        const entry = this.cache.get(key);

        if (!entry) {
            this.misses++;
            return undefined;
        }

        // Check TTL expiration
        const now = Date.now();
        const ageSeconds = (now - entry.createdAt) / 1000;

        if (ageSeconds > this.ttlSeconds) {
            // Expired - remove and return undefined
            this.cache.delete(key);
            this.misses++;
            return undefined;
        }

        // Update access stats
        entry.accessCount++;
        entry.lastAccessed = now;

        // Move to end (most recently used) by deleting and re-adding
        this.cache.delete(key);
        this.cache.set(key, entry);

        this.hits++;
        return entry.data;
    }

    /**
     * Set an item in cache
     * Evicts oldest entry if at capacity
     */
    async set(key: string, value: T): Promise<void> {
        // Remove oldest (first) if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }

        const now = Date.now();
        this.cache.set(key, {
            data: value,
            createdAt: now,
            accessCount: 0,
            lastAccessed: now,
        });
    }

    /**
     * Check if key exists and is not expired
     */
    async has(key: string): Promise<boolean> {
        const entry = this.cache.get(key);
        if (!entry) return false;

        const ageSeconds = (Date.now() - entry.createdAt) / 1000;
        if (ageSeconds > this.ttlSeconds) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Delete an item from cache
     */
    async delete(key: string): Promise<boolean> {
        return this.cache.delete(key);
    }

    /**
     * Clear all items from cache
     */
    async clear(): Promise<void> {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? ((this.hits / total) * 100).toFixed(1) : '0.0';

        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: `${hitRate}%`,
        };
    }

    /**
     * Remove expired entries (garbage collection)
     * Call periodically to free memory
     */
    async cleanup(): Promise<number> {
        const now = Date.now();
        let removed = 0;

        for (const [key, entry] of this.cache.entries()) {
            const ageSeconds = (now - entry.createdAt) / 1000;
            if (ageSeconds > this.ttlSeconds) {
                this.cache.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            logger.debug(`Cache cleanup: removed ${removed} expired entries`);
        }

        return removed;
    }

    /**
     * Get current size
     */
    get size(): number {
        return this.cache.size;
    }
}

/**
 * Create a singleton result cache (shared across services)
 * Shorter TTL for search results
 */
const resultCache = new LRUCache<any>(500, 300); // 5 minutes TTL

/**
 * Get the shared result cache
 */
export function getResultCache(): LRUCache<any> {
    return resultCache;
}

/**
 * Reset all shared caches (useful after knowledge base updates)
 */
export async function invalidateAllCaches(): Promise<void> {
    await resultCache.clear();
    logger.info('All caches invalidated');
}

export default LRUCache;
