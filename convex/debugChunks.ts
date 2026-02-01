/**
 * Query to list all chunks by agentId
 * Used for debugging namespace issues
 */

import { query } from "./_generated/server.js";
import { v } from "convex/values";

/**
 * List chunks by agent ID for debugging
 */
export const listChunksByAgent = query({
    args: {
        agentId: v.string(),
    },
    handler: async (ctx, args) => {
        const chunks = await ctx.db
            .query("chunks")
            .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
            .collect();

        return chunks.map(chunk => ({
            chunkId: chunk.chunkId,
            documentId: chunk.documentId,
            agentId: chunk.agentId,
            ragNamespace: chunk.ragNamespace,
            ragEntryId: chunk.ragEntryId,
            chunkIndex: chunk.chunkIndex,
            totalChunks: chunk.totalChunks,
            text: chunk.text.substring(0, 100) + '...', // Preview only
            createdAt: chunk.createdAt,
        }));
    },
});

/**
 * List chunks by namespace for debugging
 */
export const listChunksByNamespace = query({
    args: {
        namespace: v.string(),
    },
    handler: async (ctx, args) => {
        const chunks = await ctx.db
            .query("chunks")
            .filter((q) => q.eq(q.field("ragNamespace"), args.namespace))
            .collect();

        return chunks.map(chunk => ({
            chunkId: chunk.chunkId,
            documentId: chunk.documentId,
            agentId: chunk.agentId,
            ragNamespace: chunk.ragNamespace,
            ragEntryId: chunk.ragEntryId,
            chunkIndex: chunk.chunkIndex,
            totalChunks: chunk.totalChunks,
            text: chunk.text.substring(0, 100) + '...', // Preview only
            createdAt: chunk.createdAt,
        }));
    },
});
