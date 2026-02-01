/**
 * Call Interactions - Conversation logging for voice sessions
 * 
 * Logs:
 * - User messages (transcriptions)
 * - Agent responses
 * - Function calls and results
 * - Latency metrics per interaction
 */

import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

// ============================================
// LOG OPERATIONS
// ============================================

/**
 * Log a user message (speech transcription)
 */
export const logUserMessage = mutation({
    args: {
        sessionId: v.string(),
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        userInput: v.string(),
        latencyMs: v.optional(v.number()), // STT latency
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("callInteractions", {
            sessionId: args.sessionId,
            organizationId: args.organizationId,
            agentId: args.agentId,
            interactionType: "user_message",
            timestamp: Date.now(),
            userInput: args.userInput,
            latencyMs: args.latencyMs,
        });
    },
});

/**
 * Log an agent response
 */
export const logAgentResponse = mutation({
    args: {
        sessionId: v.string(),
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        agentResponse: v.string(),
        latencyMs: v.optional(v.number()), // LLM + TTS latency
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("callInteractions", {
            sessionId: args.sessionId,
            organizationId: args.organizationId,
            agentId: args.agentId,
            interactionType: "agent_response",
            timestamp: Date.now(),
            agentResponse: args.agentResponse,
            latencyMs: args.latencyMs,
        });
    },
});

/**
 * Log a function call (tool use)
 */
export const logFunctionCall = mutation({
    args: {
        sessionId: v.string(),
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        functionName: v.string(),
        functionParams: v.string(), // JSON string
        functionResult: v.string(), // JSON string
        latencyMs: v.optional(v.number()), // Function execution latency
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("callInteractions", {
            sessionId: args.sessionId,
            organizationId: args.organizationId,
            agentId: args.agentId,
            interactionType: "function_call",
            timestamp: Date.now(),
            functionName: args.functionName,
            functionParams: args.functionParams,
            functionResult: args.functionResult,
            latencyMs: args.latencyMs,
        });
    },
});

/**
 * Batch log interactions at end of call
 * Saves all user messages, agent responses, and function calls in one transaction
 */
export const logInteractionsBatch = mutation({
    args: {
        interactions: v.array(v.object({
            sessionId: v.string(),
            organizationId: v.string(),
            agentId: v.optional(v.string()),
            interactionType: v.union(
                v.literal("user_message"),
                v.literal("agent_response"),
                v.literal("function_call")
            ),
            timestamp: v.number(),
            userInput: v.optional(v.string()),
            agentResponse: v.optional(v.string()),
            functionName: v.optional(v.string()),
            functionParams: v.optional(v.string()),
            functionResult: v.optional(v.string()),
            latencyMs: v.optional(v.number()),
        })),
    },
    handler: async (ctx, args) => {
        const ids = await Promise.all(
            args.interactions.map((interaction) =>
                ctx.db.insert("callInteractions", {
                    sessionId: interaction.sessionId,
                    organizationId: interaction.organizationId,
                    agentId: interaction.agentId,
                    interactionType: interaction.interactionType,
                    timestamp: interaction.timestamp,
                    userInput: interaction.userInput,
                    agentResponse: interaction.agentResponse,
                    functionName: interaction.functionName,
                    functionParams: interaction.functionParams,
                    functionResult: interaction.functionResult,
                    latencyMs: interaction.latencyMs,
                })
            )
        );
        return { count: ids.length, ids };
    },
});

/**
 * Update sentiment for an interaction
 */
export const updateSentiment = mutation({
    args: {
        interactionId: v.id("callInteractions"),
        sentiment: v.union(
            v.literal("positive"),
            v.literal("negative"),
            v.literal("neutral")
        ),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.interactionId, {
            sentiment: args.sentiment,
        });
        return { success: true };
    },
});

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get all interactions for a session (conversation history)
 */
export const getBySessionId = query({
    args: { sessionId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("callInteractions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .order("asc")
            .collect();
    },
});

/**
 * Get recent interactions for a session (for context window)
 */
export const getRecentBySessionId = query({
    args: {
        sessionId: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 10;
        const interactions = await ctx.db
            .query("callInteractions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .order("desc")
            .take(limit);
        
        // Return in chronological order
        return interactions.reverse();
    },
});

/**
 * Get interactions by organization (for analytics)
 */
export const getByOrganizationId = query({
    args: {
        organizationId: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 1000;
        return await ctx.db
            .query("callInteractions")
            .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
            .order("desc")
            .take(limit);
    },
});

/**
 * Get interactions by agent (for ML training/analytics)
 */
export const getByAgentId = query({
    args: {
        agentId: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 1000;
        return await ctx.db
            .query("callInteractions")
            .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .take(limit);
    },
});

/**
 * Get function calls for a session
 */
export const getFunctionCallsBySessionId = query({
    args: { sessionId: v.string() },
    handler: async (ctx, args) => {
        const interactions = await ctx.db
            .query("callInteractions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .filter((q) => q.eq(q.field("interactionType"), "function_call"))
            .order("asc")
            .collect();
        return interactions;
    },
});

/**
 * Count interactions by type for a session
 */
export const countBySessionId = query({
    args: { sessionId: v.string() },
    handler: async (ctx, args) => {
        const interactions = await ctx.db
            .query("callInteractions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .collect();

        return {
            total: interactions.length,
            userMessages: interactions.filter((i) => i.interactionType === "user_message").length,
            agentResponses: interactions.filter((i) => i.interactionType === "agent_response").length,
            functionCalls: interactions.filter((i) => i.interactionType === "function_call").length,
        };
    },
});
