/**
 * Agents - Persistent agent configurations
 * 
 * Manages:
 * - Agent CRUD operations  
 * - Voice and language settings
 * - System prompts
 */

import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
import { api } from "./_generated/api.js";

// ============================================
// CREATE OPERATIONS
// ============================================

/**
 * Create a new agent
 */
export const create = mutation({
    args: {
        organizationId: v.string(),
        name: v.string(),
        role: v.optional(v.string()),
        systemPrompt: v.string(),
        config: v.optional(v.string()), // JSON - voice settings, language, etc.
        aiPersonaName: v.optional(v.string()),
        greeting: v.optional(v.string()),
        farewell: v.optional(v.string()),
        language: v.optional(v.string()),
        phoneCountryCode: v.optional(v.string()),
        phoneNumber: v.optional(v.string()),
        phoneLocation: v.optional(v.string()),
        enableContextualEnrichment: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        
        const id = await ctx.db.insert("agents", {
            organizationId: args.organizationId,
            name: args.name,
            role: args.role,
            systemPrompt: args.systemPrompt,
            config: args.config,
            aiPersonaName: args.aiPersonaName,
            greeting: args.greeting,
            farewell: args.farewell,
            language: args.language,
            phoneCountryCode: args.phoneCountryCode,
            phoneNumber: args.phoneNumber,
            phoneLocation: args.phoneLocation,
            enableContextualEnrichment: args.enableContextualEnrichment ?? true,
            fullPrompt: args.systemPrompt,  // Use systemPrompt directly
            promptVersion: now,
            status: "active",
            createdAt: now,
            updatedAt: now,
        });
        return id;
    },
});

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get agent by ID
 */
export const get = query({
    args: { id: v.id("agents") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

/**
 * Get agent by ID (string version)
 */
export const getById = query({
    args: { agentId: v.id("agents") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.agentId);
    },
});

/**
 * List agents by organization
 */
export const listByOrganization = query({
    args: { organizationId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("agents")
            .withIndex("by_organization_id", (q) => q.eq("organizationId", args.organizationId))
            .collect();
    },
});

/**
 * List agents by phone number
 * Returns all agents (active or inactive) with the specified phone number
 * 
 * OPTIMIZED: Uses indexed query for fast lookup
 */
export const listByPhoneNumber = query({
    args: { 
        phoneCountryCode: v.string(),
        phoneNumber: v.string(),
    },
    handler: async (ctx, args) => {
        // Use indexed query for fast lookup by phone
        const agents = await ctx.db
            .query("agents")
            .withIndex("by_phone", (q) =>
                q
                    .eq("phoneCountryCode", args.phoneCountryCode)
                    .eq("phoneNumber", args.phoneNumber)
            )
            .collect();
        
        return agents;
    },
});

/**
 * Get active agent for a phone number
 * Returns the first active agent for this phone number (for call routing)
 * If multiple active agents exist, returns the most recently updated one
 * 
 * OPTIMIZED: Uses indexed query for 30x performance improvement
 */
export const getActiveAgentForPhone = query({
    args: {
        phoneCountryCode: v.string(),
        phoneNumber: v.string(),
        organizationId: v.optional(v.string()), // Optional filter by org
    },
    handler: async (ctx, args) => {
        // Use indexed query for fast lookup by phone and status
        const agents = await ctx.db
            .query("agents")
            .withIndex("by_phone_and_status", (q) =>
                q
                    .eq("phoneCountryCode", args.phoneCountryCode)
                    .eq("phoneNumber", args.phoneNumber)
                    .eq("status", "active")
            )
            .collect();
        
        // Also get agents without status field (default to active)
        const agentsWithoutStatus = await ctx.db
            .query("agents")
            .withIndex("by_phone", (q) =>
                q
                    .eq("phoneCountryCode", args.phoneCountryCode)
                    .eq("phoneNumber", args.phoneNumber)
            )
            .filter((q) => q.eq(q.field("status"), undefined))
            .collect();
        
        let matchingAgents = [...agents, ...agentsWithoutStatus];
        
        // Filter by organization if provided
        if (args.organizationId) {
            matchingAgents = matchingAgents.filter(a => a.organizationId === args.organizationId);
        }
        
        if (matchingAgents.length === 0) {
            return null;
        }
        
        // If multiple active agents, return most recently updated
        matchingAgents.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return matchingAgents[0];
    },
});

/**
 * Validate phone number status for an agent
 * Checks if multiple agents are active on the same phone number
 * Used to warn users about conflicts
 * 
 * OPTIMIZED: Uses indexed query for fast lookup
 */
export const validatePhoneNumberStatus = query({
    args: { agentId: v.id("agents") },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.agentId);
        
        if (!agent || !agent.phoneNumber) {
            return { 
                valid: true,
                hasPhoneNumber: false,
                conflictingAgents: [],
            };
        }
        
        // Use indexed query to find all agents with same phone
        const agentsWithSamePhone = await ctx.db
            .query("agents")
            .withIndex("by_phone", (q) =>
                q
                    .eq("phoneCountryCode", agent.phoneCountryCode || "")
                    .eq("phoneNumber", agent.phoneNumber)
            )
            .collect();
        
        // Filter for active agents (excluding current agent)
        const activeOnSamePhone = agentsWithSamePhone.filter(a =>
            a._id !== agent._id &&
            (a.status === 'active' || !a.status) // Default to active if status not set
        );
        
        return {
            valid: activeOnSamePhone.length === 0,
            hasPhoneNumber: true,
            warning: activeOnSamePhone.length > 0 
                ? `${activeOnSamePhone.length} other agent${activeOnSamePhone.length > 1 ? 's are' : ' is'} active on ${agent.phoneCountryCode || ''}${agent.phoneNumber}`
                : null,
            conflictingAgents: activeOnSamePhone.map(a => ({ 
                id: a._id, 
                name: a.name,
                status: a.status || 'active',
            })),
            totalOnSameNumber: activeOnSamePhone.length + 1, // Include current agent
        };
    },
});

