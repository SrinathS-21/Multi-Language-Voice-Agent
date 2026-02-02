/**
 * Call Tracking Service - Conversation logging for voice sessions
 * 
 * Handles:
 * - User message logging (transcriptions)
 * - Agent response logging
 * - Function call tracking
 * - Conversation history retrieval
 * - Latency metrics
 */

import { getConvexClient, isConvexConfigured } from '../core/convex-client.js';
import { logger } from '../core/logging.js';
import {
    Interaction,
    InteractionType,
    Sentiment,
    ConversationHistory,
} from '../models/session.js';

/**
 * In-memory interaction buffer for fast access
 */
const interactionBuffer = new Map<string, Interaction[]>();

/**
 * Call Tracking Service class
 */
export class CallTrackingService {
    private convexConfigured: boolean;
    private maxBufferSize: number;

    constructor(maxBufferSize: number = 500) {
        this.convexConfigured = isConvexConfigured();
        this.maxBufferSize = maxBufferSize;

        if (!this.convexConfigured) {
            logger.warning('Convex not configured - interactions stored in memory only');
        }
    }

    /**
     * Log a user message (speech transcription)
     */
    /**
     * Log a user message (speech transcription)
     * NOTE: Buffered in memory only - saved to Convex at end of call via flushSessionToConvex()
     */
    async logUserMessage(
        sessionId: string,
        organizationId: string,
        userInput: string,
        options?: {
            agentId?: string;
            latencyMs?: number;
        }
    ): Promise<void> {
        const interaction: Interaction = {
            id: `${sessionId}-${Date.now()}-user`,
            type: InteractionType.USER_MESSAGE,
            content: userInput,
            timestamp: Date.now(), // Epoch ms for Convex v.number()
            sessionId,
            organizationId,
            agentId: options?.agentId,
            interactionType: InteractionType.USER_MESSAGE,
            userInput,
            latencyMs: options?.latencyMs,
        };

        this.addToBuffer(sessionId, interaction);
        logger.debug('User message buffered', { sessionId, inputLength: userInput.length });
    }

    /**
     * Log an agent response
     * NOTE: Buffered in memory only - saved to Convex at end of call via flushSessionToConvex()
     */
    async logAgentResponse(
        sessionId: string,
        organizationId: string,
        agentResponse: string,
        options?: {
            agentId?: string;
            latencyMs?: number;
        }
    ): Promise<void> {
        const interaction: Interaction = {
            id: `${sessionId}-${Date.now()}-agent`,
            type: InteractionType.AGENT_RESPONSE,
            content: agentResponse,
            timestamp: Date.now(), // Epoch ms for Convex v.number()
            sessionId,
            organizationId,
            agentId: options?.agentId,
            interactionType: InteractionType.AGENT_RESPONSE,
            agentResponse,
            latencyMs: options?.latencyMs,
        };

        this.addToBuffer(sessionId, interaction);
        logger.debug('Agent response buffered', { sessionId, responseLength: agentResponse.length });
    }

    /**
     * Log a function call (tool use)
     * NOTE: Buffered in memory only - saved to Convex at end of call via flushSessionToConvex()
     */
    async logFunctionCall(
        sessionId: string,
        organizationId: string,
        functionName: string,
        functionParams: Record<string, any>,
        functionResult: Record<string, any>,
        options?: {
            agentId?: string;
            latencyMs?: number;
        }
    ): Promise<void> {
        const interaction: Interaction = {
            id: `${sessionId}-${Date.now()}-func`,
            type: InteractionType.FUNCTION_CALL,
            content: `${functionName}(${JSON.stringify(functionParams).substring(0, 100)})`,
            timestamp: Date.now(), // Epoch ms for Convex v.number()
            sessionId,
            organizationId,
            agentId: options?.agentId,
            interactionType: InteractionType.FUNCTION_CALL,
            functionName,
            functionParams,
            functionResult,
            latencyMs: options?.latencyMs,
        };

        this.addToBuffer(sessionId, interaction);
        logger.debug('Function call buffered', { sessionId, functionName });
    }

