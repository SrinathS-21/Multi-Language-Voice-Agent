/**
 * Function Schemas - Dynamic function definitions
 * 
 * Manages function schemas that define what actions
 * the voice agent can take during conversations.
 * 
 * Features:
 * - CRUD operations for function definitions
 * - Domain-based function retrieval
 * - Organization-scoped function management
 * - Active/inactive function filtering
 */

import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

// ============================================
// CREATE OPERATIONS
// ============================================

/**
 * Create a new function schema
 */
export const create = mutation({
    args: {
        organizationId: v.string(),
        domain: v.string(),
        functionName: v.string(),
        description: v.string(),
        parameters: v.string(), // JSON schema string
        handlerType: v.union(
            v.literal("vector_search"),
            v.literal("convex_query"),
            v.literal("webhook"),
            v.literal("static")
        ),
        handlerConfig: v.string(), // JSON string
        isActive: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        // Check if function already exists for this org
        const existing = await ctx.db
            .query("functionSchemas")
            .withIndex("by_function_name", (q) =>
                q.eq("organizationId", args.organizationId).eq("functionName", args.functionName)
            )
            .first();

        if (existing) {
            throw new Error(`Function '${args.functionName}' already exists for this organization`);
        }

        const id = await ctx.db.insert("functionSchemas", {
            organizationId: args.organizationId,
            domain: args.domain,
            functionName: args.functionName,
            description: args.description,
            parameters: args.parameters,
            handlerType: args.handlerType,
            handlerConfig: args.handlerConfig,
            isActive: args.isActive ?? true,
            createdAt: now,
            updatedAt: now,
        });

        return { id, functionName: args.functionName };
    },
});

/**
 * Create or update a function schema (upsert)
 */
export const upsert = mutation({
    args: {
        organizationId: v.string(),
        domain: v.string(),
        functionName: v.string(),
        description: v.string(),
        parameters: v.string(),
        handlerType: v.union(
            v.literal("vector_search"),
            v.literal("convex_query"),
            v.literal("webhook"),
            v.literal("static")
        ),
        handlerConfig: v.string(),
        isActive: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();

        // Check for existing function
        const existing = await ctx.db
            .query("functionSchemas")
            .withIndex("by_function_name", (q) =>
                q.eq("organizationId", args.organizationId).eq("functionName", args.functionName)
            )
            .first();

        if (existing) {
            // Update existing
            await ctx.db.patch(existing._id, {
                domain: args.domain,
                description: args.description,
                parameters: args.parameters,
                handlerType: args.handlerType,
                handlerConfig: args.handlerConfig,
                isActive: args.isActive ?? existing.isActive,
                updatedAt: now,
            });

            return { id: existing._id, functionName: args.functionName, action: "updated" };
        } else {
            // Create new
            const id = await ctx.db.insert("functionSchemas", {
                organizationId: args.organizationId,
                domain: args.domain,
                functionName: args.functionName,
                description: args.description,
                parameters: args.parameters,
                handlerType: args.handlerType,
                handlerConfig: args.handlerConfig,
                isActive: args.isActive ?? true,
                createdAt: now,
                updatedAt: now,
            });

            return { id, functionName: args.functionName, action: "created" };
        }
    },
});

/**
 * Bulk create function schemas
 */
export const createBatch = mutation({
    args: {
        functions: v.array(
            v.object({
                organizationId: v.string(),
                domain: v.string(),
                functionName: v.string(),
                description: v.string(),
                parameters: v.string(),
                handlerType: v.union(
                    v.literal("vector_search"),
                    v.literal("convex_query"),
                    v.literal("webhook"),
                    v.literal("static")
                ),
                handlerConfig: v.string(),
                isActive: v.optional(v.boolean()),
            })
        ),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const results: Array<{ functionName: string; id: string; action: string }> = [];

        for (const func of args.functions) {
            // Check for existing
            const existing = await ctx.db
                .query("functionSchemas")
                .withIndex("by_function_name", (q) =>
                    q.eq("organizationId", func.organizationId).eq("functionName", func.functionName)
                )
                .first();

            if (existing) {
                await ctx.db.patch(existing._id, {
                    domain: func.domain,
                    description: func.description,
                    parameters: func.parameters,
                    handlerType: func.handlerType,
                    handlerConfig: func.handlerConfig,
                    isActive: func.isActive ?? existing.isActive,
                    updatedAt: now,
                });
                results.push({ functionName: func.functionName, id: existing._id, action: "updated" });
            } else {
                const id = await ctx.db.insert("functionSchemas", {
                    ...func,
                    isActive: func.isActive ?? true,
                    createdAt: now,
                    updatedAt: now,
                });
                results.push({ functionName: func.functionName, id, action: "created" });
            }
        }

        return { count: results.length, results };
    },
});

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get function schema by ID
 */
