/**
 * RAG Warmer - Internal functions to keep RAG service warm
 * 
 * These functions are called by crons to prevent cold starts.
 * A minimal query is executed to keep:
 * - Convex function instance warm
 * - OpenAI embedding connection alive
 * - Vector index ready for queries
 */

import { internalAction } from "./_generated/server.js";
import { rag } from "./rag.js";

/**
 * Warm the RAG service with a minimal query
 * Uses a generic namespace that always exists
 */
export const warmRag = internalAction({
    args: {},
    handler: async (ctx) => {
        const startTime = Date.now();
        
        try {
            // Execute a minimal search to warm:
            // 1. The Convex action runtime
            // 2. OpenAI embedding API connection
            // 3. Vector search index
            await rag.search(ctx, {
                namespace: "__warmup__",  // Non-existent namespace, fast
                query: "warmup ping",
                limit: 1,
                vectorScoreThreshold: 0.99,  // High threshold = no results returned
            });
            
            const latency = Date.now() - startTime;
            console.log(`[RAG Warmer] Warm-up completed in ${latency}ms`);
            
            return { success: true, latency };
        } catch (_error) {
            // Warmup still succeeded even if search returns empty
            const latency = Date.now() - startTime;
            console.log(`[RAG Warmer] Warm-up completed in ${latency}ms (no results expected)`);
            return { success: true, latency };
        }
    },
});

/**
 * Manual warm-up function - can be called before expected high traffic
 * Call this when you know calls are about to come in
 * 
 * Runs 3 queries IN PARALLEL for faster warmup:
 * - Sequential: ~1400ms (800 + 400 + 200)
 * - Parallel: ~800ms (max of all queries)
 */
export const manualWarmup = internalAction({
    args: {},
    handler: async (ctx) => {
        const overallStart = Date.now();
        
        // Run 3 warm-up queries IN PARALLEL to fully initialize connection pool
        const warmupPromises = [0, 1, 2].map(async (i) => {
            const start = Date.now();
            try {
                await rag.search(ctx, {
                    namespace: "__warmup__",
                    query: `warmup ${i}`,
                    limit: 1,
                    vectorScoreThreshold: 0.99,
                });
            } catch (_e) {
                // Expected - warmup namespace doesn't exist
            }
            return Date.now() - start;
        });
        
        // Wait for all queries to complete in parallel
        const results = await Promise.all(warmupPromises);
        const totalLatency = Date.now() - overallStart;
        
        console.log(`[RAG Warmer] Manual warm-up latencies: ${results.join('ms, ')}ms (total: ${totalLatency}ms parallel)`);
        return { 
            success: true, 
            latencies: results,
            totalLatency,
            avgLatency: results.reduce((a, b) => a + b, 0) / results.length
        };
    },
});
