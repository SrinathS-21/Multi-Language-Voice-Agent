/**
 * Call Sessions - Voice call tracking for LiveKit
 * 
 * Tracks active and completed voice sessions with:
 * - Session lifecycle management
 * - Organization and agent scoping
 * - LiveKit room integration
 */

import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

// ============================================
// CREATE & UPDATE OPERATIONS
// ============================================

/**
 * Create a new call session
 */
export const create = mutation({
    args: {
        sessionId: v.string(),
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        roomName: v.optional(v.string()),
        participantIdentity: v.optional(v.string()),
        callType: v.union(v.literal("inbound"), v.literal("outbound"), v.literal("web")),
        config: v.optional(v.string()),
        metadata: v.optional(v.string()),
        // Telephony/SIP fields
        callerPhoneNumber: v.optional(v.string()),
        destinationPhoneNumber: v.optional(v.string()),
        callSid: v.optional(v.string()),
        sipParticipantId: v.optional(v.string()),
        callDirection: v.optional(v.union(v.literal("inbound"), v.literal("outbound"))),
        isTelephony: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const id = await ctx.db.insert("callSessions", {
            sessionId: args.sessionId,
            organizationId: args.organizationId,
            agentId: args.agentId,
            roomName: args.roomName,
            participantIdentity: args.participantIdentity,
            callType: args.callType,
            status: "active",
            startedAt: now,
            config: args.config,
            metadata: args.metadata,
            // Telephony fields
            callerPhoneNumber: args.callerPhoneNumber,
            destinationPhoneNumber: args.destinationPhoneNumber,
            callSid: args.callSid,
            sipParticipantId: args.sipParticipantId,
            callDirection: args.callDirection,
            isTelephony: args.isTelephony,
            createdAt: now,
            updatedAt: now,
        });
        return { _id: id, sessionId: args.sessionId };
    },
});

/**
 * Update session status
 */
