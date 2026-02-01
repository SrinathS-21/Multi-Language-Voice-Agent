/**
 * Integration Tools Management
 * 
 * Convex functions for the Tool Marketplace system.
 * Handles CRUD operations for tools, agent integrations, and execution logs.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server.js";

// ============================================
// INTEGRATION TOOLS (Marketplace Items)
// ============================================

/**
 * List all available tools in the marketplace
 */
export const listAvailableTools = query({
    args: {
        category: v.optional(v.string()),
        activeOnly: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { category, activeOnly = true } = args;
        
        let tools;
        if (category) {
            tools = await ctx.db
                .query("integrationTools")
                .withIndex("by_category", (q) => 
                    q.eq("category", category as any).eq("isActive", activeOnly)
                )
                .collect();
        } else if (activeOnly) {
            tools = await ctx.db
                .query("integrationTools")
                .withIndex("by_is_active", (q) => q.eq("isActive", true))
                .collect();
        } else {
            tools = await ctx.db.query("integrationTools").collect();
        }
        
        return tools.map(tool => ({
            ...tool,
            configSchema: JSON.parse(tool.configSchema),
        }));
    },
});

/**
 * Get a specific tool by ID
 */
export const getToolById = query({
    args: {
        toolId: v.string(),
    },
    handler: async (ctx, args) => {
        const tool = await ctx.db
            .query("integrationTools")
            .withIndex("by_tool_id", (q) => q.eq("toolId", args.toolId))
            .first();
        
        if (!tool) return null;
        
        return {
            ...tool,
            configSchema: JSON.parse(tool.configSchema),
        };
    },
});

/**
 * Create or update a tool in the marketplace
 * Used by admins to add new integrations
 */
export const upsertTool = mutation({
    args: {
        toolId: v.string(),
        name: v.string(),
        description: v.string(),
        category: v.union(
            v.literal("data-export"),
            v.literal("notification"),
            v.literal("webhook"),
            v.literal("crm"),
            v.literal("calendar"),
            v.literal("custom")
        ),
        icon: v.optional(v.string()),
        documentationUrl: v.optional(v.string()),
        configSchema: v.any(), // Will be stringified
        setupInstructions: v.optional(v.string()),
        supportedTriggers: v.array(v.string()),
        isBuiltIn: v.optional(v.boolean()),
        isActive: v.optional(v.boolean()),
        isPremium: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("integrationTools")
            .withIndex("by_tool_id", (q) => q.eq("toolId", args.toolId))
            .first();
        
        const toolData = {
            toolId: args.toolId,
            name: args.name,
            description: args.description,
            category: args.category,
            icon: args.icon,
            documentationUrl: args.documentationUrl,
            configSchema: JSON.stringify(args.configSchema),
            setupInstructions: args.setupInstructions,
            supportedTriggers: args.supportedTriggers as any[],
            isBuiltIn: args.isBuiltIn ?? true,
            isActive: args.isActive ?? true,
            isPremium: args.isPremium ?? false,
            updatedAt: Date.now(),
        };
        
        if (existing) {
            await ctx.db.patch(existing._id, toolData);
            return existing._id;
        } else {
            return await ctx.db.insert("integrationTools", {
                ...toolData,
                installCount: 0,
                createdAt: Date.now(),
            });
        }
    },
});

// ============================================
// AGENT INTEGRATIONS (User Configurations)
// ============================================

/**
 * List all integrations for an agent
 */
