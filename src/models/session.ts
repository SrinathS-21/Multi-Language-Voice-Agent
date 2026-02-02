/**
 * Session and call tracking models
 */

export enum CallType {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  WEB = 'web',
}

export enum SessionStatus {
  INITIATED = 'initiated',
  ACTIVE = 'active',
  CONNECTED = 'connected',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

export enum InteractionType {
  USER_MESSAGE = 'user_message',
  AGENT_RESPONSE = 'agent_response',
  SYSTEM_EVENT = 'system_event',
  TOOL_CALL = 'tool_call',
  FUNCTION_CALL = 'function_call',
}

export enum Sentiment {
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
}

export interface SessionConfig {
  ttlSeconds?: number;
  enableRecording?: boolean;
  language?: string;
  metadata?: Record<string, any>;
}

export interface SessionMetadata {
  agentId?: string;
  phoneNumber?: string;
  sipCallId?: string;
  language?: string;
  domain?: string;
  [key: string]: any;
}

export interface CreateSessionInput {
  callType: CallType;
  agentId: string;
  organizationId?: string;
  roomName?: string;
  participantIdentity?: string;
  callerPhoneNumber?: string;
  destinationPhoneNumber?: string;
  callSid?: string;
  sipParticipantId?: string;
  callDirection?: string;
  isTelephony?: boolean;
  config?: SessionConfig;
  metadata?: SessionMetadata;
}

export interface Interaction {
  id: string;
  type: InteractionType;
  content: string;
  timestamp: number; // Epoch ms for Convex compatibility
  sessionId?: string;
  organizationId?: string;
  agentId?: string;
  interactionType?: InteractionType;
  userInput?: string;
  agentResponse?: string;
  functionName?: string;
  functionParams?: any;
  functionResult?: any;
  latencyMs?: number;
  sentiment?: Sentiment;
  metadata?: Record<string, any>;
}

export interface ConversationHistory {
  sessionId: string;
  interactions: Interaction[];
  totalInteractions?: number;
  userMessages?: number;
  agentResponses?: number;
  functionCalls?: number;
  summary?: string;
}

export interface Session {
  sessionId: string;
  callType: CallType;
  status: SessionStatus;
  agentId: string;
  organizationId?: string;
  roomName?: string;
  participantIdentity?: string;
  phoneNumber?: string;
  sipCallId?: string;
  callerPhoneNumber?: string;
  destinationPhoneNumber?: string;
  callSid?: string;
  sipParticipantId?: string;
  callDirection?: string;
  isTelephony?: boolean;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  createdAt?: number;
  updatedAt?: number;
  startedAt?: Date;
  endedAt?: number;
  durationSeconds?: number;
  metadata?: SessionMetadata;
  config?: SessionConfig;
}

export interface CallSession extends Session {}

export interface SessionMetrics {
  totalCalls: number;
  activeCalls: number;
  completedCalls: number;
  failedCalls: number;
  averageDuration: number;
}

/**
 * Check if a session has expired based on TTL
 */
export function isSessionExpired(session: Session, ttlSeconds?: number): boolean {
  const ttl = ttlSeconds || session.config?.ttlSeconds;
  if (!ttl || !session.startTime) {
    return false;
  }
  const now = new Date();
  const elapsedSeconds = (now.getTime() - session.startTime.getTime()) / 1000;
  return elapsedSeconds > ttl;
}

/**
 * Calculate session duration in seconds
 */
export function calculateDuration(session: Session): number {
  if (!session.startTime) {
    return 0;
  }
  const endTime = session.endTime || new Date();
  return Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
}
