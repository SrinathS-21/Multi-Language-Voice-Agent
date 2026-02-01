/**
 * Make Outbound Call Script
 * 
 * Initiates an outbound call via the API server
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

async function makeOutboundCall(phoneNumber: string) {
    const apiUrl = `http://localhost:${process.env.API_PORT || 8000}/api/v1/calls/outbound`;
    
    const request: OutboundCallRequest = {
        organizationId: process.env.ORGANIZATION_ID!,
        agentId: process.env.ARROW_AGENT_ID!, // Use Arrow Hospital agent
        phoneNumber: phoneNumber,
        ringTimeout: 30,
        metadata: {
            purpose: 'test_call',
            hospital: 'Arrow Multispeciality Hospital',
        },
    };
    
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║              INITIATING OUTBOUND CALL                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log('📞 Call Details:');
    console.log(`   To: +91-${phoneNumber}`);
    console.log(`   Agent: Arrow Hospital (Priya)`);
    console.log(`   Agent ID: ${request.agentId}`);
    console.log(`   Organization: ${request.organizationId}`);
    console.log(`   API: ${apiUrl}\n`);
    
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
            console.log('   Answer to start testing the Arrow Hospital agent\n');
            
            console.log('🧪 TEST SCENARIOS:');
            console.log('   1. Ask: "Is physiotherapy included in knee replacement package?"');
            console.log('      → Should trigger search_knowledge() first');
            console.log('   2. Say: "I need knee replacement consultation"');
            console.log('      → Should book appointment and collect all details');
            console.log('   3. Say: "What is the cost of hip replacement?"');
            console.log('      → Should search knowledge base for pricing\n');
            
        } else {
            console.error('❌ Call initiation failed:');
            console.error(`   Error: ${response.data.error}\n`);
        }
        
    } catch (error: any) {
        console.error('\n❌ ERROR INITIATING CALL\n');
        
        if (error.code === 'ECONNREFUSED') {
            console.error('   Could not connect to API server!');
            console.error(`   Make sure the API server is running on port ${process.env.API_PORT || 8000}`);
            console.error('   Run: npm run dev:api\n');
        } else if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Error: ${error.response.data?.error || error.response.statusText}\n`);
        } else {
            console.error(`   ${error.message}\n`);
        }
        
        process.exit(1);
    }
}

// Get phone number from command line or use default
const phoneNumber = process.argv[2] || process.env.TEST_PHONE_NUMBER || '9944559392';

makeOutboundCall(phoneNumber).catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
