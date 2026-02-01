/**
 * Telephony Configuration - Twilio and SIP settings
 * 
 * Centralized configuration for:
 * - Twilio credentials
 * - SIP trunk settings
 * - Phone number management
 * - Latency targets
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import { logger } from '../core/logging.js';

dotenv.config();

/**
 * Twilio configuration schema
 */
const twilioConfigSchema = z.object({
  accountSid: z.string().optional(),
  authToken: z.string().optional(),
  phoneNumber: z.string().optional(),
});

/**
 * LiveKit SIP configuration schema
 */
const sipConfigSchema = z.object({
  inboundTrunkId: z.string().optional(),
  outboundTrunkId: z.string().optional(),
  dispatchRuleId: z.string().optional(),
});

/**
 * Latency target configuration (in milliseconds)
 * These are the target latencies we aim to achieve
 */
const latencyTargetsSchema = z.object({
  // SIP connection: Trunk → Room join
  sipConnect: z.number().default(500),
  
  // STT: Audio → First transcription token
  sttFirstToken: z.number().default(300),
  
  // STT: Full transcription complete
  sttComplete: z.number().default(800),
  
  // LLM: Query → First response token
  llmFirstToken: z.number().default(500),
  
  // LLM: Full response generation
  llmComplete: z.number().default(2000),
  
  // TTS: Text → First audio chunk
  ttsFirstChunk: z.number().default(200),
  
  // TTS: Full audio generation
  ttsComplete: z.number().default(1000),
  
  // End-to-end: User stops speaking → Agent starts speaking
  e2eResponse: z.number().default(1500),
  
  // Total call setup time
  callSetup: z.number().default(3000),
});

/**
 * Full telephony configuration schema
 */
const telephonyConfigSchema = z.object({
  twilio: twilioConfigSchema,
  sip: sipConfigSchema,
  latencyTargets: latencyTargetsSchema,
  
  // Feature flags
  enabled: z.boolean().default(false),
  allowOutbound: z.boolean().default(false),
  
  // Defaults
  defaultRingTimeout: z.number().default(30),
  maxConcurrentCalls: z.number().default(50),
  
  // Room naming
  sipRoomPrefix: z.string().default('call-'),
});

/**
 * Parse and validate telephony configuration
 */
function loadTelephonyConfig() {
  try {
    const rawConfig = {
      twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER,
      },
      sip: {
        inboundTrunkId: process.env.LIVEKIT_SIP_INBOUND_TRUNK_ID,
        outboundTrunkId: process.env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID,
        dispatchRuleId: process.env.LIVEKIT_SIP_DISPATCH_RULE_ID,
      },
      latencyTargets: {
        sipConnect: parseInt(process.env.LATENCY_SIP_CONNECT || '500', 10),
        sttFirstToken: parseInt(process.env.LATENCY_STT_FIRST_TOKEN || '300', 10),
        sttComplete: parseInt(process.env.LATENCY_STT_COMPLETE || '800', 10),
        llmFirstToken: parseInt(process.env.LATENCY_LLM_FIRST_TOKEN || '500', 10),
        llmComplete: parseInt(process.env.LATENCY_LLM_COMPLETE || '2000', 10),
        ttsFirstChunk: parseInt(process.env.LATENCY_TTS_FIRST_CHUNK || '200', 10),
        ttsComplete: parseInt(process.env.LATENCY_TTS_COMPLETE || '1000', 10),
        e2eResponse: parseInt(process.env.LATENCY_E2E_RESPONSE || '1500', 10),
        callSetup: parseInt(process.env.LATENCY_CALL_SETUP || '3000', 10),
      },
      enabled: process.env.TELEPHONY_ENABLED === 'true',
      allowOutbound: process.env.TELEPHONY_ALLOW_OUTBOUND === 'true',
      defaultRingTimeout: parseInt(process.env.TELEPHONY_RING_TIMEOUT || '30', 10),
      maxConcurrentCalls: parseInt(process.env.TELEPHONY_MAX_CONCURRENT || '50', 10),
      sipRoomPrefix: process.env.SIP_ROOM_PREFIX || 'call-',
    };

    return telephonyConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warning('Telephony configuration validation failed', {
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      });
    }
    // Return defaults if validation fails
    return telephonyConfigSchema.parse({
      twilio: {},
      sip: {},
      latencyTargets: {},
    });
  }
}

/**
 * Validated telephony configuration
 */
export const telephonyConfig = loadTelephonyConfig();

/**
 * Check if telephony is properly configured
 */
export function isTelephonyConfigured(): boolean {
  const hasTwilio = !!(
    telephonyConfig.twilio.accountSid &&
    telephonyConfig.twilio.authToken
  );
  
  const hasSIP = !!(
    telephonyConfig.sip.inboundTrunkId ||
    telephonyConfig.sip.outboundTrunkId
  );
  
  return telephonyConfig.enabled && (hasTwilio || hasSIP);
}

/**
 * Check if outbound calling is available
 */
export function isOutboundEnabled(): boolean {
  return (
    telephonyConfig.enabled &&
    telephonyConfig.allowOutbound &&
    !!telephonyConfig.sip.outboundTrunkId
  );
}

/**
 * Get latency target for a specific operation
 */
export function getLatencyTarget(operation: keyof typeof telephonyConfig.latencyTargets): number {
  return telephonyConfig.latencyTargets[operation];
}

/**
 * Validate phone number format (basic E.164 check)
 */
export function validatePhoneNumber(phoneNumber: string): {
  isValid: boolean;
  e164?: string;
  error?: string;
} {
  // Remove all non-digit characters except leading +
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // Must start with + and have 10-15 digits
  const e164Regex = /^\+[1-9]\d{9,14}$/;
  
  if (e164Regex.test(cleaned)) {
    return { isValid: true, e164: cleaned };
  }
  
  // Try adding + if it's missing
  if (/^[1-9]\d{9,14}$/.test(cleaned)) {
    return { isValid: true, e164: '+' + cleaned };
  }
  
  return {
    isValid: false,
    error: 'Invalid phone number format. Expected E.164 format (e.g., +15550100)',
  };
}

/**
 * Generate room name for SIP call
 */
export function generateSIPRoomName(organizationId: string, agentId: string): string {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  return `${telephonyConfig.sipRoomPrefix}${organizationId}_${agentId}_${uniqueId}`;
}

/**
 * Parse SIP room name to extract organization and agent IDs
 */
export function parseSIPRoomName(roomName: string): {
  organizationId: string;
  agentId: string;
  uniqueId: string;
} | null {
  const prefix = telephonyConfig.sipRoomPrefix;
  
  if (!roomName.startsWith(prefix)) {
    return null;
  }
  
  const withoutPrefix = roomName.substring(prefix.length);
  const parts = withoutPrefix.split('_');
  
  if (parts.length >= 3) {
    return {
      organizationId: parts[0],
      agentId: parts[1],
      uniqueId: parts.slice(2).join('_'),
    };
  }
  
  return null;
}

/**
 * Type exports
 */
export type TwilioConfig = z.infer<typeof twilioConfigSchema>;
export type SIPConfig = z.infer<typeof sipConfigSchema>;
export type LatencyTargets = z.infer<typeof latencyTargetsSchema>;
export type TelephonyConfig = z.infer<typeof telephonyConfigSchema>;
