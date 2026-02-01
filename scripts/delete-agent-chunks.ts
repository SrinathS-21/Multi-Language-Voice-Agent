/**
 * Delete Agent Chunks - Quick Script
 * 
 * Deletes all chunks for a specific agent.
 * Uses the new optimized deletion if metadata exists, otherwise falls back to old method.
 * 
 * Usage:
 *   npx ts-node scripts/delete-agent-chunks.ts
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
    console.error("❌ CONVEX_URL not found in environment");
    process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);

// Agent ID to delete
const AGENT_ID = "j573a5zg13377bjcx1cebzmqfx801qxq";

async function deleteAgentChunks() {
    console.log(`🗑️  Deleting chunks for agent: ${AGENT_ID}\n`);

    try {
        // Step 1: Check if metadata exists
        console.log("1️⃣  Checking if agent metadata exists...");
        
        let orgId = "default_org"; // Default fallback
        
        try {
            const stats = await client.query(api.ragManagement.getAgentStats, {
                agentId: AGENT_ID,
            });

            if (stats && stats.exists) {
                console.log(`   ✅ Agent found in metadata`);
                console.log(`   - Total chunks: ${stats.totalChunks}`);
                console.log(`   - Documents: ${stats.documentCount}`);
                console.log(`   - Size: ${(stats.totalSizeBytes / 1024).toFixed(2)} KB`);
                console.log(`   - Status: ${stats.status}\n`);
                
                // Get orgId from agents table if available
                try {
                    const agentInfo = await client.query(api.agents.getById, {
                        agentId: AGENT_ID as any,
                    });
                    if (agentInfo && agentInfo.organizationId) {
                        orgId = agentInfo.organizationId;
                        console.log(`   📋 Organization ID: ${orgId}\n`);
                    }
                } catch (e) {
                    console.log(`   ℹ️  Using default organization ID\n`);
                }
                
                // Use new optimized deletion
                console.log("2️⃣  Queueing deletion (optimized method)...");
                const result = await client.mutation(api.ragManagement.queueAgentDeletion, {
                    agentId: AGENT_ID,
                    organizationId: orgId,
                });
                
                console.log(`   ✅ ${result.message}`);
                console.log(`   Queue ID: ${result.queueId}\n`);
                
                // Monitor progress
                console.log("3️⃣  Monitoring deletion progress...\n");
                await monitorDeletion();
                
            } else {
                console.log(`   ⚠️  Agent not found in metadata`);
                console.log(`   Using legacy deletion method...\n`);
                await legacyDeletion();
            }
        } catch (metadataError) {
            console.log(`   ⚠️  Metadata query failed: ${metadataError}`);
            console.log(`   Using legacy deletion method...\n`);
            await legacyDeletion();
        }

    } catch (error) {
        console.error("\n❌ Deletion failed:", error);
        process.exit(1);
    }
}

async function monitorDeletion() {
    let attempts = 0;
    const maxAttempts = 30; // Monitor for up to 1 minute
    
    while (attempts < maxAttempts) {
        try {
            const status = await client.query(api.ragManagement.getDeletionStatus, {
                agentId: AGENT_ID,
            });

            if (!status.inProgress) {
                console.log(`   ✅ Deletion completed!\n`);
                
                // Verify
                const finalStats = await client.query(api.ragManagement.getAgentStats, {
                    agentId: AGENT_ID,
                });
                console.log(`   Final state:`);
                console.log(`   - Chunks remaining: ${finalStats.totalChunks}`);
                console.log(`   - Status: ${finalStats.status}\n`);
                break;
            }

            const progress = (status.progress || 0).toFixed(1);
            const processed = status.processedItems;
            const total = status.totalItems;
            
            console.log(`   ⏳ Progress: ${progress}% (${processed}/${total} chunks)`);
            
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
            attempts++;
        } catch (e) {
            console.log(`   ⚠️  Could not check status: ${e}`);
            break;
        }
    }
    
    if (attempts >= maxAttempts) {
        console.log(`\n   ⚠️  Monitoring timed out. Deletion is still running in background.`);
        console.log(`   Check status later with: getDeletionStatus({ agentId: "${AGENT_ID}" })\n`);
    }
}

async function legacyDeletion() {
    console.log("2️⃣  Starting legacy deletion (may take 30-60 seconds)...\n");
    
    try {
        const result = await client.action(api.rag.clearNamespace, {
            namespace: AGENT_ID,
        }) as any;

        console.log(`   ✅ Deleted ${result.deleted} chunks\n`);
        
        // Verify
        console.log("3️⃣  Verifying deletion...");
        const searchResult = await client.action(api.rag.search, {
            namespace: AGENT_ID,
            query: "test",
            limit: 1,
            minScore: 0,
        }) as any;
        
        if (searchResult.results && searchResult.results.length === 0) {
            console.log(`   ✅ All chunks deleted successfully!\n`);
        } else {
            console.log(`   ⚠️  Some chunks may remain: ${searchResult.results.length}\n`);
        }
    } catch (error) {
        console.error(`   ❌ Legacy deletion failed:`, error);
        throw error;
    }
}

// Run deletion
if (require.main === module) {
    deleteAgentChunks().then(() => {
        console.log("🎉 Done!");
        process.exit(0);
    }).catch(error => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
}
