/**
 * Call Manager - Unified call lifecycle management
 * 
 * Provides a single interface for:
 * - Managing both inbound and outbound calls
 * - Tracking active calls
 * - Collecting call metrics
 * - Generating call reports
 */

import { EventEmitter } from 'events';
import { logger } from '../core/logging.js';
import { SessionService } from '../services/session.js';
import { CallTrackingService } from '../services/call-tracking.js';
import { telephonyConfig, isTelephonyConfigured } from './config.js';
import { LatencyTracker, createLatencyTracker, LatencyOperation } from './latency-tracker.js';
import { SIPHandler, createSIPHandler } from './sip-handler.js';
import { InboundCallHandler, createInboundCallHandler, InboundCallContext } from './inbound-handler.js';
import { OutboundCallHandler, createOutboundCallHandler } from './outbound-handler.js';
import {
  SIPParticipantInfo,
  SIPCallState,
  OutboundCallRequest,
  OutboundCallResponse,
  TelephonyCallEvent,
  GreetingConfig,
  SessionLatencyStats,
} from './types.js';
import { CallType, SessionStatus } from '../models/session.js';

/**
 * Active call information
 */
interface ActiveCall {
  callId: string;
  sessionId: string;
  roomName: string;
  callType: 'inbound' | 'outbound' | 'web';
  state: SIPCallState;
  sipInfo?: SIPParticipantInfo;
  latencyTracker: LatencyTracker;
  startedAt: number;
  answeredAt?: number;
  endedAt?: number;
}

/**
 * Call Manager events
 */
export interface CallManagerEvents {
  'call:started': (call: ActiveCall) => void;
  'call:answered': (call: ActiveCall) => void;
  'call:ended': (call: ActiveCall, reason: string) => void;
  'call:error': (callId: string, error: Error) => void;
  'latency:exceeded': (call: ActiveCall, operation: string, latencyMs: number) => void;
}

/**
 * Call Manager - Central orchestrator for telephony
 */
export class CallManager extends EventEmitter {
  private activeCalls: Map<string, ActiveCall> = new Map();
  private sessionService?: SessionService;
  private callTracker?: CallTrackingService;
  private inboundHandler?: InboundCallHandler;
  private outboundHandler?: OutboundCallHandler;
  private customGreetings?: Partial<GreetingConfig>;

  constructor(options?: {
    sessionService?: SessionService;
    callTracker?: CallTrackingService;
    customGreetings?: Partial<GreetingConfig>;
  }) {
    super();
    this.sessionService = options?.sessionService;
    this.callTracker = options?.callTracker;
    this.customGreetings = options?.customGreetings;
  }

  /**
   * Check if telephony is configured and available
   */
  isAvailable(): boolean {
    return isTelephonyConfigured();
  }

  /**
   * Get current number of active calls
   */
  getActiveCallCount(): number {
    return this.activeCalls.size;
  }

  /**
   * Check if we can accept more calls
   */
  canAcceptCall(): boolean {
    return this.activeCalls.size < telephonyConfig.maxConcurrentCalls;
  }

  /**
   * Process an incoming participant (could be SIP or WebRTC)
   */
  async processIncomingParticipant(
    sessionId: string,
    roomName: string,
    participant: {
      identity: string;
      name?: string;
      kind?: string | number;
      attributes?: Record<string, string>;
      metadata?: string;
    },
    agentGreeting?: string
  ): Promise<InboundCallContext> {
    // Create latency tracker for this call
    const latencyTracker = createLatencyTracker(sessionId, {
      callType: 'inbound',
      isSIPCall: false, // Will be updated after detection
    });

    // Create or get inbound handler
    if (!this.inboundHandler) {
      this.inboundHandler = createInboundCallHandler(latencyTracker, {
        customGreetings: this.customGreetings,
      });
    }

    // Process participant
    const context = this.inboundHandler.processParticipant(participant, agentGreeting);

    // Update latency tracker with correct call type
    const callType = context.isSIPCall
      ? (context.sipInfo?.callDirection === 'outbound' ? 'outbound' : 'inbound')
      : 'web';

    // Generate call ID
    const callId = `${callType}_${sessionId}`;

    // Create active call record
    const activeCall: ActiveCall = {
      callId,
      sessionId,
      roomName,
      callType: callType as 'inbound' | 'outbound' | 'web',
      state: SIPCallState.CONNECTED,
      sipInfo: context.sipInfo,
      latencyTracker,
      startedAt: Date.now(),
      answeredAt: Date.now(), // For inbound, answered = connected
    };

    // Track the call
    this.activeCalls.set(callId, activeCall);

    // Listen for latency breaches
    latencyTracker.on('target_exceeded', (measurement) => {
      this.emit('latency:exceeded', activeCall, measurement.operation, measurement.durationMs);
      logger.warning('Latency target exceeded', {
        callId,
        sessionId,
        operation: measurement.operation,
        latencyMs: measurement.durationMs,
        targetMs: measurement.targetMs,
      });
    });

    // Emit call started event
    this.emit('call:started', activeCall);

    logger.info('Incoming participant processed', {
      callId,
      sessionId,
      callType,
      isSIP: context.isSIPCall,
      callerPhone: context.sessionMetadata.callerPhoneNumber,
    });

    return context;
  }