export const listAgentIntegrations = query({
    args: {
        agentId: v.string(),
        status: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const { agentId, status } = args;
        
        let integrations;
        if (status) {
            integrations = await ctx.db
                .query("agentIntegrations")
                .withIndex("by_agent_and_status", (q) => 
                    q.eq("agentId", agentId).eq("status", status as any)
                )
                .collect();
        } else {
            integrations = await ctx.db
                .query("agentIntegrations")
                .withIndex("by_agent_id", (q) => q.eq("agentId", agentId))
                .collect();
        }
        
        // Enrich with tool info
        const enriched = await Promise.all(
            integrations.map(async (integration) => {
                const tool = await ctx.db
                    .query("integrationTools")
                    .withIndex("by_tool_id", (q) => q.eq("toolId", integration.toolId))
                    .first();
                
                return {
                    ...integration,
                    config: JSON.parse(integration.config),
                    triggerConditions: integration.triggerConditions 
                        ? JSON.parse(integration.triggerConditions) 
                        : null,
                    tool: tool ? {
                        name: tool.name,
                        icon: tool.icon,
                        category: tool.category,
                    } : null,
                };
            })
        );
        
        return enriched;
    },
});

/**
 * Get a specific integration by ID
 */
export const getIntegration = query({
    args: {
        integrationId: v.id("agentIntegrations"),
    },
    handler: async (ctx, args) => {
        const integration = await ctx.db.get(args.integrationId);
        if (!integration) return null;
        
        const tool = await ctx.db
            .query("integrationTools")
            .withIndex("by_tool_id", (q) => q.eq("toolId", integration.toolId))
            .first();
        
        return {
            ...integration,
            config: JSON.parse(integration.config),
            triggerConditions: integration.triggerConditions 
                ? JSON.parse(integration.triggerConditions) 
                : null,
            tool,
        };
    },
});

/**
 * Create a new integration for an agent
 */
