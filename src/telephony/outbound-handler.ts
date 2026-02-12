/**
 * Outbound Call Handler - Initiate outgoing phone calls
 * 
 * Handles:
 * - Creating SIP participants for outbound calls
 * - Phone number validation
 * - Room creation for calls
 * - Call state tracking
 */

import { RoomServiceClient, SipClient, AgentDispatchClient } from 'livekit-server-sdk';
import { logger } from '../core/logging.js';
import { config } from '../core/config.js';
import { 
  telephonyConfig, 
  isOutboundEnabled, 
  validatePhoneNumber,
  generateSIPRoomName,
} from './config.js';
import { LatencyTracker, LatencyOperation } from './latency-tracker.js';
import {
  OutboundCallRequest,
  OutboundCallResponse,
  SIPCallState,
  TelephonyError,
  TelephonyErrorType,
} from './types.js';

// Must match the agentName in WorkerOptions (src/agent/index.ts)
const AGENT_NAME = 'sarvam-voice-agent';

/**
 * Outbound Call Handler
 */
export class OutboundCallHandler {
  private roomService: RoomServiceClient;
  private sipClient: SipClient;
  private agentDispatch: AgentDispatchClient;
  private latencyTracker?: LatencyTracker;

  constructor(latencyTracker?: LatencyTracker) {
    this.latencyTracker = latencyTracker;
    
    // Initialize LiveKit Room Service client
    this.roomService = new RoomServiceClient(
      config.livekit.url,
      config.livekit.apiKey,
      config.livekit.apiSecret
    );
    
    // Initialize LiveKit SIP client for outbound calls
    this.sipClient = new SipClient(
      config.livekit.url,
      config.livekit.apiKey,
      config.livekit.apiSecret
    );

    // Initialize Agent Dispatch client for dispatching agents to rooms
    this.agentDispatch = new AgentDispatchClient(
      config.livekit.url,
      config.livekit.apiKey,
      config.livekit.apiSecret
    );
  }

  /**
   * Check if outbound calling is available
   */
  isAvailable(): boolean {
    return isOutboundEnabled();
  }

  /**
   * Validate an outbound call request
   */
  validateRequest(request: OutboundCallRequest): TelephonyError | null {
    // Check if outbound is enabled
    if (!this.isAvailable()) {
      return {
        type: TelephonyErrorType.SIP_TRUNK_UNAVAILABLE,
        message: 'Outbound calling is not enabled',
        retryable: false,
      };
    }

    // Validate phone number
    const phoneValidation = validatePhoneNumber(request.phoneNumber);
    if (!phoneValidation.isValid) {
      return {
        type: TelephonyErrorType.INVALID_PHONE_NUMBER,
        message: phoneValidation.error || 'Invalid phone number',
        retryable: false,
        details: { phoneNumber: request.phoneNumber },
      };
    }

    // Validate required fields
    if (!request.organizationId) {
      return {
        type: TelephonyErrorType.UNKNOWN,
        message: 'Organization ID is required',
        retryable: false,
      };
    }

    if (!request.agentId) {
      return {
        type: TelephonyErrorType.UNKNOWN,
        message: 'Agent ID is required',
        retryable: false,
      };
    }

    return null;
  }