    /**
     * Flush all buffered interactions to Convex at end of call
     * This is called once when the session ends, replacing per-turn saves
     */
    async flushSessionToConvex(sessionId: string): Promise<{ success: boolean; count: number }> {
        const interactions = this.getFromBuffer(sessionId);
        
        if (interactions.length === 0) {
            logger.debug('No interactions to flush', { sessionId });
            return { success: true, count: 0 };
        }

        if (!this.convexConfigured) {
            logger.warning('Convex not configured - interactions not persisted', { sessionId, count: interactions.length });
            this.clearBuffer(sessionId);
            return { success: false, count: interactions.length };
        }

        try {
            const convex = getConvexClient();
            
            // 1. Save individual interactions to callInteractions table
            const interactionsForDb = interactions.map(i => ({
                sessionId: i.sessionId,
                organizationId: i.organizationId,
                agentId: i.agentId,
                interactionType: i.interactionType, // Already in correct format: 'user_message', 'agent_response', 'function_call'
                timestamp: i.timestamp,
                userInput: i.userInput,
                agentResponse: i.agentResponse,
                functionName: i.functionName,
                functionParams: i.functionParams ? JSON.stringify(i.functionParams) : undefined,
                functionResult: i.functionResult ? JSON.stringify(i.functionResult) : undefined,
                latencyMs: i.latencyMs,
            }));

            logger.info('Attempting to save interactions to callInteractions table', {
                sessionId,
                count: interactionsForDb.length,
                sampleInteraction: interactionsForDb[0],
            });

            const result = await convex.mutation('callInteractions:logInteractionsBatch', {
                interactions: interactionsForDb,
            });

            logger.info('✅ Individual interactions saved to callInteractions table', {
                sessionId,
                count: result.count,
                ids: result.ids.slice(0, 3), // Show first 3 IDs
            });
            
            // 2. Build unified transcript for callSessions
            const transcript = interactions.map(i => {
                const entry: any = {
                    timestamp: i.timestamp,
                    speaker: i.interactionType === InteractionType.USER_MESSAGE ? 'user' : 
                            i.interactionType === InteractionType.AGENT_RESPONSE ? 'agent' : 'system',
                    text: i.userInput || i.agentResponse || `Function: ${i.functionName}`,
                };

                // Add type for function calls
                if (i.interactionType === InteractionType.FUNCTION_CALL) {
                    entry.type = 'function_call';
                    entry.metadata = {
                        functionName: i.functionName,
                        latencyMs: i.latencyMs,
                    };
                } else {
                    entry.type = 'speech';
                    if (i.latencyMs) {
                        entry.metadata = { latencyMs: i.latencyMs };
                    }
                }

                return entry;
            });

// 3. Save unified transcript to callSessions (if session exists)
            try {
                await convex.mutation('callSessions:updateTranscript', {
                    sessionId,
                    transcript,
                });

                logger.info('✅ Unified transcript saved to callSessions', {
                    sessionId,
                    transcriptLength: transcript.length,
                    userMessages: interactions.filter(i => i.interactionType === InteractionType.USER_MESSAGE).length,
                    agentResponses: interactions.filter(i => i.interactionType === InteractionType.AGENT_RESPONSE).length,
                    functionCalls: interactions.filter(i => i.interactionType === InteractionType.FUNCTION_CALL).length,
                });
            } catch (transcriptError) {
                // Session might not exist (e.g., test scenario) - log but don't fail
                logger.warning('Could not save transcript to callSessions (session may not exist)', {
                    sessionId,
                    error: (transcriptError as Error).message,
                });
            }

            this.clearBuffer(sessionId);
            return { success: true, count: interactions.length };
        } catch (error) {
            logger.error('❌ Failed to flush interactions to Convex', {
                sessionId,
                count: interactions.length,
                error: (error as Error).message,
                stack: (error as Error).stack,
            });
            // Keep buffer in case of retry - don't clear
            return { success: false, count: interactions.length };
        }
    }

