/**
 * Helper script to get DEFAULT_AGENT_ID and DEFAULT_ORGANIZATION_ID
 * Run: npx tsx scripts/get-default-ids.ts
 */

import { getConvexClient } from '../src/core/convex-client.js';

async function getDefaultIds() {
    const convex = getConvexClient();
    
    console.log('\n📋 Fetching IDs for .env configuration...\n');
    
    // Get organizations
    const orgs = await convex.query('organizations:list', {});
    
    if (orgs && orgs.length > 0) {
        console.log('🏢 ORGANIZATIONS:');
        orgs.forEach((org: any, i: number) => {
            console.log(`${i + 1}. ${org.name || 'Unnamed'}`);
            console.log(`   ID: ${org._id}`);
            console.log(`   Slug: ${org.slug || 'N/A'}\n`);
        });
        
        console.log('✅ Copy one of these IDs for DEFAULT_ORGANIZATION_ID\n');
    } else {
        console.log('⚠️  No organizations found. Create one first.\n');
    }
    
    // Get agents
    const agents = await convex.query('agents:listAll', {});
    
    if (agents && agents.length > 0) {
        console.log('🤖 AGENTS:');
        agents.forEach((agent: any, i: number) => {
            console.log(`${i + 1}. ${agent.name || 'Unnamed'}`);
            console.log(`   ID: ${agent._id}`);
            console.log(`   Phone: ${agent.phoneCountryCode || ''}${agent.phoneNumber || 'N/A'}`);
            console.log(`   Status: ${agent.status || 'active'}\n`);
        });
        
        console.log('✅ Copy one of these IDs for DEFAULT_AGENT_ID\n');
    } else {
        console.log('⚠️  No agents found. Create one first.\n');
    }
    
    console.log('📝 Add to your .env file:');
    console.log('DEFAULT_ORGANIZATION_ID=<org_id_from_above>');
    console.log('DEFAULT_AGENT_ID=<agent_id_from_above>');
    console.log('API_PORT=8000\n');
}

getDefaultIds().catch(console.error);