export const createIntegration = mutation({
    args: {
        organizationId: v.string(),
        agentId: v.string(),
        toolId: v.string(),
        name: v.string(),
        config: v.any(), // Will be stringified
        enabledTriggers: v.array(v.string()),
        triggerConditions: v.optional(v.any()),
        retryEnabled: v.optional(v.boolean()),
        maxRetries: v.optional(v.number()),
        retryDelayMs: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        console.log("Creating integration with toolId:", args.toolId);
        
        // Verify tool exists
        const tool = await ctx.db
            .query("integrationTools")
            .withIndex("by_tool_id", (q) => q.eq("toolId", args.toolId))
            .first();
        
        console.log("Tool lookup result:", tool ? `Found: ${tool.name}` : "NOT FOUND");
        
        if (!tool) {
            // List all available tools for debugging
            const allTools = await ctx.db.query("integrationTools").collect();
            console.log("Available tools:", allTools.map(t => t.toolId));
            throw new Error(`Tool not found: ${args.toolId}`);
        }
        
        // Create integration
        const integrationId = await ctx.db.insert("agentIntegrations", {
            organizationId: args.organizationId,
            agentId: args.agentId,
            toolId: args.toolId,
            name: args.name,
            config: JSON.stringify(args.config),
            enabledTriggers: args.enabledTriggers,
            triggerConditions: args.triggerConditions 
                ? JSON.stringify(args.triggerConditions) 
                : undefined,
            status: "active",
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            retryEnabled: args.retryEnabled ?? true,
            maxRetries: args.maxRetries ?? 3,
            retryDelayMs: args.retryDelayMs ?? 1000,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        
        // Increment install count on tool
        await ctx.db.patch(tool._id, {
            installCount: (tool.installCount ?? 0) + 1,
        });
        
        return integrationId;
    },
});

/**
 * Update an existing integration
 */
export const updateIntegration = mutation({
    args: {
        integrationId: v.id("agentIntegrations"),
        name: v.optional(v.string()),
        config: v.optional(v.any()),
        enabledTriggers: v.optional(v.array(v.string())),
        triggerConditions: v.optional(v.any()),
        status: v.optional(v.union(
            v.literal("active"),
            v.literal("paused"),
            v.literal("error"),
            v.literal("pending_setup")
        )),
        retryEnabled: v.optional(v.boolean()),
        maxRetries: v.optional(v.number()),
        retryDelayMs: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const { integrationId, ...updates } = args;
        
        const existing = await ctx.db.get(integrationId);
        if (!existing) {
            throw new Error("Integration not found");
        }
        
        const patchData: any = {
            updatedAt: Date.now(),
        };
        
        if (updates.name !== undefined) patchData.name = updates.name;
        if (updates.config !== undefined) patchData.config = JSON.stringify(updates.config);
        if (updates.enabledTriggers !== undefined) patchData.enabledTriggers = updates.enabledTriggers;
        if (updates.triggerConditions !== undefined) {
            patchData.triggerConditions = JSON.stringify(updates.triggerConditions);
        }
        if (updates.status !== undefined) patchData.status = updates.status;
        if (updates.retryEnabled !== undefined) patchData.retryEnabled = updates.retryEnabled;
        if (updates.maxRetries !== undefined) patchData.maxRetries = updates.maxRetries;
        if (updates.retryDelayMs !== undefined) patchData.retryDelayMs = updates.retryDelayMs;
        
        await ctx.db.patch(integrationId, patchData);
        
        return integrationId;
    },
});

/**
 * Delete an integration
 */
export const deleteIntegration = mutation({
    args: {
        integrationId: v.id("agentIntegrations"),
    },
    handler: async (ctx, args) => {
        const integration = await ctx.db.get(args.integrationId);
        if (!integration) {
            throw new Error("Integration not found");
        }
        
        // Decrement install count on tool
        const tool = await ctx.db
            .query("integrationTools")
            .withIndex("by_tool_id", (q) => q.eq("toolId", integration.toolId))
            .first();
        
        if (tool && (tool.installCount ?? 0) > 0) {
            await ctx.db.patch(tool._id, {
                installCount: (tool.installCount ?? 0) - 1,
            });
        }
        
        await ctx.db.delete(args.integrationId);
        
        return { success: true };
    },
});

/**
 * Get active integrations for an agent by trigger type
 * Used by the integration service to find what to execute
 */
export const getIntegrationsForTrigger = query({
    args: {
        agentId: v.string(),
        trigger: v.string(),
    },
    handler: async (ctx, args) => {
        const integrations = await ctx.db
            .query("agentIntegrations")
            .withIndex("by_agent_and_status", (q) => 
                q.eq("agentId", args.agentId).eq("status", "active")
            )
            .collect();
        
        // Filter by trigger
        const matching = integrations.filter(
            (i) => i.enabledTriggers.includes(args.trigger)
        );
        
        // Enrich with tool info
        return Promise.all(
            matching.map(async (integration) => {
                const tool = await ctx.db
                    .query("integrationTools")
                    .withIndex("by_tool_id", (q) => q.eq("toolId", integration.toolId))
                    .first();
                
                return {
                    ...integration,
                    config: JSON.parse(integration.config),
                    tool: tool ? {
                        toolId: tool.toolId,
                        name: tool.name,
                        category: tool.category,
                    } : null,
                };
            })
        );
    },
});

// ============================================
// INTEGRATION LOGS (Execution History)
// ============================================

/**
 * Log an integration execution
 */
export const logExecution = mutation({
    args: {
        organizationId: v.string(),
        agentId: v.string(),
        integrationId: v.id("agentIntegrations"),
        toolId: v.string(),
        callSessionId: v.optional(v.string()),
        trigger: v.string(),
        status: v.union(
            v.literal("pending"),
            v.literal("executing"),
            v.literal("success"),
            v.literal("failed"),
            v.literal("retrying")
        ),
        requestPayload: v.optional(v.any()),
        responseData: v.optional(v.any()),
        errorMessage: v.optional(v.string()),
        errorCode: v.optional(v.string()),
        stackTrace: v.optional(v.string()),
        attemptNumber: v.number(),
        maxAttempts: v.number(),
        nextRetryAt: v.optional(v.number()),
        executionTimeMs: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const logId = await ctx.db.insert("integrationLogs", {
            organizationId: args.organizationId,
            agentId: args.agentId,
            integrationId: args.integrationId,
            toolId: args.toolId,
            callSessionId: args.callSessionId,
            trigger: args.trigger,
            status: args.status,
            requestPayload: args.requestPayload 
                ? JSON.stringify(args.requestPayload) 
                : undefined,
            responseData: args.responseData 
                ? JSON.stringify(args.responseData) 
                : undefined,
            errorMessage: args.errorMessage,
            errorCode: args.errorCode,
            stackTrace: args.stackTrace,
            attemptNumber: args.attemptNumber,
            maxAttempts: args.maxAttempts,
            nextRetryAt: args.nextRetryAt,
            executionTimeMs: args.executionTimeMs,
            createdAt: Date.now(),
            completedAt: args.status === "success" || args.status === "failed" 
                ? Date.now() 
                : undefined,
        });
        
        // Update integration stats
        const integration = await ctx.db.get(args.integrationId);
        if (integration) {
            const updates: any = {
                lastExecutedAt: Date.now(),
                totalExecutions: (integration.totalExecutions ?? 0) + 1,
            };
            
            if (args.status === "success") {
                updates.successfulExecutions = (integration.successfulExecutions ?? 0) + 1;
                updates.lastError = undefined;
                updates.lastErrorAt = undefined;
            } else if (args.status === "failed") {
                updates.failedExecutions = (integration.failedExecutions ?? 0) + 1;
                updates.lastError = args.errorMessage;
                updates.lastErrorAt = Date.now();
            }
            
            await ctx.db.patch(args.integrationId, updates);
        }
        
        return logId;
    },
});

/**
 * Update an existing log entry (e.g., when retrying completes)
 */
export const updateLog = mutation({
    args: {
        logId: v.id("integrationLogs"),
        status: v.optional(v.union(
            v.literal("pending"),
            v.literal("executing"),
            v.literal("success"),
            v.literal("failed"),
            v.literal("retrying")
        )),
        responseData: v.optional(v.any()),
        errorMessage: v.optional(v.string()),
        executionTimeMs: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const { logId, ...updates } = args;
        
        const patchData: any = {};
        
        if (updates.status !== undefined) {
            patchData.status = updates.status;
            if (updates.status === "success" || updates.status === "failed") {
                patchData.completedAt = Date.now();
            }
        }
        if (updates.responseData !== undefined) {
            patchData.responseData = JSON.stringify(updates.responseData);
        }
        if (updates.errorMessage !== undefined) {
            patchData.errorMessage = updates.errorMessage;
        }
        if (updates.executionTimeMs !== undefined) {
            patchData.executionTimeMs = updates.executionTimeMs;
        }
        
        await ctx.db.patch(logId, patchData);
    },
});

/**
 * Get execution logs for an integration
 */
export const getIntegrationLogs = query({
    args: {
        integrationId: v.id("agentIntegrations"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const logs = await ctx.db
            .query("integrationLogs")
            .withIndex("by_integration_id", (q) => q.eq("integrationId", args.integrationId))
            .order("desc")
            .take(args.limit ?? 50);
        
        return logs.map(log => ({
            ...log,
            requestPayload: log.requestPayload ? JSON.parse(log.requestPayload) : null,
            responseData: log.responseData ? JSON.parse(log.responseData) : null,
        }));
    },
});

/**
 * Get execution logs for an agent (across all integrations)
 */
export const getAgentLogs = query({
    args: {
        agentId: v.string(),
        limit: v.optional(v.number()),
        status: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        let logs;
        
        if (args.status) {
            // Need to filter by status - use different approach
            logs = await ctx.db
                .query("integrationLogs")
                .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
                .order("desc")
                .filter((q) => q.eq(q.field("status"), args.status))
                .take(args.limit ?? 50);
        } else {
            logs = await ctx.db
                .query("integrationLogs")
                .withIndex("by_agent_and_created", (q) => q.eq("agentId", args.agentId))
                .order("desc")
                .take(args.limit ?? 50);
        }
        
        return logs.map(log => ({
            ...log,
            requestPayload: log.requestPayload ? JSON.parse(log.requestPayload) : null,
            responseData: log.responseData ? JSON.parse(log.responseData) : null,
        }));
    },
});

// ============================================
// SEED DATA - Built-in Tools
// ============================================

/**
 * Seed the marketplace with built-in tools
 * Run this once during setup
 */
export const seedBuiltInTools = mutation({
    args: {},
    handler: async (ctx) => {
        const builtInTools = [
            {
                toolId: "google-sheets",
                name: "Google Sheets",
                description: "Export call transcripts, customer data, and analytics to Google Sheets automatically.",
                category: "data-export" as const,
                icon: "📊",
                configSchema: {
                    type: "object",
                    required: ["webhookUrl"],
                    properties: {
                        webhookUrl: {
                            type: "string",
                            title: "Apps Script Web App URL",
                            description: "The URL from your deployed Google Apps Script",
                            pattern: "^https://script\\.google\\.com/.*$"
                        },
                        spreadsheetId: {
                            type: "string",
                            title: "Spreadsheet ID (Optional)",
                            description: "Override the default spreadsheet"
                        },
                        sheetName: {
                            type: "string",
                            title: "Sheet Name",
                            description: "Which sheet tab to use",
                            default: "Call Logs"
                        }
                    }
                },
                setupInstructions: `# Google Sheets Integration Setup

## Step 1: Create a Google Sheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it (e.g., "Voice Agent Call Logs")
4. Add headers in Row 1:
   - A1: Timestamp
   - B1: Call ID
   - C1: Caller Number
   - D1: Duration (sec)
   - E1: Transcript
   - F1: Intent Detected
   - G1: Customer Name
   - H1: Appointment Date
   - I1: Status

## Step 2: Create Apps Script
1. In your Google Sheet, go to **Extensions > Apps Script**
2. Delete any existing code
3. Paste this script:

\`\`\`javascript
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);
    
    sheet.appendRow([
      new Date().toISOString(),
      data.callId || '',
      data.callerNumber || '',
      data.duration || '',
      data.transcript || '',
      data.intent || '',
      data.customerName || '',
      data.appointmentDate || '',
      data.status || ''
    ]);
    
    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
\`\`\`

## Step 3: Deploy as Web App
1. Click **Deploy > New deployment**
2. Select type: **Web app**
3. Set:
   - Description: "Voice Agent Integration"
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. **Copy the Web App URL** (starts with https://script.google.com/...)

## Step 4: Configure in Tool Marketplace
1. Paste the Web App URL in the configuration
2. Test the connection
3. Enable your preferred triggers`,
                supportedTriggers: ["call_ended", "transcript_ready"] as const,
                isBuiltIn: true,
                isActive: true,
            },
            // NOTE: Other integrations (Slack, Webhook, Email) have been removed
            // Only Google Sheets is currently supported
        ];
        
        type TriggerType = "call_started" | "call_ended" | "transcript_ready" | "intent_detected" | "escalation_requested" | "custom";
        
        const results = [];
        for (const tool of builtInTools) {
            const existing = await ctx.db
                .query("integrationTools")
                .withIndex("by_tool_id", (q) => q.eq("toolId", tool.toolId))
                .first();
            
            if (!existing) {
                const id = await ctx.db.insert("integrationTools", {
                    toolId: tool.toolId,
                    name: tool.name,
                    description: tool.description,
                    category: tool.category,
                    icon: tool.icon,
                    configSchema: JSON.stringify(tool.configSchema),
                    setupInstructions: tool.setupInstructions,
                    supportedTriggers: [...tool.supportedTriggers] as TriggerType[],
                    isBuiltIn: tool.isBuiltIn,
                    isActive: tool.isActive,
                    installCount: 0,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                results.push({ toolId: tool.toolId, action: "created", id });
            } else {
                results.push({ toolId: tool.toolId, action: "exists" });
            }
        }
        
        return results;
    },
});
