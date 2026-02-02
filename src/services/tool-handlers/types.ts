/**
 * Tool Handler Types
 * 
 * Type definitions for tool handlers.
 * 
 * @module tool-handlers/types
 */

import type { VoiceKnowledgeService } from '../voice-knowledge/index.js';
import type { SessionService } from '../session.js';
import type { CallTrackingService } from '../call-tracking.js';

/**
 * Callback to shutdown/disconnect the call
 * This should disconnect the Twilio/SIP connection and close the agent session
 */
export type ShutdownCallbackFn = (reason: string) => Promise<void>;

/**
 * Tool execution context passed to handlers
 */
export interface ToolExecutionContext {
    organizationId: string;
    agentId: string;
    sessionId: string;
    knowledgeService: VoiceKnowledgeService;
    sessionService: SessionService;
    callTracker: CallTrackingService;
    farewell?: string;  // Farewell message from database
    /** 
     * Deferred shutdown callback getter
     * Returns the shutdown callback when called (allows setting after tool creation)
     */
    getShutdownCallback?: () => ShutdownCallbackFn | undefined;
}

/**
 * Result from tool execution
 */
export interface ToolResult {
    success: boolean;
    result?: any;
    error?: string;
    data?: any;
}