// ============================================
// UPDATE OPERATIONS
// ============================================

/**
 * Update agent details
 * Automatically rebuilds fullPrompt when name, systemPrompt, or config changes
 */
export const update = mutation({
    args: {
        agentId: v.id("agents"),
        name: v.optional(v.string()),
        role: v.optional(v.string()),
        systemPrompt: v.optional(v.string()),
        config: v.optional(v.string()),
        aiPersonaName: v.optional(v.string()),
        greeting: v.optional(v.string()),
        farewell: v.optional(v.string()),
        language: v.optional(v.string()),
        phoneCountryCode: v.optional(v.string()),
        phoneNumber: v.optional(v.string()),
        phoneLocation: v.optional(v.string()),
        enableContextualEnrichment: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { agentId, ...updates } = args;

        const agent = await ctx.db.get(agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }

        const now = Date.now();
        const updateData: any = { updatedAt: now };
        if (updates.name !== undefined) updateData.name = updates.name;
        if (updates.role !== undefined) updateData.role = updates.role;
        if (updates.systemPrompt !== undefined) updateData.systemPrompt = updates.systemPrompt;
        if (updates.config !== undefined) updateData.config = updates.config;
        if (updates.aiPersonaName !== undefined) updateData.aiPersonaName = updates.aiPersonaName;
        if (updates.greeting !== undefined) updateData.greeting = updates.greeting;
        if (updates.farewell !== undefined) updateData.farewell = updates.farewell;
        if (updates.language !== undefined) updateData.language = updates.language;
        if (updates.phoneCountryCode !== undefined) updateData.phoneCountryCode = updates.phoneCountryCode;
        if (updates.phoneNumber !== undefined) updateData.phoneNumber = updates.phoneNumber;
        if (updates.phoneLocation !== undefined) updateData.phoneLocation = updates.phoneLocation;
        if (updates.enableContextualEnrichment !== undefined) updateData.enableContextualEnrichment = updates.enableContextualEnrichment;

        // Update fullPrompt if systemPrompt changed
        const promptRebuilt = updates.systemPrompt !== undefined;
        if (promptRebuilt) {
            updateData.fullPrompt = updates.systemPrompt;
            updateData.promptVersion = now;
        }

        await ctx.db.patch(agentId, updateData);

        return {
            success: true,
            id: agentId,
            updated: Object.keys(updateData).filter((k) => k !== "updatedAt"),
            promptRebuilt,
        };
    },
});

/**
 * Update agent status (activate/deactivate)
 * Used to control which agent handles calls for a shared phone number
 */
