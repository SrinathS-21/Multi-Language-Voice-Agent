/**
 * Voice Knowledge Service
 * 
 * Optimized knowledge retrieval service for voice agents with caching
 * and low-latency responses.
 * 
 * Domain-agnostic - works with any type of business content.
 * 
 * Features:
 * - Multi-level caching (embedding cache, result cache)
 * - Parallel search across catalog and knowledge
 * - Latency-optimized response formatting
 * - Voice-friendly output formatting
 */

import { logger } from '../../core/logging.js';
import { getConvexClient, isConvexConfigured } from '../../core/convex-client.js';
import { LRUCache, getResultCache, invalidateAllCaches } from '../../utils/cache.js';

import {
    VoiceSearchResponse,
    VoiceSearchItem,
    AgentRagConfig,
    BusinessInfoResult,
    HybridSearchResult,
    HybridSearchOptions,
    CacheStats,
    WarmupResult,
} from './types.js';
import { parseEnrichedText, formatPrice, getPriceRange } from './parser.js';
import { expandQuery, getAdjustedThreshold } from './expander.js';

/**
 * Voice Knowledge Service class
 */
export class VoiceKnowledgeService {
    private organizationId: string;
    private agentId: string;
    private convexConfigured: boolean;
    private resultCache: LRUCache<VoiceSearchResponse>;

    // Context cache per organization (with TTL)
    private orgContextCache: Map<string, { timestamp: number; data: any }>;
    private orgCacheTtl: number = 600000; // 10 minutes

    /**
     * Initialize voice knowledge service for an agent
     */
    constructor(organizationId: string, agentId: string) {
        this.organizationId = organizationId;
        this.agentId = agentId;
        this.convexConfigured = isConvexConfigured();
        this.resultCache = getResultCache();
        this.orgContextCache = new Map();

        logger.info(
            `VoiceKnowledgeService ready`
        );
    }

    /**
     * Invalidate caches when knowledge base is updated
     */
    static async invalidateCache(organizationId?: string): Promise<void> {
        await invalidateAllCaches();
        logger.info(`Invalidated caches for org: ${organizationId ?? 'all'}`);
    }

