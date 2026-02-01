/**
 * Room Utilities
 * 
 * Helper functions for room context extraction and participant processing.
 * @module agent/room-utils
 */

import { logger } from '../core/logging.js';
import { createInboundCallHandler, LatencyTracker } from '../telephony/index.js';
import type { RoomContext, AgentContext } from './types.js';

/**
 * Extract organization and agent IDs from LiveKit room name
 *
 * Room name formats:
 * - Standard: {organizationId}_{agentId}_{uniqueId}
 * - SIP: call-{organizationId}_{agentId}_{uniqueId}
 * - Playground: Uses environment variable fallbacks
 */
export function extractRoomContext(roomName: string): RoomContext {
  const isSIPRoom = roomName.startsWith('call-') || roomName.includes('sip');
  let parts = roomName.split('_');

  if (roomName.startsWith('call-')) {
    parts = roomName.substring(5).split('_');
  }

  return {
    organizationId: parts[0] && parts.length >= 3
      ? parts[0]
      : process.env.ORGANIZATION_ID || process.env.DEFAULT_ORGANIZATION_ID || 'default-org',
    agentId: parts[1] && parts.length >= 3
      ? parts[1]
      : process.env.AGENT_ID || process.env.DEFAULT_AGENT_ID || 'default-agent',
    isSIPRoom,
  };
}

/**
 * Process participant and detect telephony context
 */
export function processParticipantContext(
  participant: any,
  greeting: string,
  latencyTracker: LatencyTracker,
  agentContext: AgentContext
): void {
  const handler = createInboundCallHandler(latencyTracker, {
    customGreetings: { inboundPhone: greeting, outboundPhone: greeting, web: greeting },
  });

  const callContext = handler.processParticipant({
    identity: participant.identity,
    name: participant.name,
    kind: (participant as any).kind,
    attributes: (participant as any).attributes,
    metadata: participant.metadata,
  }, greeting);

  if (callContext.isSIPCall) {
    agentContext.isTelephony = true;
    agentContext.callerPhoneNumber = callContext.sessionMetadata.callerPhoneNumber;
    agentContext.callDirection = callContext.sessionMetadata.callDirection as 'inbound' | 'outbound' | undefined;
    agentContext.greeting = callContext.greeting;
    logger.info('SIP participant detected', {
      identity: participant.identity,
      callerPhone: callContext.sessionMetadata.callerPhoneNumber,
    });
  }
}

/**
 * Inject current date/time into system prompt
 */
export function injectDateTimeIntoPrompt(prompt: string): string {
  const now = new Date();
  
  const dateTimeInfo = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 CURRENT DATE & TIME (Use this for all date/time queries)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date: ${now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Time: ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
Day: ${now.toLocaleDateString('en-IN', { weekday: 'long' })}
ISO: ${now.toISOString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**IMPORTANT**: When user asks "what day is today" or "is today Monday", refer to the date above.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

  return dateTimeInfo + prompt;
}
