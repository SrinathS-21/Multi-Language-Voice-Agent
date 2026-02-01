/**
 * Cleanup Integration Tools
 * Removes all tools except Google Sheets and ensures only Google Sheets is active
 */

import { v } from "convex/values";
import { internalMutation } from "./_generated/server.js";

export const cleanupIntegrationTools = internalMutation({
  handler: async (ctx) => {
    // Get all integration tools
    const allTools = await ctx.db.query("integrationTools").collect();
    
    console.log(`Found ${allTools.length} tools in database`);
    
    let deletedCount = 0;
    let googleSheetsId = null;
    
    // Delete all tools except Google Sheets
    for (const tool of allTools) {
      if (tool.toolId === "google-sheets") {
        googleSheetsId = tool._id;
        console.log(`Keeping Google Sheets tool: ${tool._id}`);
        
        // Ensure it's active
        await ctx.db.patch(tool._id, {
          isActive: true,
          isBuiltIn: true,
          updatedAt: Date.now(),
        });
      } else {
        console.log(`Deleting tool: ${tool.toolId} (${tool._id})`);
        await ctx.db.delete(tool._id);
        deletedCount++;
      }
    }
    
    console.log(`Cleanup complete: Deleted ${deletedCount} tools, kept Google Sheets`);
    
    return {
      deletedCount,
      googleSheetsId,
      message: `Removed ${deletedCount} tools. Only Google Sheets remains.`,
    };
  },
});

export const listAllIntegrationTools = internalMutation({
  handler: async (ctx) => {
    const tools = await ctx.db.query("integrationTools").collect();
    console.log("Integration Tools in Database:");
    tools.forEach(tool => {
      console.log(`- ${tool.toolId}: ${tool.name} (${tool.isActive ? 'ACTIVE' : 'INACTIVE'})`);
    });
    return tools.map(t => ({ toolId: t.toolId, name: t.name, isActive: t.isActive }));
  },
});

export const checkAgentIntegrations = internalMutation({
  args: {
    agentId: v.string(),
  },
  handler: async (ctx, args) => {
    const integrations = await ctx.db
      .query("agentIntegrations")
      .withIndex("by_agent_id", (q) => q.eq("agentId", args.agentId))
      .collect();
    
    console.log(`Agent ${args.agentId} has ${integrations.length} integrations:`);
    integrations.forEach(int => {
      const config = JSON.parse(int.config);
      console.log(`- ${int.name} (${int.toolId}): ${int.status}`);
      console.log(`  Triggers: ${int.enabledTriggers.join(", ")}`);
      console.log(`  Config:`, config);
    });
    
    return integrations.map(i => ({
      name: i.name,
      toolId: i.toolId,
      status: i.status,
      triggers: i.enabledTriggers,
    }));
  },
});
