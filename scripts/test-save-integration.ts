import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const client = new ConvexHttpClient("https://adorable-sardine-831.convex.cloud");

async function testSaveIntegration() {
  console.log("=== Testing Save Integration ===");
  
  try {
    const integrationId = await client.mutation(api.integrations.createIntegration, {
      organizationId: "jx74py2y8an3ws1k8kv9kp41s17zm17k",
      agentId: "k57a2gmy0k6ta53kgr3gp2s6p17bmccc",
      toolId: "google-sheets",
      name: "Test Google Sheets Integration",
      config: {
        webhookUrl: "https://script.google.com/macros/s/test/exec",
        deploymentId: "test123",
        customColumns: [
          { name: "Timestamp", dataSource: "timestamp" },
          { name: "Call ID", dataSource: "callId" },
          { name: "Customer Name", dataSource: "customerName" },
        ]
      },
      enabledTriggers: ["call_ended"],
    });
    
    console.log("✅ Integration created successfully!");
    console.log("Integration ID:", integrationId);
  } catch (error) {
    console.error("❌ Failed to create integration:");
    console.error(error);
  }
  
  process.exit(0);
}

testSaveIntegration().catch(console.error);
