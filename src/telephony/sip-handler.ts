/**
 * SIP Handler - Extract and process SIP participant information
 * 
 * Handles:
 * - Detecting if a participant is a SIP participant (phone call)
 * - Extracting phone number and call metadata from SIP headers
 * - Managing SIP participant lifecycle
 */

import { logger } from '../core/logging.js';
import { SIPParticipantInfo, CallDirection } from './types.js';
import { LatencyTracker, LatencyOperation } from './latency-tracker.js';

/**
 * LiveKit participant-like interface
 * (Avoiding direct LiveKit dependency for testability)
 */
interface ParticipantLike {
  identity: string;
  name?: string;
  kind?: string | number;
  attributes?: Record<string, string>;
  metadata?: string;
}

/**
 * LiveKit Participant Kind enum values
 */
const ParticipantKind = {
  STANDARD: 0,
  INGRESS: 1,
  EGRESS: 2,
  SIP: 3,
  AGENT: 4,
};

/**
 * SIP Handler class for processing SIP participants
 */
export class SIPHandler {
  private latencyTracker?: LatencyTracker;

  constructor(latencyTracker?: LatencyTracker) {
    this.latencyTracker = latencyTracker;
  }

  /**
   * Check if a participant is a SIP participant (phone call)
   */
  isSIPParticipant(participant: ParticipantLike): boolean {
    // Check participant kind (numeric value 3 = SIP)
    if (participant.kind === ParticipantKind.SIP || participant.kind === 'SIP') {
      return true;
    }

    // Fallback: Check identity prefix
    if (participant.identity?.startsWith('sip_') || participant.identity?.startsWith('phone_')) {
      return true;
    }

    // Fallback: Check attributes for SIP markers
    if (participant.attributes) {
      if (
        participant.attributes['sip.callId'] ||
        participant.attributes['sip.phoneNumber'] ||
        participant.attributes['lk.sip.trunkId']
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Extract SIP information from a participant
   */
  extractSIPInfo(participant: ParticipantLike): SIPParticipantInfo {
    const startTime = this.latencyTracker?.startTiming(LatencyOperation.SIP_CONNECT);

    const isSIP = this.isSIPParticipant(participant);

    if (!isSIP) {
      if (startTime) {
        this.latencyTracker?.endTiming(startTime);
      }
      return { isSIP: false };
    }

    const attrs = participant.attributes || {};
    let metadata: Record<string, any> = {};

    // Try to parse metadata JSON
    if (participant.metadata) {
      try {
        metadata = JSON.parse(participant.metadata);
      } catch {
        // Metadata is not JSON, ignore
      }
    }

    // Extract phone number from various possible attribute keys
    const callerPhoneNumber =
      attrs['sip.phoneNumber'] ||
      attrs['sip.callerNumber'] ||
      attrs['sip.from'] ||
      attrs['lk.sip.phoneNumber'] ||
      metadata.phoneNumber ||
      this.extractPhoneFromIdentity(participant.identity);

    // Extract destination phone (for outbound calls)
    const destinationPhoneNumber =
      attrs['sip.destinationNumber'] ||
      attrs['sip.to'] ||
      attrs['lk.sip.toPhoneNumber'] ||
      metadata.destinationPhoneNumber;

    // Determine call direction
    const callDirectionAttr = attrs['sip.direction'] || attrs['sip.callDirection'];
    let callDirection: CallDirection | undefined;
    
    if (callDirectionAttr === 'inbound' || callDirectionAttr === 'incoming') {
      callDirection = CallDirection.INBOUND;
    } else if (callDirectionAttr === 'outbound' || callDirectionAttr === 'outgoing') {
      callDirection = CallDirection.OUTBOUND;
    } else {
      // Infer from context: if we initiated it, it's outbound
      callDirection = destinationPhoneNumber ? CallDirection.OUTBOUND : CallDirection.INBOUND;
    }

    // Extract other SIP metadata
    const callSid =
      attrs['sip.callSid'] ||
      attrs['sip.callId'] ||
      attrs['twilio.callSid'] ||
      metadata.callSid;

    const trunkId =
      attrs['lk.sip.trunkId'] ||
      attrs['sip.trunkId'] ||
      metadata.trunkId;

    // Build SIP headers map
    const sipHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('sip.header.')) {
        sipHeaders[key.replace('sip.header.', '')] = value;
      }
    }

    const sipInfo: SIPParticipantInfo = {
      isSIP: true,
      callerPhoneNumber,
      destinationPhoneNumber,
      callDirection,
      callSid,
      trunkId,
      sipParticipantId: participant.identity,
      sipHeaders: Object.keys(sipHeaders).length > 0 ? sipHeaders : undefined,
      connectedAt: Date.now(),
    };

    // End latency tracking
    if (startTime) {
      this.latencyTracker?.endTiming(startTime);
    }

    logger.info('SIP participant info extracted', {
      identity: participant.identity,
      callerPhoneNumber: sipInfo.callerPhoneNumber,
      callDirection: sipInfo.callDirection,
      callSid: sipInfo.callSid,
    });

    return sipInfo;
  }

  /**
   * Try to extract phone number from participant identity
   * Identity format might be like: sip_+15550100 or phone_15550100
   */
  private extractPhoneFromIdentity(identity: string): string | undefined {
    if (!identity) return undefined;

    // Try common patterns
    const patterns = [
      /^sip_(\+?\d+)$/,
      /^phone_(\+?\d+)$/,
      /^(\+\d{10,15})$/,
      /^sip:(\+?\d+)@/,
    ];

    for (const pattern of patterns) {
      const match = identity.match(pattern);
      if (match && match[1]) {
        // Ensure E.164 format
        let phone = match[1];
        if (!phone.startsWith('+')) {
          phone = '+' + phone;
        }
        return phone;
      }
    }

    return undefined;
  }

  /**
   * Format phone number for display (redacted for privacy)
   */
  formatPhoneForLogging(phoneNumber: string | undefined): string {
    if (!phoneNumber) return 'unknown';
    
    // Show first 2 and last 2 digits: +1***0100
    if (phoneNumber.length > 6) {
      const prefix = phoneNumber.substring(0, 3);
      const suffix = phoneNumber.substring(phoneNumber.length - 4);
      return `${prefix}***${suffix}`;
    }
    
    return '***';
  }

  /**
   * Get greeting type based on call direction
   */
  getGreetingType(sipInfo: SIPParticipantInfo): 'inbound_phone' | 'outbound_phone' | 'web' {
    if (!sipInfo.isSIP) {
      return 'web';
    }
    
    if (sipInfo.callDirection === CallDirection.OUTBOUND) {
      return 'outbound_phone';
    }
    
    return 'inbound_phone';
  }
}

/**
 * Create a SIP handler instance
 */
export function createSIPHandler(latencyTracker?: LatencyTracker): SIPHandler {
  return new SIPHandler(latencyTracker);
}