export const updateStatus = mutation({
    args: {
        sessionId: v.string(),
        status: v.union(
            v.literal("active"),
            v.literal("completed"),
            v.literal("failed"),
            v.literal("expired")
        ),
        endedAt: v.optional(v.number()),
        durationSeconds: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("callSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) throw new Error(`Session not found: ${args.sessionId}`);

        const updates: any = {
            status: args.status,
            updatedAt: Date.now(),
        };

        if (args.endedAt !== undefined) updates.endedAt = args.endedAt;
        if (args.durationSeconds !== undefined) updates.durationSeconds = args.durationSeconds;

        await ctx.db.patch(session._id, updates);
        return { success: true };
    },
});

/**
 * Update session metadata
 */
export const updateMetadata = mutation({
    args: {
        sessionId: v.string(),
        metadata: v.string(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("callSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) throw new Error(`Session not found: ${args.sessionId}`);

        await ctx.db.patch(session._id, {
            metadata: args.metadata,
            updatedAt: Date.now(),
        });
        return { success: true };
    },
});

/**
 * End a session (mark as completed)
 */
export const endSession = mutation({
    args: {
        sessionId: v.string(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("callSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) throw new Error(`Session not found: ${args.sessionId}`);

        const now = Date.now();
        const durationSeconds = Math.floor((now - session.startedAt) / 1000);

        await ctx.db.patch(session._id, {
            status: "completed",
            endedAt: now,
            durationSeconds,
            updatedAt: now,
        });

        return { success: true, durationSeconds };
    },
});

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get session by sessionId
 */
export const getBySessionId = query({
    args: { sessionId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("callSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();
    },
});

/**
 * Get session by LiveKit room name
 */
export const getByRoomName = query({
    args: { roomName: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("callSessions")
            .withIndex("by_room_name", (q) => q.eq("roomName", args.roomName))
            .unique();
    },
});

/**
 * List sessions by organization
 */
export const listByOrganization = query({
    args: {
        organizationId: v.string(),
        status: v.optional(v.union(
            v.literal("active"),
            v.literal("completed"),
            v.literal("failed"),
            v.literal("expired")
        )),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 100;

        if (args.status) {
            return await ctx.db
                .query("callSessions")
                .withIndex("by_status_and_organization", (q) =>
                    q.eq("status", args.status!).eq("organizationId", args.organizationId)
                )
                .order("desc")
                .take(limit);
        }

        return await ctx.db
            .query("callSessions")
            .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
            .order("desc")
            .take(limit);
    },
});

/**
 * List sessions by agent
 */
export const listByAgent = query({
    args: {
        agentId: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 100;
        return await ctx.db
            .query("callSessions")
            .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .take(limit);
    },
});

/**
 * Get active sessions count for an agent (for rate limiting)
 */
export const getActiveCountByAgent = query({
    args: { agentId: v.string() },
    handler: async (ctx, args) => {
        const sessions = await ctx.db
            .query("callSessions")
            .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect();
        return sessions.length;
    },
});

/**
 * Update session with complete transcript
 * Called at end of call to store the entire conversation as a unified document
 */
export const updateTranscript = mutation({
    args: {
        sessionId: v.string(),
        transcript: v.array(v.object({
            timestamp: v.number(),
            speaker: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
            text: v.string(),
            type: v.optional(v.union(
                v.literal("speech"),
                v.literal("function_call"),
                v.literal("function_result")
            )),
            metadata: v.optional(v.object({
                functionName: v.optional(v.string()),
                latencyMs: v.optional(v.number()),
                confidence: v.optional(v.number()),
            })),
        })),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("callSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) throw new Error(`Session not found: ${args.sessionId}`);

        await ctx.db.patch(session._id, {
            transcript: args.transcript,
            updatedAt: Date.now(),
        });
        
        return { success: true, transcriptLength: args.transcript.length };
    },
});

/**
 * Delete a session
 */
export const deleteSession = mutation({
    args: { sessionId: v.string() },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("callSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (session) {
            await ctx.db.delete(session._id);
            return { deleted: true };
        }
        return { deleted: false };
    },
});

// ============================================
// DETAILED CALL LOG QUERIES
// ============================================

/**
 * Get detailed call logs for an agent with transcript data
 * Used for the Call History tab in agent detail page
 */
export const getDetailedCallsByAgent = query({
    args: {
        agentId: v.string(),
        limit: v.optional(v.number()),
        includeTranscript: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        const sessions = await ctx.db
            .query("callSessions")
            .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .take(limit);

        return sessions.map((session) => ({
            _id: session._id,
            sessionId: session.sessionId,
            callType: session.callType,
            status: session.status,
            callerPhoneNumber: session.callerPhoneNumber,
            destinationPhoneNumber: session.destinationPhoneNumber,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            durationSeconds: session.durationSeconds,
            isTelephony: session.isTelephony,
            transcript: args.includeTranscript ? session.transcript : undefined,
            transcriptLength: session.transcript?.length || 0,
            metadata: session.metadata,
        }));
    },
});

/**
 * Get detailed call logs for an organization with transcript data
 * Used for the organization-wide Calls page
 */
export const getDetailedCallsByOrganization = query({
    args: {
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        status: v.optional(v.union(
            v.literal("active"),
            v.literal("completed"),
            v.literal("failed"),
            v.literal("expired")
        )),
        limit: v.optional(v.number()),
        includeTranscript: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 100;
        
        let sessions;
        if (args.agentId) {
            sessions = await ctx.db
                .query("callSessions")
                .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
                .order("desc")
                .take(limit);
        } else {
            sessions = await ctx.db
                .query("callSessions")
                .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
                .order("desc")
                .take(limit);
        }

        // Filter by status if provided
        if (args.status) {
            sessions = sessions.filter((s) => s.status === args.status);
        }

        // Fetch agent names for each session
        const agentIds = Array.from(new Set(sessions.map((s) => s.agentId).filter(Boolean)));
        const agents = await Promise.all(
            agentIds.map(async (id) => {
                const agent = await ctx.db
                    .query("agents")
                    .filter((q) => q.eq(q.field("_id"), id as any))
                    .unique();
                return agent ? { id, name: agent.name } : null;
            })
        );
        const agentMap = new Map(agents.filter(Boolean).map((a) => [a!.id, a!.name]));

        return sessions.map((session) => ({
            _id: session._id,
            sessionId: session.sessionId,
            agentId: session.agentId,
            agentName: session.agentId ? agentMap.get(session.agentId) || "Unknown Agent" : "Unknown",
            callType: session.callType,
            status: session.status,
            callerPhoneNumber: session.callerPhoneNumber,
            destinationPhoneNumber: session.destinationPhoneNumber,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            durationSeconds: session.durationSeconds,
            isTelephony: session.isTelephony,
            transcript: args.includeTranscript ? session.transcript : undefined,
            transcriptLength: session.transcript?.length || 0,
            metadata: session.metadata,
        }));
    },
});

/**
 * Get a single call session with full transcript and interactions
 */
export const getCallWithTranscript = query({
    args: {
        sessionId: v.string(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db
            .query("callSessions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .unique();

        if (!session) return null;

        // Get agent name
        let agentName = "Unknown Agent";
        if (session.agentId) {
            const agent = await ctx.db
                .query("agents")
                .filter((q) => q.eq(q.field("_id"), session.agentId))
                .unique();
            if (agent) agentName = agent.name;
        }

        // Get interactions for this session
        const interactions = await ctx.db
            .query("callInteractions")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .order("asc")
            .collect();

        // Get metrics for this session
        const metrics = await ctx.db
            .query("callMetrics")
            .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
            .collect();

        return {
            ...session,
            agentName,
            interactions,
            metrics,
        };
    },
});
