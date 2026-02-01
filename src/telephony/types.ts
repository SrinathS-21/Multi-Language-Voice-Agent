/**
 * Telephony Types - TypeScript interfaces for Twilio-LiveKit integration
 * 
 * Defines all type definitions for:
 * - SIP participant metadata
 * - Call direction and state
 * - Latency measurements
 * - Outbound call requests
 */

/**
 * Call direction - inbound (someone called us) or outbound (we called them)
 */
export enum CallDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

/**
 * SIP call state lifecycle
 */
export enum SIPCallState {
  RINGING = 'ringing',
  CONNECTED = 'connected',
  ON_HOLD = 'on_hold',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
  BUSY = 'busy',
  NO_ANSWER = 'no_answer',
}

/**
 * DTMF digit received from caller
 */
export interface DTMFEvent {
  digit: string;          // '0'-'9', '*', '#'
  timestamp: number;
  participantId: string;
}

/**
 * SIP participant information extracted from LiveKit participant attributes
 */
export interface SIPParticipantInfo {
  /** Whether this participant connected via SIP (phone call) */
  isSIP: boolean;
  
  /** Phone number of the caller (E.164 format: +15550100) */
  callerPhoneNumber?: string;
  
  /** Destination phone number (for outbound calls) */
  destinationPhoneNumber?: string;
  
  /** Call direction */
  callDirection?: CallDirection;
  
  /** Twilio Call SID (for tracking/debugging) */
  callSid?: string;
  
  /** SIP trunk ID used */
  trunkId?: string;
  
  /** SIP participant identity in LiveKit */
  sipParticipantId?: string;
  
  /** Raw SIP headers (for advanced use) */
  sipHeaders?: Record<string, string>;
  
  /** Timestamp when SIP participant connected */
  connectedAt?: number;
}

/**
 * Request to initiate an outbound call
 */
export interface OutboundCallRequest {
  /** Organization ID for multi-tenancy */
  organizationId: string;
  
  /** Agent ID to use for the call */
  agentId: string;
  
  /** Phone number to call (E.164 format) */
  phoneNumber: string;
  
  /** Optional: Custom room name (auto-generated if not provided) */
  roomName?: string;
  
  /** Optional: Maximum ring time before giving up (seconds) */
  ringTimeout?: number;
  
  /** Optional: Metadata to attach to the call session */
  metadata?: OutboundCallMetadata;
}

/**
 * Metadata for outbound calls (e.g., appointment reminders)
 */
export interface OutboundCallMetadata {
  /** Appointment ID if this is a reminder call */
  appointmentId?: string;
  
  /** Patient/customer name */
  customerName?: string;
  
  /** Reason for the call */
  callReason?: string;
  
  /** Campaign ID for tracking bulk calls */
  campaignId?: string;
  
  /** Custom data */
  customData?: Record<string, any>;
}

/**
 * Response after initiating an outbound call
 */
export interface OutboundCallResponse {
  success: boolean;
  
  /** Error message if success is false */
  error?: string;
  
  /** Unique call ID */
  callId: string;
  
  /** LiveKit room name */
  roomName: string;
  
  /** SIP participant ID in LiveKit */
  sipParticipantId: string;
  
  /** Current call state */
  state: SIPCallState;
  
  /** Timestamp when call was initiated */
  initiatedAt: number;
}

/**
 * Latency measurement for a single operation
 */
export interface LatencyMeasurement {
  /** Operation name (e.g., 'stt_first_token', 'llm_response') */
  operation: string;
  
  /** Start timestamp (high-resolution) */
  startTime: number;
  
  /** End timestamp (high-resolution) */
  endTime: number;
  
  /** Duration in milliseconds */
  durationMs: number;
  
  /** Whether this exceeded the target latency */
  exceededTarget: boolean;
  
  /** Target latency for this operation (ms) */
  targetMs: number;
}

/**
 * Aggregated latency statistics for a session
 */
export interface SessionLatencyStats {
  /** Session ID */
  sessionId: string;
  
  /** Call type (web, inbound, outbound) */
  callType: 'web' | 'inbound' | 'outbound';
  
  /** Whether this is a SIP call */
  isSIPCall: boolean;
  
  /** Individual measurements */
  measurements: LatencyMeasurement[];
  
  /** Summary statistics per operation */
  summary: {
    [operation: string]: {
      count: number;
      minMs: number;
      maxMs: number;
      avgMs: number;
      p50Ms: number;
      p95Ms: number;
      p99Ms: number;
      targetMs: number;
      exceededCount: number;
    };
  };
  
  /** End-to-end latency (user speech end → agent speech start) */
  e2eLatency: {
    minMs: number;
    maxMs: number;
    avgMs: number;
    measurements: number[];
  };
  
  /** Session start timestamp */
  startedAt: number;
  
  /** Last updated timestamp */
  updatedAt: number;
}

/**
 * Telephony error types
 */
export enum TelephonyErrorType {
  SIP_TRUNK_UNAVAILABLE = 'sip_trunk_unavailable',
  INVALID_PHONE_NUMBER = 'invalid_phone_number',
  CALL_REJECTED = 'call_rejected',
  CALL_TIMEOUT = 'call_timeout',
  NETWORK_ERROR = 'network_error',
  AUTHENTICATION_FAILED = 'authentication_failed',
  QUOTA_EXCEEDED = 'quota_exceeded',
  UNKNOWN = 'unknown',
}

/**
 * Telephony-specific error
 */
export interface TelephonyError {
  type: TelephonyErrorType;
  message: string;
  code?: string;
  retryable: boolean;
  details?: Record<string, any>;
}

/**
 * Call event for tracking
 */
export interface TelephonyCallEvent {
  eventType: 'call_started' | 'call_answered' | 'call_ended' | 'dtmf_received' | 'error';
  callId: string;
  timestamp: number;
  data?: Record<string, any>;
}

/**
 * Greeting configuration based on call type
 */
export interface GreetingConfig {
  /** Greeting for inbound phone calls */
  inboundPhone: string;
  
  /** Greeting for outbound phone calls */
  outboundPhone: string;
  
  /** Greeting for web/browser calls */
  web: string;
  
  /** Default greeting if type unknown */
  default: string;
}

/**
 * Phone number validation result
 */
export interface PhoneNumberValidation {
  isValid: boolean;
  e164Format?: string;
  countryCode?: string;
  nationalNumber?: string;
  error?: string;
}