export const get = query({
    args: { id: v.id("functionSchemas") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

/**
 * Get function schema by name and organization
 */
export const getByName = query({
    args: {
        organizationId: v.string(),
        functionName: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("functionSchemas")
            .withIndex("by_function_name", (q) =>
                q.eq("organizationId", args.organizationId).eq("functionName", args.functionName)
            )
            .first();
    },
});

/**
 * List all function schemas for an organization
 */
export const listByOrganization = query({
    args: {
        organizationId: v.string(),
        activeOnly: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const functions = await ctx.db
            .query("functionSchemas")
            .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
            .collect();

        if (args.activeOnly) {
            return functions.filter((f) => f.isActive);
        }

        return functions;
    },
});

/**
 * List function schemas by domain
 */
export const listByDomain = query({
    args: {
        domain: v.string(),
        activeOnly: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const functions = await ctx.db
            .query("functionSchemas")
            .withIndex("by_domain", (q) => q.eq("domain", args.domain))
            .collect();

        if (args.activeOnly) {
            return functions.filter((f) => f.isActive);
        }

        return functions;
    },
});

/**
 * Get functions for a specific organization and domain
 */
export const listByOrgAndDomain = query({
    args: {
        organizationId: v.string(),
        domain: v.string(),
        activeOnly: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const functions = await ctx.db
            .query("functionSchemas")
            .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
            .filter((q) => q.eq(q.field("domain"), args.domain))
            .collect();

        if (args.activeOnly) {
            return functions.filter((f) => f.isActive);
        }

        return functions;
    },
});

// ============================================
// UPDATE OPERATIONS
// ============================================

/**
 * Update function schema
 */
export const update = mutation({
    args: {
        id: v.id("functionSchemas"),
        domain: v.optional(v.string()),
        description: v.optional(v.string()),
        parameters: v.optional(v.string()),
        handlerType: v.optional(
            v.union(
                v.literal("vector_search"),
                v.literal("convex_query"),
                v.literal("webhook"),
                v.literal("static")
            )
        ),
        handlerConfig: v.optional(v.string()),
        isActive: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { id, ...updates } = args;

        const existing = await ctx.db.get(id);
        if (!existing) {
            throw new Error("Function schema not found");
        }

        // Filter out undefined values
        const cleanUpdates = Object.fromEntries(
            Object.entries(updates).filter(([_, v]) => v !== undefined)
        );

        await ctx.db.patch(id, {
            ...cleanUpdates,
            updatedAt: Date.now(),
        });

        return { id, functionName: existing.functionName };
    },
});

/**
 * Toggle function active status
 */
export const toggleActive = mutation({
    args: {
        id: v.id("functionSchemas"),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db.get(args.id);
        if (!existing) {
            throw new Error("Function schema not found");
        }

        await ctx.db.patch(args.id, {
            isActive: !existing.isActive,
            updatedAt: Date.now(),
        });

        return { id: args.id, isActive: !existing.isActive };
    },
});

// ============================================
// DELETE OPERATIONS
// ============================================

/**
 * Delete function schema
 */
export const remove = mutation({
    args: { id: v.id("functionSchemas") },
    handler: async (ctx, args) => {
        const existing = await ctx.db.get(args.id);
        if (!existing) {
            throw new Error("Function schema not found");
        }

        await ctx.db.delete(args.id);

        return { deleted: true, functionName: existing.functionName };
    },
});

/**
 * Delete all functions for an organization
 */
export const removeByOrganization = mutation({
    args: { organizationId: v.string() },
    handler: async (ctx, args) => {
        const functions = await ctx.db
            .query("functionSchemas")
            .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
            .collect();

        for (const func of functions) {
            await ctx.db.delete(func._id);
        }

        return { deleted: functions.length };
    },
});

// ============================================
// UTILITY OPERATIONS
// ============================================

/**
 * Get function count by organization
 */
export const countByOrganization = query({
    args: { organizationId: v.string() },
    handler: async (ctx, args) => {
        const functions = await ctx.db
            .query("functionSchemas")
            .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
            .collect();

        return {
            total: functions.length,
            active: functions.filter((f) => f.isActive).length,
            inactive: functions.filter((f) => !f.isActive).length,
        };
    },
});

/**
 * List all unique domains in use
 */
export const listDomains = query({
    args: { organizationId: v.optional(v.string()) },
    handler: async (ctx, args) => {
        let functions;

        if (args.organizationId !== undefined) {
            const orgId = args.organizationId;
            functions = await ctx.db
                .query("functionSchemas")
                .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
                .collect();
        } else {
            functions = await ctx.db.query("functionSchemas").collect();
        }

        const domains = Array.from(new Set(functions.map((f) => f.domain)));
        return domains.sort();
    },
});