export const updateStatus = mutation({
    args: {
        agentId: v.id("agents"),
        status: v.union(v.literal("active"), v.literal("inactive")),
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${args.agentId}`);
        }

        await ctx.db.patch(args.agentId, {
            status: args.status,
            updatedAt: Date.now(),
        });

        return {
            success: true,
            id: args.agentId,
            status: args.status,
        };
    },
});

/**
 * Update agent config only
 * Rebuilds fullPrompt since config affects prompt content
 */
export const updateConfig = mutation({
    args: {
        id: v.id("agents"),
        config: v.string(),
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.id);
        if (!agent) {
            throw new Error(`Agent not found: ${args.id}`);
        }

        const now = Date.now();

        await ctx.db.patch(args.id, {
            config: args.config,
            updatedAt: now,
        });
        return { success: true };
    },
});

/**
 * Update system prompt only
 * Rebuilds fullPrompt since systemPrompt is the main content
 */
export const updatePrompt = mutation({
    args: {
        agentId: v.id("agents"),
        prompt: v.string(),
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${args.agentId}`);
        }

        const now = Date.now();

        await ctx.db.patch(args.agentId, {
            systemPrompt: args.prompt,
            fullPrompt: args.prompt,
            promptVersion: now,
            updatedAt: now,
        });

        return {
            success: true,
            id: args.agentId,
            message: "Prompt updated successfully",
            promptRebuilt: true,
        };
    },
});

/**
 * Update voice settings in agent config
 */
