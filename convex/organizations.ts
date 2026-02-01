/**
 * Organizations - Multi-tenant support
 * 
 * Manages organization CRUD and lookup by slug
 */

import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

// ============================================
// CREATE OPERATIONS
// ============================================

/**
 * Create a new organization
 */
export const create = mutation({
    args: {
        name: v.string(),
        slug: v.string(),
        status: v.union(v.literal("active"), v.literal("inactive")),
        config: v.optional(v.string()),
        billingCustomerId: v.optional(v.string()),
        createdAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const id = await ctx.db.insert("organizations", {
            name: args.name,
            slug: args.slug,
            status: args.status,
            config: args.config,
            billingCustomerId: args.billingCustomerId,
            createdAt: args.createdAt || Date.now(),
        });
        return id;
    },
});

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get organization by ID
 */
export const getById = query({
    args: { id: v.id("organizations") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

/**
 * Get organization by slug
 */
export const getBySlug = query({
    args: { slug: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("organizations")
            .withIndex("by_slug", (q) => q.eq("slug", args.slug))
            .unique();
    },
});

/**
 * List all organizations
 */
export const list = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("organizations").collect();
    },
});

/**
 * List active organizations
 */
export const listActive = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db
            .query("organizations")
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect();
    },
});

// ============================================
// UPDATE OPERATIONS
// ============================================

/**
 * Update organization
 */
export const update = mutation({
    args: {
        id: v.id("organizations"),
        name: v.optional(v.string()),
        slug: v.optional(v.string()),
        status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
        config: v.optional(v.string()),
        billingCustomerId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { id, ...updates } = args;
        
        // Filter out undefined values
        const filteredUpdates: Record<string, any> = {};
        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
                filteredUpdates[key] = value;
            }
        }
        
        if (Object.keys(filteredUpdates).length > 0) {
            await ctx.db.patch(id, filteredUpdates);
        }
        
        return id;
    },
});

// ============================================
// DELETE OPERATIONS
// ============================================

/**
 * Delete organization
 */
export const deleteOrg = mutation({
    args: { id: v.id("organizations") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args.id);
        return { deleted: true };
    },
});
