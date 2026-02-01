#!/usr/bin/env tsx
/**
 * Dynamic Outbound Call Script
 * 
 * Make outbound calls to any agent by providing:
 * - Agent ID
 * - Organization ID
 * - Phone Number
 * 
 * Usage:
 *   npx tsx scripts/call-agent-dynamic.ts <agentId> <orgId> <phoneNumber>
 * 
 * Example:
 *   npx tsx scripts/call-agent-dynamic.ts j57b8cft4c2dhfsy8s9gac6mes7zg6es j972vhgpe9yxfj4v4smwzqy2wn701sm3 9944559392
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

interface OutboundCallRequest {
    organizationId: string;
    agentId: string;
    phoneNumber: string;
    roomName?: string;
    ringTimeout?: number;
    metadata?: Record<string, string>;
}

async function makeOutboundCall(agentId: string, organizationId: string, phoneNumber: string) {
    const apiPort = process.env.API_PORT || '8000';
    const apiUrl = `http://localhost:${apiPort}/api/v1/calls/outbound`;
    
    const request: OutboundCallRequest = {
        organizationId: organizationId,
        agentId: agentId,
        phoneNumber: phoneNumber,
        ringTimeout: 30,
        metadata: {
            purpose: 'test_call',
            source: 'dynamic_script',
        },
    };
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              INITIATING OUTBOUND CALL                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log('📞 Call Details:');
    console.log(`   Phone Number: +91-${phoneNumber}`);
    console.log(`   Agent ID: ${agentId}`);
    console.log(`   Organization ID: ${organizationId}`);
    console.log(`   API Endpoint: ${apiUrl}\n`);
    
    try {
        console.log('🔄 Sending request to API server...\n');
        
        const response = await axios.post(apiUrl, request, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
        });
        
        if (response.data.success) {
            console.log('✅ CALL INITIATED SUCCESSFULLY!\n');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log(`   Call ID: ${response.data.callId}`);
            console.log(`   Room Name: ${response.data.roomName}`);
            console.log(`   SIP Participant: ${response.data.sipParticipantId}`);
            console.log(`   State: ${response.data.state}`);
            console.log('═══════════════════════════════════════════════════════════════\n');
            
            console.log('📱 The phone should ring shortly!');
            console.log('   Answer to start testing the agent\n');
            
        } else {
            console.error('❌ Call initiation failed:');
            console.error(`   Error: ${response.data.error}\n`);
            process.exit(1);
        }
        
    } catch (error: any) {
        console.error('\n❌ ERROR INITIATING CALL\n');
        
        if (error.code === 'ECONNREFUSED') {
            console.error('   Could not connect to API server!');
            console.error(`   Make sure the API server is running on port ${apiPort}`);
            console.error('   Run: npm run dev:api\n');
        } else if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Error: ${error.response.data?.error || error.response.statusText}\n`);
            if (error.response.data?.details) {
                console.error(`   Details: ${JSON.stringify(error.response.data.details, null, 2)}\n`);
            }
        } else {
            console.error(`   ${error.message}\n`);
        }
        
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 3) {
    console.error('\n❌ Missing required arguments!\n');
    console.error('Usage:');
    console.error('  npx tsx scripts/call-agent-dynamic.ts <agentId> <orgId> <phoneNumber>\n');
    console.error('Example:');
    console.error('  npx tsx scripts/call-agent-dynamic.ts j57b8cft4c2dhfsy8s9gac6mes7zg6es j972vhgpe9yxfj4v4smwzqy2wn701sm3 9944559392\n');
    process.exit(1);
}

const [agentId, organizationId, phoneNumber] = args;

makeOutboundCall(agentId, organizationId, phoneNumber).catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
