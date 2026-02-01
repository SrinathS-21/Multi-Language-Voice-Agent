/**
 * Check agents in Convex database
 * Run with: npx convex run scripts/check-agents-in-convex.ts
 */

import { api } from "../convex/_generated/api";

// Query all agents for default organization
const agents = await api.agents.listByOrganization({ organizationId: "default" });

console.log("\n=== Agents in Convex ===");
console.log(`Found ${agents.length} agents for organization: default\n`);

if (agents.length > 0) {
  agents.forEach((agent, index) => {
    console.log(`${index + 1}. ${agent.name}`);
    console.log(`   ID: ${agent._id}`);
    console.log(`   Status: ${agent.status || 'active (default)'}`);
    console.log(`   Language: ${agent.language || 'not set'}`);
    console.log(`   Phone: ${agent.phoneCountryCode || ''}${agent.phoneNumber || 'not set'}`);
    console.log(`   Created: ${new Date(agent.createdAt).toLocaleString()}`);
    console.log("");
  });
} else {
  console.log("⚠️  No agents found for organization 'default'");
  console.log("\nTo create an agent, use the frontend at http://localhost:3000/agents");
  console.log("or run: npx convex run scripts/setup-arrow-agent.ts");
}

console.log("\n");
