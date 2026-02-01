/**
 * Documents - Knowledge base document management
 * 
 * Tracks uploaded files per-agent:
 * - Document metadata and status
 * - Processing progress
 * - RAG entry associations
 */

import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

// ============================================
// CREATE OPERATIONS
// ============================================

/**
 * Create a new document record
 */
export const create = mutation({
    args: {
        organizationId: v.string(),
        agentId: v.string(),
        documentId: v.string(),
        fileName: v.string(),
        fileType: v.string(),
        fileSize: v.number(),
        sourceType: v.string(),
        status: v.union(
            v.literal("uploading"),
            v.literal("processing"),
            v.literal("completed"),
            v.literal("failed")
        ),
        chunkCount: v.number(),
        metadata: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const id = await ctx.db.insert("documents", {
            organizationId: args.organizationId,
            agentId: args.agentId,
            documentId: args.documentId,
            fileName: args.fileName,
            fileType: args.fileType,
            fileSize: args.fileSize,
            sourceType: args.sourceType,
            status: args.status,
            chunkCount: args.chunkCount,
            metadata: args.metadata,
            uploadedAt: Date.now(),
        });
        return id;
    },
});

// ============================================
// UPDATE OPERATIONS
// ============================================

/**
 * Update document status
 */
export const updateStatus = mutation({
    args: {
        documentId: v.string(),
        status: v.union(
            v.literal("uploading"),
            v.literal("processing"),
            v.literal("completed"),
            v.literal("failed")
        ),
        chunkCount: v.optional(v.number()),
        ragEntryIds: v.optional(v.array(v.string())),
        errorMessage: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const doc = await ctx.db
            .query("documents")
            .withIndex("by_document_id", (q) => q.eq("documentId", args.documentId))
            .unique();

        if (!doc) {
            throw new Error(`Document not found: ${args.documentId}`);
        }

        const updates: any = {
            status: args.status,
            processedAt: Date.now(),
        };

        if (args.chunkCount !== undefined) updates.chunkCount = args.chunkCount;
        if (args.ragEntryIds !== undefined) updates.ragEntryIds = args.ragEntryIds;
        if (args.errorMessage !== undefined) updates.errorMessage = args.errorMessage;

        await ctx.db.patch(doc._id, updates);
        return doc._id;
    },
});

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get document by ID
 */
export const getByDocumentId = query({
    args: { documentId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("documents")
            .withIndex("by_document_id", (q) => q.eq("documentId", args.documentId))
            .unique();
    },
});

/**
 * List documents by organization
 */
export const listByOrganization = query({
    args: {
        organizationId: v.string(),
        status: v.optional(v.union(
            v.literal("uploading"),
            v.literal("processing"),
            v.literal("completed"),
            v.literal("failed")
        )),
    },
    handler: async (ctx, args) => {
        const docs = await ctx.db
            .query("documents")
            .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
            .collect();

        if (args.status) {
            return docs.filter((doc) => doc.status === args.status);
        }
        return docs;
    },
});

/**
 * List documents by agent
 */
export const listByAgentId = query({
    args: {
        agentId: v.string(),
        status: v.optional(v.union(
            v.literal("uploading"),
            v.literal("processing"),
            v.literal("completed"),
            v.literal("failed")
        )),
    },
    handler: async (ctx, args) => {
        if (args.status) {
            return await ctx.db
                .query("documents")
                .withIndex("by_agent_and_status", (q) =>
                    q.eq("agentId", args.agentId).eq("status", args.status!)
                )
                .collect();
        }

        return await ctx.db
            .query("documents")
            .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
            .collect();
    },
});

/**
 * Alias for listByAgentId (matches API naming)
 */
export const listByAgent = listByAgentId;

/**
 * Get document count by agent
 */
export const getCountByAgentId = query({
    args: { agentId: v.string() },
    handler: async (ctx, args) => {
        const docs = await ctx.db
            .query("documents")
            .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
            .collect();
        return docs.length;
    },
});

// ============================================
// DELETE OPERATIONS
// ============================================

/**
 * Delete document by ID
 */
export const deleteByDocumentId = mutation({
    args: { documentId: v.string() },
    handler: async (ctx, args) => {
        const doc = await ctx.db
            .query("documents")
            .withIndex("by_document_id", (q) => q.eq("documentId", args.documentId))
            .unique();

        if (doc) {
            await ctx.db.delete(doc._id);
            return { deleted: true, ragEntryIds: doc.ragEntryIds };
        }
        return { deleted: false };
    },
});

// Alias for API compatibility
export const remove = deleteByDocumentId;

/**
 * Delete all documents for an agent
 */
export const deleteByAgentId = mutation({
    args: { agentId: v.string() },
    handler: async (ctx, args) => {
        const docs = await ctx.db
            .query("documents")
            .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
            .collect();

        const ragEntryIds: string[] = [];
        for (const doc of docs) {
            if (doc.ragEntryIds) {
                ragEntryIds.push(...doc.ragEntryIds);
            }
            await ctx.db.delete(doc._id);
        }

        return { deleted: docs.length, ragEntryIds };
    },
});