  /**
   * Initiate an outbound call
   */
  async initiateCall(request: OutboundCallRequest): Promise<OutboundCallResponse> {
    const timingKey = this.latencyTracker?.startTiming(
      LatencyOperation.SIP_CONNECT,
      { phoneNumber: request.phoneNumber }
    );

    try {
      // Validate request
      const validationError = this.validateRequest(request);
      if (validationError) {
        logger.error('Outbound call validation failed', validationError);
        return {
          success: false,
          error: validationError.message,
          callId: '',
          roomName: '',
          sipParticipantId: '',
          state: SIPCallState.FAILED,
          initiatedAt: Date.now(),
        };
      }

      // Normalize phone number
      const phoneValidation = validatePhoneNumber(request.phoneNumber);
      const phoneNumber = phoneValidation.e164!;

      // Generate room name
      const roomName = request.roomName || generateSIPRoomName(
        request.organizationId,
        request.agentId
      );

      // Generate call ID
      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      logger.info('Initiating outbound call', {
        callId,
        roomName,
        phoneNumber: phoneNumber.substring(0, 3) + '***' + phoneNumber.slice(-4),
        organizationId: request.organizationId,
        agentId: request.agentId,
      });

      // Step 1: Create the room first
      await this.roomService.createRoom({ name: roomName });
      logger.info('Room created for outbound call', { roomName });

      // Step 2: Dispatch an agent to the room BEFORE placing the SIP call
      // This ensures the AI agent is ready when the callee picks up
      // agentName MUST match the agentName in WorkerOptions (src/agent/index.ts)
      try {
        const dispatch = await this.agentDispatch.createDispatch(roomName, AGENT_NAME, {
          metadata: JSON.stringify({
            organizationId: request.organizationId,
            agentId: request.agentId,
            callType: 'outbound',
            phoneNumber,
          }),
        });
        logger.info('Agent dispatched to room', { roomName, dispatchId: dispatch?.id });
      } catch (dispatchError) {
        logger.error('Agent dispatch failed - outbound call may have no agent', {
          roomName,
          error: dispatchError instanceof Error ? dispatchError.message : 'Unknown',
        });
      }

      // Step 2.5: Wait for agent to actually join the room before placing the call
      // LiveKit Cloud may need to cold-start the agent container (5-15 seconds)
      // Without this, the SIP call connects but the caller hears dead silence
      const agentReady = await this.waitForAgentToJoin(roomName, 20_000);
      if (!agentReady) {
        logger.error('Agent did not join room within timeout - aborting outbound call', {
          roomName,
          callId,
        });
        // Clean up the room since agent never joined
        try { await this.roomService.deleteRoom(roomName); } catch (_) {}
        return {
          success: false,
          error: 'Agent failed to join room within timeout. The agent may be starting up - please retry in a few seconds.',
          callId,
          roomName,
          sipParticipantId: '',
          state: SIPCallState.FAILED,
          initiatedAt: Date.now(),
        };
      }
      logger.info('Agent confirmed in room - placing SIP call', { roomName });

      // Step 3: Create SIP participant (this initiates the outbound call)
      const sipParticipantId = await this.createSIPParticipant(
        roomName,
        phoneNumber,
        request
      );

      if (timingKey) {
        this.latencyTracker?.endTiming(timingKey);
      }

      return {
        success: true,
        callId,
        roomName,
        sipParticipantId,
        state: SIPCallState.RINGING,
        initiatedAt: Date.now(),
      };

    } catch (error) {
      if (timingKey) {
        this.latencyTracker?.endTiming(timingKey);
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to initiate outbound call', {
        error: errorMessage,
        phoneNumber: request.phoneNumber,
      });

      return {
        success: false,
        error: errorMessage,
        callId: '',
        roomName: '',
        sipParticipantId: '',
        state: SIPCallState.FAILED,
        initiatedAt: Date.now(),
      };
    }
  }

  /**
   * Wait for an agent to join a room before placing the SIP call.
   * LiveKit Cloud may need to cold-start the agent container, which can take 5-15 seconds.
   * This prevents dead-air calls where the phone rings but no agent is in the room.
   */
  private async waitForAgentToJoin(roomName: string, timeoutMs: number = 20_000): Promise<boolean> {
    const startTime = Date.now();
    const pollIntervalMs = 1500; // Check every 1.5 seconds
    let attempt = 0;

    while (Date.now() - startTime < timeoutMs) {
      attempt++;
      try {
        const participants = await this.roomService.listParticipants(roomName);
        const agentParticipant = participants.find(p => p.identity?.startsWith('agent-'));
        
        if (agentParticipant) {
          logger.info('✅ Agent joined room', {
            roomName,
            agentIdentity: agentParticipant.identity,
            waitTimeMs: Date.now() - startTime,
            attempts: attempt,
          });
          return true;
        }
      } catch (error) {
        // Room may not be fully ready yet, keep polling
        logger.debug('Waiting for agent - room check failed', {
          roomName,
          attempt,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    logger.error('❌ Agent did not join room within timeout', {
      roomName,
      timeoutMs,
      attempts: attempt,
      elapsedMs: Date.now() - startTime,
    });
    return false;
  }

  /**
   * Create a SIP participant to initiate an outbound call
   * 
   * This calls the LiveKit SIP API to place the actual phone call
   * via the configured outbound SIP trunk (Twilio).
   */
  private async createSIPParticipant(
    roomName: string,
    phoneNumber: string,
    request: OutboundCallRequest
  ): Promise<string> {
    const trunkId = telephonyConfig.sip.outboundTrunkId;
    
    if (!trunkId) {
      throw new Error('Outbound SIP trunk ID not configured');
    }

    // Generate participant identity
    const participantIdentity = `sip_outbound_${phoneNumber.replace(/\+/g, '')}`;

    // Build participant metadata
    const metadata = JSON.stringify({
      organizationId: request.organizationId,
      agentId: request.agentId,
      callType: 'outbound',
      phoneNumber,
      ...request.metadata,
    });

    logger.info('Creating SIP participant for outbound call', {
      roomName,
      trunkId,
      phoneNumber: phoneNumber.substring(0, 3) + '***' + phoneNumber.slice(-4),
      participantIdentity,
    });

    try {
      // Call LiveKit SIP API to place the actual phone call
      const sipParticipant = await this.sipClient.createSipParticipant(
        trunkId,
        phoneNumber,
        roomName,
        {
          participantIdentity,
          participantMetadata: metadata,
          participantName: `Call to ${phoneNumber.slice(-4)}`,
          playDialtone: true,
          ringingTimeout: request.ringTimeout || telephonyConfig.defaultRingTimeout,
          maxCallDuration: 3600, // 1 hour max
        }
      );

      logger.info('SIP participant created - call initiated', {
        roomName,
        participantIdentity,
        sipCallId: sipParticipant.sipCallId,
      });

      return participantIdentity;

    } catch (error) {
      logger.error('Failed to create SIP participant for outbound call', {
        roomName,
        trunkId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Cancel/end an outbound call
   */
  async cancelCall(roomName: string, sipParticipantId: string): Promise<boolean> {
    try {
      // Remove the SIP participant from the room
      await this.roomService.removeParticipant(roomName, sipParticipantId);
      
      logger.info('Outbound call cancelled', { roomName, sipParticipantId });
      return true;

    } catch (error) {
      logger.error('Failed to cancel outbound call', {
        roomName,
        sipParticipantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get the current state of an outbound call
   */
  async getCallState(roomName: string): Promise<SIPCallState> {
    try {
      const participants = await this.roomService.listParticipants(roomName);
      
      // Check if there's a SIP participant
      const sipParticipant = participants.find(p => 
        p.identity.startsWith('sip_') || 
        p.kind === 3 // ParticipantKind.SIP
      );

      if (sipParticipant) {
        return SIPCallState.CONNECTED;
      }

      // Room exists but no SIP participant yet
      return SIPCallState.RINGING;

    } catch (error) {
      // Room doesn't exist or other error
      return SIPCallState.DISCONNECTED;
    }
  }
}

/**
 * Create an outbound call handler
 */
export function createOutboundCallHandler(
  latencyTracker?: LatencyTracker
): OutboundCallHandler {
  return new OutboundCallHandler(latencyTracker);
}
