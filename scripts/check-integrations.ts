import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL || "https://adorable-sardine-831.convex.cloud");

async function checkIntegrations() {
  console.log("=== Checking Integration Tools ===");
  const tools = await client.query(api.integrations.listAvailableTools, { activeOnly: false });
  console.log(`Found ${tools.length} tools:`);
  tools.forEach(tool => {
    console.log(`- ${tool.toolId}: ${tool.name} (${tool.isActive ? 'ACTIVE' : 'INACTIVE'})`);
  });

  console.log("\n=== Checking Agent Integrations ===");
  const agentId = "k57a2gmy0k6ta53kgr3gp2s6p17bmccc";
  const agentIntegrations = await client.query(api.integrations.listAgentIntegrations, { agentId });
  console.log(`Agent ${agentId} has ${agentIntegrations.length} integrations:`);
  agentIntegrations.forEach(int => {
    console.log(`- ${int.name} (${int.toolId}): ${int.status}`);
    console.log(`  Triggers: ${int.enabledTriggers.join(", ")}`);
  });

  process.exit(0);
}

checkIntegrations().catch(console.error);
