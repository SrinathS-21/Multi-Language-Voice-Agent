/**
 * Test script to verify agent dispatch functionality
 * Usage: npm run test-dispatch
 */

import { AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { config } from '../src/core/config.js';
import { logger } from '../src/core/logging.js';
import dotenv from 'dotenv';

dotenv.config();

const AGENT_NAME = 'sarvam-voice-agent';

async function testDispatch() {
  try {
    logger.info('🧪 Testing agent dispatch configuration...');
    logger.info('LiveKit URL:', config.livekit.url);
    logger.info('API Key:', config.livekit.apiKey?.substring(0, 10) + '...');
    
    // Create Room Service and Agent Dispatch clients  
    const roomService = new RoomServiceClient(
      config.livekit.url,
      config.livekit.apiKey,
      config.livekit.apiSecret
    );
    
    const agentDispatch = new AgentDispatchClient(
      config.livekit.url,
      config.livekit.apiKey,
      config.livekit.apiSecret
    );
    
    // Generate test room name
    const testRoomName = `test-dispatch-${Date.now()}`;
    
    logger.info(`Creating test room: ${testRoomName}`);
    await roomService.createRoom({ name: testRoomName });
    logger.info('✅ Test room created');
    
    // Create dispatch (simulating real outbound call with specific agent)
    const testAgentId = 'j572y5c7ms13r66d8dbfn6bq45809jtt'; // First agent from DB
    logger.info(`Creating dispatch for agent: ${AGENT_NAME}`);
    logger.info(`🎯 Testing with specific agentId: ${testAgentId}`);
    const dispatch = await agentDispatch.createDispatch(testRoomName, AGENT_NAME, {
      metadata: JSON.stringify({
        organizationId: process.env.DEFAULT_ORGANIZATION_ID || 'jx763x0zjyhwfc0mr39h107zyd7zgyjt',
        agentId: testAgentId,
        callType: 'test-outbound',
        test: true,
        timestamp: Date.now(),
      }),
    });
    
    logger.info('✅ Dispatch created successfully!', {
      dispatchId: dispatch?.id,
      roomName: testRoomName,
      agentName: AGENT_NAME,
    });
    
    // Wait a few seconds for agent to join
    logger.info('Waiting 10 seconds for agent to join...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check room participants
    const participants = await roomService.listParticipants(testRoomName);
    logger.info(`Room participants: ${participants.length}`, {
      participants: participants.map(p => ({
        identity: p.identity,
        name: p.name,
        joined: p.joinedAt,
      })),
    });
    
    if (participants.length > 0) {
      logger.info('✅ SUCCESS: Agent joined the room!');
    } else {
      logger.error('❌ FAILED: Agent did NOT join the room');
      logger.error('⚠️  This indicates the agent is not receiving dispatch events');
    }
    
    // Cleanup
    logger.info('Cleaning up test room...');
    await roomService.deleteRoom(testRoomName);
    logger.info('✅ Test complete');
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    if (error instanceof Error) {
      logger.error('Error stack:', error.stack);
    }
    process.exit(1);
  }
}

testDispatch();