  /**
   * Initiate an outbound call
   */
  async initiateOutboundCall(request: OutboundCallRequest): Promise<OutboundCallResponse> {
    // Check capacity
    if (!this.canAcceptCall()) {
      return {
        success: false,
        error: `Maximum concurrent calls (${telephonyConfig.maxConcurrentCalls}) reached`,
        callId: '',
        roomName: '',
        sipParticipantId: '',
        state: SIPCallState.FAILED,
        initiatedAt: Date.now(),
      };
    }

    // Create latency tracker
    const latencyTracker = createLatencyTracker(`outbound_${Date.now()}`, {
      callType: 'outbound',
      isSIPCall: true,
    });

    // Create outbound handler
    if (!this.outboundHandler) {
      this.outboundHandler = createOutboundCallHandler(latencyTracker);
    }

    // Initiate the call
    const response = await this.outboundHandler.initiateCall(request);

    if (response.success) {
      // Create active call record
      const activeCall: ActiveCall = {
        callId: response.callId,
        sessionId: '', // Will be assigned when session is created
        roomName: response.roomName,
        callType: 'outbound',
        state: response.state,
        latencyTracker,
        startedAt: response.initiatedAt,
      };

      this.activeCalls.set(response.callId, activeCall);
      this.emit('call:started', activeCall);
    }

    return response;
  }

  /**
   * Mark a call as answered (for outbound calls)
   */
  markCallAnswered(callId: string): void {
    const call = this.activeCalls.get(callId);
    if (call) {
      call.state = SIPCallState.CONNECTED;
      call.answeredAt = Date.now();
      this.emit('call:answered', call);

      logger.info('Call answered', {
        callId,
        ringDurationMs: call.answeredAt - call.startedAt,
      });
    }
  }

  /**
   * End a call
   */
  async endCall(callId: string, reason: string = 'normal'): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      logger.warning('Attempted to end unknown call', { callId });
      return;
    }

    call.state = SIPCallState.DISCONNECTED;
    call.endedAt = Date.now();

    // Log latency summary
    call.latencyTracker.logSummary();

    // Remove from active calls
    this.activeCalls.delete(callId);

    this.emit('call:ended', call, reason);

    logger.info('Call ended', {
      callId,
      sessionId: call.sessionId,
      callType: call.callType,
      durationMs: call.endedAt - call.startedAt,
      reason,
    });
  }

  /**
   * Get latency tracker for a call
   */
  getLatencyTracker(callId: string): LatencyTracker | undefined {
    return this.activeCalls.get(callId)?.latencyTracker;
  }

  /**
   * Get latency tracker by session ID
   */
  getLatencyTrackerBySession(sessionId: string): LatencyTracker | undefined {
    for (const call of this.activeCalls.values()) {
      if (call.sessionId === sessionId) {
        return call.latencyTracker;
      }
    }
    return undefined;
  }

  /**
   * Get active call by session ID
   */
  getCallBySession(sessionId: string): ActiveCall | undefined {
    for (const call of this.activeCalls.values()) {
      if (call.sessionId === sessionId) {
        return call;
      }
    }
    return undefined;
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): ActiveCall[] {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Get aggregated latency stats for all active calls
   */
  getAggregatedLatencyStats(): {
    totalCalls: number;
    callsByType: Record<string, number>;
    avgE2ELatencyMs: number;
    latencyBreaches: number;
  } {
    const calls = this.getActiveCalls();
    const callsByType: Record<string, number> = {
      inbound: 0,
      outbound: 0,
      web: 0,
    };

    let totalE2E = 0;
    let e2eCount = 0;
    let totalBreaches = 0;

    for (const call of calls) {
      callsByType[call.callType]++;
      
      const stats = call.latencyTracker.getSessionStats();
      if (stats.e2eLatency.measurements.length > 0) {
        totalE2E += stats.e2eLatency.avgMs;
        e2eCount++;
      }

      for (const opStats of Object.values(stats.summary)) {
        totalBreaches += opStats.exceededCount;
      }
    }

    return {
      totalCalls: calls.length,
      callsByType,
      avgE2ELatencyMs: e2eCount > 0 ? totalE2E / e2eCount : 0,
      latencyBreaches: totalBreaches,
    };
  }

  /**
   * Handle call error
   */
  handleCallError(callId: string, error: Error): void {
    const call = this.activeCalls.get(callId);
    if (call) {
      call.state = SIPCallState.FAILED;
      this.emit('call:error', callId, error);
      
      logger.error('Call error', {
        callId,
        sessionId: call.sessionId,
        error: error.message,
      });
    }
  }

  /**
   * Set session ID for a call (called after session creation)
   */
  setCallSessionId(callId: string, sessionId: string): void {
    const call = this.activeCalls.get(callId);
    if (call) {
      call.sessionId = sessionId;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Log final stats for all active calls
    for (const call of this.activeCalls.values()) {
      call.latencyTracker.logSummary();
    }
    
    this.activeCalls.clear();
    this.removeAllListeners();
    
    logger.info('CallManager cleaned up');
  }
}

/**
 * Create a call manager instance
 */
export function createCallManager(options?: {
  sessionService?: SessionService;
  callTracker?: CallTrackingService;
  customGreetings?: Partial<GreetingConfig>;
}): CallManager {
  return new CallManager(options);
}

/**
 * Singleton instance for global access
 */
let globalCallManager: CallManager | null = null;

/**
 * Get or create the global call manager instance
 */
export function getCallManager(options?: {
  sessionService?: SessionService;
  callTracker?: CallTrackingService;
  customGreetings?: Partial<GreetingConfig>;
}): CallManager {
  if (!globalCallManager) {
    globalCallManager = createCallManager(options);
  }
  return globalCallManager;
}

/**
 * Reset the global call manager (for testing)
 */
export function resetCallManager(): void {
  if (globalCallManager) {
    globalCallManager.cleanup();
    globalCallManager = null;
  }
}
