/**
 * Script to list all agents and their document counts
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const CONVEX_URL = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
    console.error("❌ CONVEX_URL not found in environment");
    process.exit(1);
}

async function listAllAgents() {
    console.log("🤖 Listing all agents and their knowledge bases...\n");
    console.log("📡 Convex URL:", CONVEX_URL);

    const client = new ConvexHttpClient(CONVEX_URL!);

    try {
        // List all agents - using organization query
        const agents = await client.query(api.agents.listByOrganization, {
            organizationId: "jx74py2y8an3ws1k8kv9kp41s17zm17k"
        }) as any[];

        console.log(`\n✅ Found ${agents.length} agents total\n`);

        for (const agent of agents) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📝 Agent: ${agent.name}`);
            console.log(`   ID: ${agent.agentId}`);
            console.log(`   Organization: ${agent.organizationId || 'N/A'}`);
            console.log(`   Created: ${new Date(agent._creationTime).toLocaleString()}`);

            // Check documents for this agent
            try {
                const documents = await client.query(api.documents.listByAgentId, {
                    agentId: agent.agentId,
                }) as any[];

                console.log(`   📄 Documents: ${documents.length}`);
                
                if (documents.length > 0) {
                    documents.forEach((doc) => {
                        console.log(`      - ${doc.fileName} (${doc.status}, ${doc.chunkCount || 0} chunks)`);
                    });
                }

                // Check ingestion sessions
                const sessions = await client.query(api.documentIngestion.listSessionsByAgent, {
                    agentId: agent.agentId,
                }) as any[];

                if (sessions.length > 0) {
                    console.log(`   📋 Active Sessions: ${sessions.length}`);
                    sessions.forEach((session) => {
                        console.log(`      - ${session.fileName} (${session.stage})`);
                    });
                }

                // Check RAG metadata
                if (agent.ragMetadata) {
                    console.log(`   🔍 RAG Stats:`);
                    console.log(`      - Total Chunks: ${agent.ragMetadata.totalChunks || 0}`);
                    console.log(`      - Total Documents: ${agent.ragMetadata.totalDocuments || 0}`);
                    console.log(`      - Total Size: ${((agent.ragMetadata.totalSizeBytes || 0) / 1024).toFixed(2)} KB`);
                }
            } catch (err) {
                console.error(`   ❌ Error fetching documents: ${err}`);
            }
        }

        console.log(`\n${'='.repeat(60)}\n`);
        console.log("✅ Done!");

    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

listAllAgents();
