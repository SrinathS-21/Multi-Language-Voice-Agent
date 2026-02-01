import { ConvexHttpClient } from 'convex/browser';
import * as dotenv from 'dotenv';

dotenv.config();

type AnyClient = {
    query: (name: string, args: any) => Promise<any>;
};

async function main() {
    const client = new ConvexHttpClient(process.env.CONVEX_URL!) as unknown as AnyClient;
    
    // Get all organizations first
    const orgs = await client.query('organizations:list', {});
    
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('📋 CONVEX DATABASE - AGENTS OVERVIEW');
    console.log('════════════════════════════════════════════════════════════\n');
    
    for (const org of orgs) {
        console.log(`🏢 Organization: ${org.name}`);
        console.log(`   ID: ${org._id}`);
        console.log(`   Slug: ${org.slug}`);
        console.log('   ────────────────────────────────────────────────────────');
        
        const agents = await client.query('agents:listByOrganization', { 
            organizationId: org._id 
        });
        
        if (agents.length === 0) {
            console.log('   No agents found\n');
            continue;
        }
        
        for (const agent of agents) {
            console.log(`\n   🤖 Agent: ${agent.name}`);
            console.log(`      ID: ${agent._id}`);
            console.log(`      Role: ${agent.role || 'N/A'}`);
            console.log(`      Created: ${new Date(agent.createdAt).toLocaleString()}`);
            
            // Check if agent has config
            if (agent.config) {
                try {
                    const config = JSON.parse(agent.config);
                    console.log(`      Voice: ${config.voice || 'default'}`);
                    console.log(`      Language: ${config.language || 'en-IN'}`);
                } catch {}
            }
        }
        console.log('\n');
    }
}

main().catch(console.error);
