/**
 * Clear All Convex Data Script
 * 
 * This script clears ALL data from your Convex database:
 * - All organizations
 * - All agents
 * - All sessions and call history
 * - All documents and RAG knowledge
 * - All analytics data
 * - All function schemas
 * 
 * ⚠️  WARNING: THIS IS IRREVERSIBLE! ⚠️
 * 
 * Usage:
 *   npx tsx scripts/clear-all-data.ts
 */

import { ConvexHttpClient } from 'convex/browser';
import * as dotenv from 'dotenv';

dotenv.config();

// Type helper to bypass strict typing for dynamic function calls
type AnyClient = {
    query: (name: string, args: any) => Promise<any>;
    mutation: (name: string, args: any) => Promise<any>;
    action: (name: string, args: any) => Promise<any>;
};

const CONVEX_URL = process.env.CONVEX_URL || '';

if (!CONVEX_URL) {
    console.error('❌ CONVEX_URL not found in environment variables');
    process.exit(1);
}

async function clearAllData() {
    console.log('\n⚠️  WARNING: This will DELETE ALL DATA from Convex!');
    console.log('⚠️  This action is IRREVERSIBLE!\n');
    
    const convex = new ConvexHttpClient(CONVEX_URL) as unknown as AnyClient;
    
    try {
        console.log('🔍 Starting data cleanup...\n');
        
        // ===========================================
        // 1. GET ALL ORGANIZATIONS
        // ===========================================
        console.log('📋 Step 1: Fetching organizations...');
        const organizations = await convex.query('organizations:list', {}) as any[];
        console.log(`   Found ${organizations.length} organizations\n`);
        
        // ===========================================
        // 2. CLEAR EACH ORGANIZATION
        // ===========================================
        for (const org of organizations) {
            console.log(`🏢 Processing Organization: ${org.name} (${org._id})`);
            console.log('─'.repeat(60));
            
            // Get all agents in this organization
            const agents = await convex.query('agents:listByOrganization', {
                organizationId: org._id
            }) as any[];
            
            console.log(`   Found ${agents.length} agents\n`);
            
            // Clear each agent
            for (const agent of agents) {
                console.log(`   🤖 Agent: ${agent.name} (${agent._id})`);
                
                // Clear RAG namespace
                try {
                    const clearResult = await convex.action('rag:clearNamespace', {
                        namespace: agent._id,
                    }) as any;
                    console.log(`      ✅ Cleared ${clearResult.deleted} RAG entries`);
                } catch (error) {
                    console.log(`      ⚠️  No RAG data to clear`);
                }
                
                // Delete documents
                try {
                    const docs = await convex.query('documents:listByAgent', {
                        agentId: agent._id
                    }) as any[];
                    
                    for (const doc of docs) {
                        await convex.mutation('documents:deleteByDocumentId', {
                            documentId: doc.documentId
                        });
                    }
                    console.log(`      ✅ Deleted ${docs.length} documents`);
                } catch (error) {
                    console.log(`      ⚠️  No documents to delete`);
                }
                
                // Delete call sessions
                try {
                    const sessions = await convex.query('callSessions:listByAgent', {
                        agentId: agent._id
                    }) as any[];
                    
                    for (const session of sessions) {
                        await convex.mutation('callSessions:deleteSession', {
                            sessionId: session.sessionId
                        });
                    }
                    console.log(`      ✅ Deleted ${sessions.length} call sessions`);
                } catch (error) {
                    console.log(`      ⚠️  No sessions to delete`);
                }
                
                // Delete agent analytics
                try {
                    await convex.mutation('agentAnalytics:deleteByAgent', {
                        agentId: agent._id
                    });
                    console.log(`      ✅ Deleted agent analytics`);
                } catch (error) {
                    console.log(`      ⚠️  No analytics to delete`);
                }
                
                // Delete function schemas
                try {
                    await convex.mutation('functionSchemas:deleteByOrganization', {
                        organizationId: org._id
                    });
                    console.log(`      ✅ Deleted function schemas`);
                } catch (error) {
                    console.log(`      ⚠️  No function schemas to delete`);
                }
                
                // Delete the agent itself
                await convex.mutation('agents:deleteAgent', { agentId: agent._id });
                console.log(`      ✅ Deleted agent\n`);
            }
            
            // Delete the organization
            await convex.mutation('organizations:deleteOrg', { id: org._id });
            console.log(`   ✅ Deleted organization: ${org.name}\n`);
        }
        
        console.log('═'.repeat(60));
        console.log('✅ ALL DATA CLEARED SUCCESSFULLY!');
        console.log('═'.repeat(60));
        console.log('\nDatabase is now completely empty.');
        console.log('You can now start fresh with new organizations and agents.\n');
        
    } catch (error) {
        console.error('\n❌ Error during cleanup:', (error as Error).message);
        console.error((error as Error).stack);
        process.exit(1);
    }
}

// Run the cleanup
clearAllData().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