    /**
     * Get conversation history for a session
     * First checks in-memory buffer (for active calls), then Convex (for completed calls)
     */
    async getConversationHistory(
        sessionId: string,
        limit?: number
    ): Promise<ConversationHistory> {
        let interactions: Interaction[] = [];

        // First, check in-memory buffer (for active/current calls)
        const bufferInteractions = this.getFromBuffer(sessionId, limit);
        
        if (bufferInteractions.length > 0) {
            // Use buffer data - this is an active call
            interactions = bufferInteractions;
            logger.debug('Using buffer for conversation history', {
                sessionId,
                count: interactions.length,
            });
        } else if (this.convexConfigured) {
            // Buffer empty, try Convex (for completed calls)
            try {
                const convex = getConvexClient();
                const result = (limit
                    ? await convex.query('callInteractions:getRecentBySessionId', {
                          sessionId,
                          limit,
                      })
                    : await convex.query('callInteractions:getBySessionId', { sessionId })) as any[];

                interactions = result.map((r: any) => ({
                    id: r._id?.toString() || `${r.sessionId}-${r.timestamp}`,
                    type: r.interactionType as InteractionType,
                    content: r.userInput || r.agentResponse || r.functionName || '',
                    timestamp: typeof r.timestamp === 'number' ? r.timestamp : new Date(r.timestamp).getTime(), // Epoch ms
                    sessionId: r.sessionId,
                    organizationId: r.organizationId,
                    agentId: r.agentId,
                    interactionType: r.interactionType as InteractionType,
                    userInput: r.userInput,
                    agentResponse: r.agentResponse,
                    functionName: r.functionName,
                    functionParams: r.functionParams ? JSON.parse(r.functionParams) : undefined,
                    functionResult: r.functionResult ? JSON.parse(r.functionResult) : undefined,
                    sentiment: r.sentiment as Sentiment | undefined,
                    latencyMs: r.latencyMs,
                }));
                
                logger.debug('Using Convex for conversation history', {
                    sessionId,
                    count: interactions.length,
                });
            } catch (error) {
                logger.error('Failed to fetch conversation history from Convex', {
                    sessionId,
                    error: (error as Error).message,
                });
            }
        }

        // Calculate stats
        const userMessages = interactions.filter(
            (i) => i.interactionType === InteractionType.USER_MESSAGE
        ).length;
        const agentResponses = interactions.filter(
            (i) => i.interactionType === InteractionType.AGENT_RESPONSE
        ).length;
        const functionCalls = interactions.filter(
            (i) => i.interactionType === InteractionType.FUNCTION_CALL
        ).length;

        return {
            sessionId,
            interactions,
            totalInteractions: interactions.length,
            userMessages,
            agentResponses,
            functionCalls,
        };
    }

    /**
     * Get recent messages formatted for LLM context
     */
    async getRecentMessagesForContext(
        sessionId: string,
        maxMessages: number = 10
    ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
        const history = await this.getConversationHistory(sessionId, maxMessages);

        const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

        for (const interaction of history.interactions) {
            if (interaction.interactionType === InteractionType.USER_MESSAGE && interaction.userInput) {
                messages.push({
                    role: 'user',
                    content: interaction.userInput,
                });
            } else if (
                interaction.interactionType === InteractionType.AGENT_RESPONSE &&
                interaction.agentResponse
            ) {
                messages.push({
                    role: 'assistant',
                    content: interaction.agentResponse,
                });
            }
        }

        return messages;
    }

    /**
     * Get interaction statistics for a session
     */
    async getSessionStats(sessionId: string): Promise<{
        total: number;
        userMessages: number;
        agentResponses: number;
        functionCalls: number;
        averageLatencyMs?: number;
    }> {
        if (this.convexConfigured) {
            try {
                const convex = getConvexClient();
                return await convex.query('callInteractions:countBySessionId', { sessionId });
            } catch (error) {
                logger.error('Failed to get session stats from Convex', {
                    sessionId,
                    error: (error as Error).message,
                });
            }
        }

        // Calculate from buffer
        const interactions = this.getFromBuffer(sessionId);
        const latencies = interactions
            .filter((i) => i.latencyMs !== undefined)
            .map((i) => i.latencyMs!);

        return {
            total: interactions.length,
            userMessages: interactions.filter((i) => i.interactionType === InteractionType.USER_MESSAGE)
                .length,
            agentResponses: interactions.filter(
                (i) => i.interactionType === InteractionType.AGENT_RESPONSE
            ).length,
            functionCalls: interactions.filter((i) => i.interactionType === InteractionType.FUNCTION_CALL)
                .length,
            averageLatencyMs:
                latencies.length > 0
                    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
                    : undefined,
        };
    }

    /**
     * Add interaction to buffer
     */
    private addToBuffer(sessionId: string, interaction: Interaction): void {
        if (!interactionBuffer.has(sessionId)) {
            interactionBuffer.set(sessionId, []);
        }

        const buffer = interactionBuffer.get(sessionId)!;
        buffer.push(interaction);

        // Trim if over max size
        if (buffer.length > this.maxBufferSize) {
            buffer.shift();
        }
    }

    /**
     * Get interactions from buffer
     */
    private getFromBuffer(sessionId: string, limit?: number): Interaction[] {
        const buffer = interactionBuffer.get(sessionId) || [];
        if (limit && limit < buffer.length) {
            return buffer.slice(-limit);
        }
        return [...buffer];
    }

    /**
     * Clear buffer for a session
     */
    clearBuffer(sessionId: string): void {
        interactionBuffer.delete(sessionId);
    }
}

// ============================================
// Singleton Instance
// ============================================

let callTrackingInstance: CallTrackingService | null = null;

/**
 * Get the call tracking service singleton
 */
export function getCallTrackingService(): CallTrackingService {
    if (!callTrackingInstance) {
        callTrackingInstance = new CallTrackingService();
    }
    return callTrackingInstance;
}