export const updateVoice = mutation({
    args: {
        agentId: v.id("agents"),
        voiceProvider: v.optional(v.string()),
        voiceModel: v.optional(v.string()),
        voiceName: v.optional(v.string()),
        language: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${args.agentId}`);
        }

        // Parse current config or create new
        const config = agent.config ? JSON.parse(agent.config) : {};
        config.voice = config.voice || {};

        // Update voice settings
        if (args.voiceProvider) config.voice.provider = args.voiceProvider;
        if (args.voiceModel) config.voice.model = args.voiceModel;
        if (args.voiceName) config.voice.name = args.voiceName;
        if (args.language) config.voice.language = args.language;

        await ctx.db.patch(args.agentId, {
            config: JSON.stringify(config),
            updatedAt: Date.now(),
        });

        return {
            success: true,
            id: args.agentId,
            message: "Voice settings updated successfully",
        };
    },
});

// ============================================
// DELETE OPERATIONS
// ============================================

/**
 * Delete an agent and cascade delete ALL related data
 * 
 * COMPLETE Deletion cascade order:
 * 1. Delete all call sessions for agent
 * 2. Delete all call interactions for agent
 * 3. Delete all call metrics for agent
 * 4. Delete all documents for agent
 * 5. Delete all chunks metadata for agent
 * 6. Delete all chunk access logs for agent
 * 7. Delete all ingestion sessions for agent
 * 8. Delete all deleted files records for agent
 * 9. Delete all deletion queue entries for agent
 * 10. Delete all agent integrations for agent
 * 11. Delete all integration logs for agent
 * 12. Schedule RAG namespace cleanup (vector embeddings)
 * 13. Delete agent knowledge metadata
 * 14. Delete the agent record itself
 * 
 * @throws Error if agent not found or cascade deletion fails
 */
export const deleteAgent = mutation({
    args: { agentId: v.id("agents") },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${args.agentId}`);
        }

        console.log(`[deleteAgent] Starting COMPLETE cascade delete for agent: ${args.agentId}`);

        try {
            const agentIdString = args.agentId as string;
            const deletionStats = {
                callSessions: 0,
                callInteractions: 0,
                callMetrics: 0,
                documents: 0,
                chunks: 0,
                chunkAccessLogs: 0,
                ingestionSessions: 0,
                deletedFiles: 0,
                deletionQueue: 0,
                agentIntegrations: 0,
                integrationLogs: 0,
            };

            // Step 1: Delete all call sessions for this agent
            const callSessions = await ctx.db
                .query("callSessions")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .collect();
            for (const session of callSessions) {
                await ctx.db.delete(session._id);
            }
            deletionStats.callSessions = callSessions.length;
            console.log(`[deleteAgent] Deleted ${callSessions.length} call sessions`);

            // Step 2: Delete all call interactions for this agent
            const callInteractions = await ctx.db
                .query("callInteractions")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .collect();
            for (const interaction of callInteractions) {
                await ctx.db.delete(interaction._id);
            }
            deletionStats.callInteractions = callInteractions.length;
            console.log(`[deleteAgent] Deleted ${callInteractions.length} call interactions`);

            // Step 3: Delete all call metrics for this agent
            const callMetrics = await ctx.db
                .query("callMetrics")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .collect();
            for (const metric of callMetrics) {
                await ctx.db.delete(metric._id);
            }
            deletionStats.callMetrics = callMetrics.length;
            console.log(`[deleteAgent] Deleted ${callMetrics.length} call metrics`);

            // Step 4: Delete all documents for this agent
            const docs = await ctx.db
                .query("documents")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .collect();
            for (const doc of docs) {
                await ctx.db.delete(doc._id);
            }
            deletionStats.documents = docs.length;
            console.log(`[deleteAgent] Deleted ${docs.length} documents`);

            // Step 5: Delete all chunks metadata for this agent
            const chunks = await ctx.db
                .query("chunks")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .collect();
            for (const chunk of chunks) {
                await ctx.db.delete(chunk._id);
            }
            deletionStats.chunks = chunks.length;
            console.log(`[deleteAgent] Deleted ${chunks.length} chunk records`);

            // Step 6: Delete all chunk access logs for this agent
            const chunkAccessLogs = await ctx.db
                .query("chunkAccessLog")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .collect();
            for (const log of chunkAccessLogs) {
                await ctx.db.delete(log._id);
            }
            deletionStats.chunkAccessLogs = chunkAccessLogs.length;
            console.log(`[deleteAgent] Deleted ${chunkAccessLogs.length} chunk access logs`);

            // Step 7: Delete all ingestion sessions for this agent
            const ingestionSessions = await ctx.db
                .query("ingestionSessions")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .collect();
            for (const session of ingestionSessions) {
                await ctx.db.delete(session._id);
            }
            deletionStats.ingestionSessions = ingestionSessions.length;
            console.log(`[deleteAgent] Deleted ${ingestionSessions.length} ingestion sessions`);

            // Step 8: Delete all deleted files records for this agent
            const deletedFilesRecords = await ctx.db
                .query("deletedFiles")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .collect();
            for (const record of deletedFilesRecords) {
                await ctx.db.delete(record._id);
            }
            deletionStats.deletedFiles = deletedFilesRecords.length;
            console.log(`[deleteAgent] Deleted ${deletedFilesRecords.length} deleted files records`);

            // Step 9: Delete all deletion queue entries for this agent
            const deletionQueueEntries = await ctx.db
                .query("deletionQueue")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .collect();
            for (const entry of deletionQueueEntries) {
                await ctx.db.delete(entry._id);
            }
            deletionStats.deletionQueue = deletionQueueEntries.length;
            console.log(`[deleteAgent] Deleted ${deletionQueueEntries.length} deletion queue entries`);

            // Step 10: Delete all agent integrations for this agent
            const agentIntegrations = await ctx.db
                .query("agentIntegrations")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .collect();
            for (const integration of agentIntegrations) {
                await ctx.db.delete(integration._id);
            }
            deletionStats.agentIntegrations = agentIntegrations.length;
            console.log(`[deleteAgent] Deleted ${agentIntegrations.length} agent integrations`);

            // Step 11: Delete all integration logs for this agent
            const integrationLogs = await ctx.db
                .query("integrationLogs")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .collect();
            for (const log of integrationLogs) {
                await ctx.db.delete(log._id);
            }
            deletionStats.integrationLogs = integrationLogs.length;
            console.log(`[deleteAgent] Deleted ${integrationLogs.length} integration logs`);

            // Step 12: Clear RAG namespace (vector embeddings) - scheduled as action
            console.log(`[deleteAgent] Scheduling RAG namespace cleanup for: ${agentIdString}`);
            await ctx.scheduler.runAfter(0, api.rag.clearNamespace, {
                namespace: agentIdString,
            });

            // Step 13: Delete agent knowledge metadata
            const metadata = await ctx.db
                .query("agentKnowledgeMetadata")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentIdString))
                .first();
            
            if (metadata) {
                await ctx.db.delete(metadata._id);
                console.log(`[deleteAgent] Deleted agent knowledge metadata`);
            }

            // Step 14: Delete the agent record itself
            await ctx.db.delete(args.agentId);
            console.log(`[deleteAgent] Deleted agent record`);

            const totalDeleted = Object.values(deletionStats).reduce((a, b) => a + b, 0);
            console.log(`[deleteAgent] ✅ COMPLETE cascade delete finished. Total records deleted: ${totalDeleted}`);

            return {
                success: true,
                id: args.agentId,
                message: "Agent and ALL related data deleted successfully",
                details: {
                    ...deletionStats,
                    ragNamespaceScheduledForCleanup: agentIdString,
                    totalRecordsDeleted: totalDeleted,
                },
            };
        } catch (error) {
            console.error(`[deleteAgent] Cascade deletion failed:`, error);
            throw new Error(`Failed to delete agent: ${error instanceof Error ? error.message : String(error)}`);
        }
    },
});

