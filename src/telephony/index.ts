/**
 * Telephony Module - Main exports
 * 
 * This module provides Twilio-LiveKit telephony integration for the voice agent.
 * It enables real phone calls (inbound and outbound) while preserving LiveKit
 * WebRTC for development and testing.
 */

// Configuration
export {
  telephonyConfig,
  isTelephonyConfigured,
  isOutboundEnabled,
  getLatencyTarget,
  validatePhoneNumber,
  generateSIPRoomName,
  parseSIPRoomName,
  type TwilioConfig,
  type SIPConfig,
  type LatencyTargets,
  type TelephonyConfig,
} from './config.js';

// Types
export {
  CallDirection,
  SIPCallState,
  TelephonyErrorType,
  type SIPParticipantInfo,
  type OutboundCallRequest,
  type OutboundCallResponse,
  type OutboundCallMetadata,
  type LatencyMeasurement,
  type SessionLatencyStats,
  type TelephonyError,
  type TelephonyCallEvent,
  type GreetingConfig,
  type PhoneNumberValidation,
  type DTMFEvent,
} from './types.js';

// Latency Tracking
export {
  LatencyTracker,
  LatencyOperation,
  createLatencyTracker,
  measureLatency,
} from './latency-tracker.js';

// SIP Handling
export {
  SIPHandler,
  createSIPHandler,
} from './sip-handler.js';

// Inbound Call Handling
export {
  InboundCallHandler,
  createInboundCallHandler,
  type InboundCallContext,
} from './inbound-handler.js';

// Outbound Call Handling
export {
  OutboundCallHandler,
  createOutboundCallHandler,
} from './outbound-handler.js';

// Call Manager
export {
  CallManager,
  createCallManager,
  getCallManager,
  resetCallManager,
  type CallManagerEvents,
} from './call-manager.js';
