/**
 * Agent Type Definitions
 * @module agent/types
 */

import type { SessionService } from '../services/session.js';
import type { CallTrackingService } from '../services/call-tracking.js';
import type { VoiceKnowledgeService } from '../services/voice-knowledge.js';
import type { GeneratedFunction } from '../services/function-generator.js';
import type { TurnMetricsCollector } from '../core/call-analytics.js';
import type { LatencyTracker } from '../telephony/index.js';

/**
 * Agent context - runtime state passed through the voice session
 */
export interface AgentContext {
  organizationId: string;
  agentId: string;
  agentName: string;
  greeting: string;
  farewell?: string;
  sessionId: string;
  sessionService: SessionService;
  callTracker: CallTrackingService;
  knowledgeService: VoiceKnowledgeService;
  functions: GeneratedFunction[];
  metricsCollector: TurnMetricsCollector;
  latencyTracker?: LatencyTracker;
  isTelephony?: boolean;
  callerPhoneNumber?: string;
  callDirection?: 'inbound' | 'outbound';
}

/**
 * Parsed room context extracted from LiveKit room name
 */
export interface RoomContext {
  organizationId: string;
  agentId: string;
  isSIPRoom: boolean;
}