// Alias for API compatibility
export const remove = deleteAgent;

// ============================================
// CLONE OPERATIONS
// ============================================

/**
 * Clone an existing agent
 * Rebuilds fullPrompt with new name
 */
export const clone = mutation({
    args: {
        agentId: v.id("agents"),
        newName: v.string(),
    },
    handler: async (ctx, args) => {
        const sourceAgent = await ctx.db.get(args.agentId);
        if (!sourceAgent) {
            throw new Error(`Agent not found: ${args.agentId}`);
        }

        const now = Date.now();

        const newId = await ctx.db.insert("agents", {
            organizationId: sourceAgent.organizationId,
            name: args.newName,
            role: sourceAgent.role,
            systemPrompt: sourceAgent.systemPrompt,
            config: sourceAgent.config,
            fullPrompt: sourceAgent.systemPrompt,
            promptVersion: now,
            createdAt: now,
            updatedAt: now,
        });

        return {
            success: true,
            id: newId,
            message: `Agent cloned as "${args.newName}"`,
        };
    },
});

/**
 * Migration: Rebuild prompts for all agents
 * 
 * Populates fullPrompt field for legacy agents created before caching was implemented.
 * Run once after deployment: npx convex run agents:rebuildAllPrompts
 */
export const rebuildAllPrompts = mutation({
        args: {},
        handler: async (ctx) => {
            const now = Date.now();
            const agents = await ctx.db.query('agents').collect();
            
            let rebuilt = 0;
            let skipped = 0;
            
            for (const agent of agents) {
                // Skip if already has fullPrompt (recently updated)
                if (agent.fullPrompt) {
                    skipped++;
                    continue;
                }
                
                // Update agent with systemPrompt as fullPrompt
                await ctx.db.patch(agent._id, {
                    fullPrompt: agent.systemPrompt,
                    promptVersion: now,
                    updatedAt: now,
                });
                
                rebuilt++;
            }
            
            return {
                success: true,
                total: agents.length,
                rebuilt,
                skipped,
                message: `Rebuilt ${rebuilt} prompts, skipped ${skipped} agents that already had prompts`,
            };
        },
});

/**
 * Migration: Rebuild prompts for a specific organization
 * 
 * Useful for targeted migrations or fixing specific organizations.
 */
export const rebuildPromptsForOrganization = mutation({
        args: {
            organizationId: v.id('organizations'),
        },
        handler: async (ctx, args) => {
            const now = Date.now();
            const agents = await ctx.db
                .query('agents')
                .withIndex('by_organization_id', (q) => q.eq('organizationId', args.organizationId))
                .collect();
            
            let rebuilt = 0;
            let skipped = 0;
            
            for (const agent of agents) {
                // Skip if already has fullPrompt
                if (agent.fullPrompt) {
                    skipped++;
                    continue;
                }
                
                // Update agent with systemPrompt as fullPrompt
                await ctx.db.patch(agent._id, {
                    fullPrompt: agent.systemPrompt,
                    promptVersion: now,
                    updatedAt: now,
                });
                
                rebuilt++;
            }
            
            return {
                success: true,
                organizationId: args.organizationId,
                total: agents.length,
                rebuilt,
                skipped,
                message: `Rebuilt ${rebuilt} prompts for organization, skipped ${skipped}`,
            };
        },
    });
