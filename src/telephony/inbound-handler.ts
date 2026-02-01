/**
 * Inbound Call Handler - Process incoming phone calls
 * 
 * Handles:
 * - Inbound SIP call detection
 * - Caller information extraction
 * - Session creation with phone metadata
 * - Appropriate greeting selection
 */

import { logger } from '../core/logging.js';
import { SIPHandler, createSIPHandler } from './sip-handler.js';
import { LatencyTracker, LatencyOperation } from './latency-tracker.js';
import { SIPParticipantInfo, GreetingConfig, CallDirection } from './types.js';
import { telephonyConfig } from './config.js';

/**
 * Default greetings for different call types
 */
const DEFAULT_GREETINGS: GreetingConfig = {
  inboundPhone: 'Thank you for calling. How may I help you today?',
  outboundPhone: 'Hello, this is an automated call from your healthcare provider. How can I assist you?',
  web: 'Hello! How can I help you today?',
  default: 'Hello! How can I help you?',
};

/**
 * Inbound call context with all extracted information
 */
export interface InboundCallContext {
  /** Whether this is a SIP/phone call */
  isSIPCall: boolean;
  
  /** SIP participant info (if SIP call) */
  sipInfo?: SIPParticipantInfo;
  
  /** Selected greeting for this call type */
  greeting: string;
  
  /** Call type for session */
  callType: 'web' | 'inbound' | 'outbound';
  
  /** Metadata to add to session */
  sessionMetadata: {
    callerPhoneNumber?: string;
    callDirection?: string;
    callSid?: string;
    sipParticipantId?: string;
    isTelephony: boolean;
  };
  
  /** Latency tracker for this call */
  latencyTracker: LatencyTracker;
}

/**
 * Inbound Call Handler
 */
export class InboundCallHandler {
  private sipHandler: SIPHandler;
  private latencyTracker: LatencyTracker;
  private greetings: GreetingConfig;

  constructor(
    latencyTracker: LatencyTracker,
    options?: {
      customGreetings?: Partial<GreetingConfig>;
    }
  ) {
    this.latencyTracker = latencyTracker;
    this.sipHandler = createSIPHandler(latencyTracker);
    this.greetings = {
      ...DEFAULT_GREETINGS,
      ...options?.customGreetings,
    };
  }

  /**
   * Process a participant joining to determine if it's an inbound call
   */
  processParticipant(
    participant: {
      identity: string;
      name?: string;
      kind?: string | number;
      attributes?: Record<string, string>;
      metadata?: string;
    },
    agentGreeting?: string
  ): InboundCallContext {
    const timingKey = this.latencyTracker.startTiming(
      LatencyOperation.SIP_CONNECT,
      { participantId: participant.identity }
    );

    // Extract SIP info
    const sipInfo = this.sipHandler.extractSIPInfo(participant);
    
    // Determine call type and greeting
    let greeting: string;
    let callType: 'web' | 'inbound' | 'outbound';
    
    if (sipInfo.isSIP) {
      if (sipInfo.callDirection === CallDirection.OUTBOUND) {
        callType = 'outbound';
        greeting = agentGreeting || this.greetings.outboundPhone;
      } else {
        callType = 'inbound';
        greeting = agentGreeting || this.greetings.inboundPhone;
      }
    } else {
      callType = 'web';
      greeting = agentGreeting || this.greetings.web;
    }

    // Build session metadata
    const sessionMetadata = {
      callerPhoneNumber: sipInfo.callerPhoneNumber,
      callDirection: sipInfo.callDirection,
      callSid: sipInfo.callSid,
      sipParticipantId: sipInfo.sipParticipantId,
      isTelephony: sipInfo.isSIP,
    };

    this.latencyTracker.endTiming(timingKey);

    const context: InboundCallContext = {
      isSIPCall: sipInfo.isSIP,
      sipInfo: sipInfo.isSIP ? sipInfo : undefined,
      greeting,
      callType,
      sessionMetadata,
      latencyTracker: this.latencyTracker,
    };

    logger.info('Inbound call context created', {
      isSIPCall: context.isSIPCall,
      callType: context.callType,
      callerPhone: this.sipHandler.formatPhoneForLogging(sipInfo.callerPhoneNumber),
    });

    return context;
  }

  /**
   * Get greeting for a specific call type
   */
  getGreeting(callType: 'inbound_phone' | 'outbound_phone' | 'web'): string {
    switch (callType) {
      case 'inbound_phone':
        return this.greetings.inboundPhone;
      case 'outbound_phone':
        return this.greetings.outboundPhone;
      case 'web':
        return this.greetings.web;
      default:
        return this.greetings.default;
    }
  }

  /**
   * Update greetings configuration
   */
  setGreetings(greetings: Partial<GreetingConfig>): void {
    this.greetings = {
      ...this.greetings,
      ...greetings,
    };
  }

  /**
   * Check if telephony is enabled for inbound calls
   */
  isEnabled(): boolean {
    return telephonyConfig.enabled;
  }
}

/**
 * Create an inbound call handler
 */
export function createInboundCallHandler(
  latencyTracker: LatencyTracker,
  options?: {
    customGreetings?: Partial<GreetingConfig>;
  }
): InboundCallHandler {
  return new InboundCallHandler(latencyTracker, options);
}