    /**
     * Warm up the RAG service for this agent's namespace
     * 
     * Part of Hybrid Warmup Strategy:
     * - Layer 1: Global cron (4min) keeps Convex runtime warm
     * - Layer 2: Per-agent init (this method) warms agent-specific namespace
     * 
     * Call this at agent initialization to ensure first user query is fast.
     * Uses fire-and-forget pattern - does not block agent startup.
     * 
     * Expected latency improvement:
     * - Cold start: 2000-2600ms → Warm: 500-700ms (65-73% improvement)
     * - Combined with cron: <0.2% cold start probability
     * 
     * @returns Promise with warmup result (success, latency)
     */
    async warmupNamespace(): Promise<WarmupResult> {
        const startTime = Date.now();

        if (!this.convexConfigured) {
            const latency = Date.now() - startTime;
            logger.debug('RAG warmup skipped - Convex not configured');
            return { success: false, latency, message: 'Convex not configured' };
        }

        try {
            const convex = getConvexClient();
            
            // Call rag:warmup with agent's namespace
            // This warms: Convex runtime, OpenAI embedding connection, vector index
            const result = await convex.action('rag:warmup', {
                namespace: this.agentId,
            });

            const latency = Date.now() - startTime;
            logger.info(`RAG warmup completed for agent ${this.agentId}`, {
                latency,
                agentId: this.agentId,
                organizationId: this.organizationId,
            });

            return { 
                success: true, 
                latency, 
                message: `Agent namespace warmed in ${latency}ms` 
            };
        } catch (error) {
            const latency = Date.now() - startTime;
            // Warmup errors are non-critical - log but don't fail
            logger.warning(`RAG warmup failed for agent ${this.agentId}`, {
                error: error instanceof Error ? error.message : String(error),
                latency,
                agentId: this.agentId,
            });

            return { 
                success: false, 
                latency, 
                message: `Warmup failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
            };
        }
    }

    /**
     * Fast semantic search using RAG
     * Optimized for voice agent function calls
     * 
     * Works with any domain: products, menu items, services, FAQs, etc.
     * Pure semantic search - domain agnostic.
     */
    async search(
        query: string,
        limit?: number,
        agentConfig?: { rag?: AgentRagConfig }
    ): Promise<VoiceSearchResponse> {
        const startTime = Date.now();

        // Expand short queries for better semantic matching
        const { expanded: expandedQuery, infoType } = expandQuery(query);

        // Get RAG config from agent configuration
        const ragConfig = agentConfig?.rag ?? {};
        const topK = limit ?? ragConfig.topK ?? 5;
        
        // Lower threshold for info-type queries (address, hours, contact) - they need more recall
        const baseThreshold = ragConfig.similarityThreshold ?? 0.25;
        const similarityThreshold = getAdjustedThreshold(baseThreshold, infoType);

        const cacheKey = `items:${this.agentId}:${expandedQuery}:${topK}`;

        // Check result cache
        const cached = await this.resultCache.get(cacheKey);
        if (cached) {
            logger.debug(`Cache hit for items search: ${query}`);
            return cached;
        }

        if (!this.convexConfigured) {
            return {
                found: false,
                message: 'Knowledge base not configured',
            };
        }

        try {
            const convex = getConvexClient();

            // Pure semantic search - agent-scoped namespace with expanded query
            const results = await convex.action('rag:search', {
                namespace: this.agentId,
                query: expandedQuery, // Use expanded query for better embeddings
                limit: topK,
                minScore: similarityThreshold,
            }) as any;

            const rawResults = results?.results ?? [];
            const wasExpanded = expandedQuery !== query;
            const topScore = rawResults[0]?.score ?? 0;
            
            logger.info(
                `RAG search completed`,
                {
                    originalQuery: query,
                    queryLength: query.length,
                    wasExpanded,
                    expandedQuery: wasExpanded ? expandedQuery : null,
                    infoType: infoType ?? null,
                    threshold: similarityThreshold,
                    topK,
                    resultsFound: rawResults.length,
                    topScore: rawResults.length > 0 ? topScore.toFixed(3) : null,
                    expansionImpact: wasExpanded ? 'needs_validation' : 'not_applicable'
                }
            );

            let response: VoiceSearchResponse;

            if (rawResults.length === 0) {
                response = {
                    found: false,
                    message: `No items found matching '${query}'`,
                    suggestions: [
                        'Try a different search term',
                        'Ask about categories',
                    ],
                };
            } else {
                // Format for voice response (concise)
                const items: VoiceSearchItem[] = rawResults.map((item: any) => {
                    const text = item.text ?? '';
                    const score = item.score ?? 0;

                    // Parse enriched text format
                    const parsed = parseEnrichedText(text);

                    return {
                        ...parsed,
                        score,
                    };
                });

                response = {
                    found: true,
                    count: items.length,
                    items,
                };
            }

            // Cache result
            await this.resultCache.set(cacheKey, response);

            const latencyMs = Date.now() - startTime;
            
            // Warm/cold state heuristic for monitoring
            // Warm state: <1000ms (Convex runtime + OpenAI connection already initialized)
            // Cold state: >1000ms (typically 2000-2600ms for full cold start)
            const wasWarm = latencyMs < 1000;
            
            logger.info(`Items search completed`, {
                query,
                latencyMs,
                wasWarm,
                resultCount: response.count ?? 0,
                agentId: this.agentId,
            });

            return response;
        } catch (error) {
            logger.error(`Items search failed: ${(error as Error).message}`);
            return {
                found: false,
                error: 'Search temporarily unavailable',
                message: 'Please try again or ask about specific items',
            };
        }
    }

    /**
     * Search with context for voice response
     * Returns both results and formatted context for LLM
     * 
     * Phase 2 Optimization: Added LRU cache lookup to avoid repeated RAG searches
     */
    async searchWithContext(
        query: string,
        limit: number = 5
    ): Promise<{ response: VoiceSearchResponse; context: string }> {
        const startTime = Date.now();

        if (!this.convexConfigured) {
            return {
                response: { found: false, message: 'Knowledge base not configured' },
                context: '',
            };
        }

        // Phase 2: Cache lookup before RAG search
        const cacheKey = `rag:${this.agentId}:${query.toLowerCase().trim()}:${limit}`;
        try {
            const cached = await this.resultCache.get(cacheKey);
            // The cache stores the full result object as unknown, need to cast back
            if (cached && typeof cached === 'object' && 'response' in (cached as any) && 'context' in (cached as any)) {
                const cachedResult = cached as unknown as { response: VoiceSearchResponse; context: string };
                const latencyMs = Date.now() - startTime;
                logger.info(`RAG cache HIT - skipping Convex call`, {
                    query,
                    latencyMs,
                    cacheKey,
                    agentId: this.agentId,
                });
                return cachedResult;
            }
        } catch (cacheError) {
            // Cache miss or error - continue with RAG search
            logger.debug('Cache miss or error', { cacheKey, error: (cacheError as Error).message });
        }

        try {
            const convex = getConvexClient();

            // Expand query for better semantic matching
            const { expanded: expandedQuery, infoType } = expandQuery(query);
            const minScore = getAdjustedThreshold(0.25, infoType);

            const results = await convex.action('rag:search', {
                namespace: this.agentId,
                query: expandedQuery,
                limit,
                minScore,
            }) as any;

            const rawResults = results?.results ?? [];
            const formattedText = results?.text ?? '';

            let response: VoiceSearchResponse;

            if (rawResults.length === 0) {
                response = {
                    found: false,
                    message: `No information found for '${query}'`,
                };
            } else {
                const items: VoiceSearchItem[] = rawResults.map((item: any) => ({
                    ...parseEnrichedText(item.text ?? ''),
                    score: item.score ?? 0,
                }));

                response = {
                    found: true,
                    count: items.length,
                    items,
                };
            }

            const latencyMs = Date.now() - startTime;
            
            // Warm/cold state heuristic for monitoring
            const wasWarm = latencyMs < 1000;
            
            logger.info(`Context search completed`, {
                query,
                latencyMs,
                wasWarm,
                resultCount: response.count ?? 0,
                agentId: this.agentId,
            });

            // Phase 2: Cache the result for future queries (5 min TTL)
            const result = {
                response,
                context: formattedText,
            };
            
            // Only cache successful results with content
            if (response.found && formattedText) {
                this.resultCache.set(cacheKey, result as any).catch(err => {
                    logger.debug('Failed to cache RAG result', { error: err.message });
                });
            }

            return result;
        } catch (error) {
            logger.error(`Context search failed: ${(error as Error).message}`);
            return {
                response: { found: false, error: 'Search failed' },
                context: '',
            };
        }
    }

    /**
     * Get concise answer for voice response
     * Formats results specifically for TTS output
     */
    async getVoiceAnswer(
        query: string,
        maxItems: number = 3
    ): Promise<string> {
        const { response, context } = await this.searchWithContext(query, maxItems);

        if (!response.found || !response.items || response.items.length === 0) {
            return `I couldn't find any information about ${query}. Would you like to ask about something else?`;
        }

        const items = response.items;

        if (items.length === 1) {
            const item = items[0];
            if (item.price > 0) {
                return `${item.name} is ${formatPrice(item.price)}. ${item.description || ''}`.trim();
            }
            return `${item.name}. ${item.description || ''}`.trim();
        }

        // Multiple items - summarize
        const itemNames = items.slice(0, 3).map(i => i.name).join(', ');
        const priceRange = getPriceRange(items);

        if (priceRange) {
            return `I found ${items.length} options: ${itemNames}. Prices range from ${priceRange}. Would you like details on any of these?`;
        }

        return `I found ${items.length} options: ${itemNames}. Would you like more details?`;
    }

    /**
     * Hybrid search - parallel search across catalog AND knowledge base
     * 
     * Runs both searches in parallel for lowest latency.
     * Useful for multi-faceted queries like "hours and menu items".
     * 
     * Example:
     *   User: "What are your hours and do you have gluten-free options?"
     *   → Searches items AND knowledge in parallel (single latency hit)
     */
    async hybridSearch(
        query: string,
        options: HybridSearchOptions = {}
    ): Promise<HybridSearchResult> {
        const startTime = Date.now();

        const {
            includeItems = true,
            includeKnowledge = true,
            itemsLimit = 3,
            knowledgeLimit = 5,
        } = options;

        // Build parallel tasks
        const tasks: Array<Promise<VoiceSearchResponse>> = [];
        const taskNames: string[] = [];

        if (includeItems) {
            tasks.push(this.search(query, itemsLimit));
            taskNames.push('items');
        }

        if (includeKnowledge) {
            tasks.push(this.searchKnowledge(query, knowledgeLimit));
            taskNames.push('knowledge');
        }

        if (tasks.length === 0) {
            return { results: {}, latencyMs: 0 };
        }

        // Run all searches in parallel
        const results = await Promise.allSettled(tasks);

        // Combine results
        const combined: {
            items?: VoiceSearchResponse;
            knowledge?: VoiceSearchResponse;
        } = {};

        results.forEach((result, index) => {
            const name = taskNames[index] as 'items' | 'knowledge';
            if (result.status === 'fulfilled') {
                combined[name] = result.value;
            } else {
                logger.error(`Hybrid search task ${name} failed`, {
                    error: result.reason,
                });
                combined[name] = {
                    found: false,
                    error: `Search failed: ${result.reason}`,
                };
            }
        });

        const latencyMs = Date.now() - startTime;
        logger.info(
            `Hybrid search completed in ${latencyMs}ms: ${query}`,
            {
                itemsFound: combined.items?.found ?? false,
                knowledgeFound: combined.knowledge?.found ?? false,
            }
        );

        return {
            results: combined,
            latencyMs,
        };
    }

    /**
     * Search knowledge base for FAQ, policies, information
     * Separate from catalog search for better targeting
     */
    async searchKnowledge(
        query: string,
        limit: number = 3
    ): Promise<VoiceSearchResponse> {
        const startTime = Date.now();
        const cacheKey = `knowledge:${this.agentId}:${query}:${limit}`;

        // Check cache
        const cached = await this.resultCache.get(cacheKey);
        if (cached) {
            logger.debug(`Cache hit for knowledge search: ${query}`);
            return cached;
        }

        if (!this.convexConfigured) {
            return { found: false, message: 'Knowledge base not configured' };
        }

        try {
            const convex = getConvexClient();

            const results = await convex.action('rag:search', {
                namespace: this.agentId,
                query,
                limit,
                minScore: 0.25,
            }) as any;

            const rawResults = results?.results ?? [];

            let response: VoiceSearchResponse;

            if (rawResults.length === 0) {
                response = {
                    found: false,
                    message: "I don't have specific information about that.",
                };
            } else {
                // Combine top results into coherent answer
                const texts: string[] = [];
                for (const r of rawResults.slice(0, 2)) {
                    const text = r.text ?? '';
                    // Parse enriched format if present
                    if (text.includes(' | ')) {
                        const parsed = parseEnrichedText(text);
                        if (parsed.description) {
                            texts.push(parsed.description);
                        } else {
                            texts.push(text);
                        }
                    } else {
                        texts.push(text);
                    }
                }

                const combined = texts.join(' ').slice(0, 500); // Limit for voice

                response = {
                    found: true,
                    message: combined,
                    count: rawResults.length,
                };
            }

            // Cache result
            await this.resultCache.set(cacheKey, response);

            const latencyMs = Date.now() - startTime;
            logger.info(`Knowledge search completed in ${latencyMs}ms: ${query}`);

            return response;
        } catch (error) {
            logger.error(`Knowledge search failed: ${(error as Error).message}`);
            return {
                found: false,
                error: 'Knowledge search unavailable',
            };
        }
    }

    /**
     * Get structured business information (hours, location, contact, policies, features)
     * 
     * Uses organization context cache for fast responses.
     * Optimized for frequently asked questions like hours and location.
     * 
     * Falls back to knowledge search if data not in org config.
     */
    async getBusinessInfo(
        infoType: 'hours' | 'location' | 'contact' | 'policies' | 'features' | 'general'
    ): Promise<BusinessInfoResult> {
        // Check organization context cache
        const cacheEntry = this.orgContextCache.get(this.organizationId);
        let orgData: any = null;

        if (cacheEntry && Date.now() - cacheEntry.timestamp < this.orgCacheTtl) {
            orgData = cacheEntry.data;
        } else if (this.convexConfigured) {
            // Fetch from database
            try {
                const convex = getConvexClient();
                orgData = await convex.query('organizations:get', {
                    id: this.organizationId,
                }) as any;

                if (orgData) {
                    this.orgContextCache.set(this.organizationId, {
                        timestamp: Date.now(),
                        data: orgData,
                    });
                }
            } catch (error) {
                logger.error(`Failed to fetch org data: ${(error as Error).message}`);
            }
        }

        // Try to extract from config JSON
        if (orgData?.config) {
            try {
                const config = typeof orgData.config === 'string' 
                    ? JSON.parse(orgData.config)
                    : orgData.config;
                const business = config.business ?? {};

                switch (infoType) {
                    case 'hours': {
                        const hours = business.hours ?? {};
                        if (Object.keys(hours).length > 0) {
                            const today = new Date()
                                .toLocaleDateString('en-US', { weekday: 'long' })
                                .toLowerCase();
                            const todayHours = hours[today] ?? 'closed';
                            return {
                                found: true,
                                today: todayHours,
                                hours,
                                message: `Today we're open ${todayHours}`,
                            };
                        }
                        break;
                    }

                    case 'location': {
                        const contact = business.contact ?? {};
                        if (contact.address) {
                            return {
                                found: true,
                                address: contact.address,
                                phone: contact.phone ?? '',
                                message: `We're located at ${contact.address}`,
                            };
                        }
                        break;
                    }

                    case 'contact': {
                        const contact = business.contact ?? {};
                        if (Object.keys(contact).length > 0) {
                            return {
                                found: true,
                                contact,
                                message: `Contact: ${contact.phone ?? ''} ${contact.email ?? ''}`.trim(),
                            };
                        }
                        break;
                    }

                    case 'policies': {
                        const policies = config.policies ?? {};
                        if (Object.keys(policies).length > 0) {
                            return {
                                found: true,
                                policies,
                                message: 'Policy information retrieved',
                            };
                        }
                        break;
                    }

                    case 'features': {
                        const features = business.features ?? [];
                        if (features.length > 0) {
                            return {
                                found: true,
                                features,
                                message: `We offer: ${features.join(', ')}`,
                            };
                        }
                        break;
                    }
                }
            } catch (e) {
                logger.warning(`Failed to parse org config: ${(e as Error).message}`);
            }
        }

        // Fallback to knowledge search
        logger.debug(`Falling back to knowledge search for business ${infoType}`);
        const searchResult = await this.searchKnowledge(`business ${infoType}`, 2);
        
        return {
            found: searchResult.found,
            message: searchResult.message,
            data: searchResult,
        };
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): CacheStats {
        const stats = this.resultCache.getStats();
        return {
            hits: stats.hits,
            misses: stats.misses,
            hitRate: stats.hitRate,
        };
    }
}

/**
 * Factory function to create voice knowledge service for an agent
 */
export function createVoiceKnowledgeService(
    organizationId: string,
    agentId: string
): VoiceKnowledgeService {
    return new VoiceKnowledgeService(organizationId, agentId);
}
