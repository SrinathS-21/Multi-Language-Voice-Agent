/**
 * Call Management Tools
 * 
 * Tools for managing call transfer and termination.
 * 
 * @module tool-handlers/call-tools
 */

import { llm } from '@livekit/agents';
import { logger } from '../../core/logging.js';
import type { ToolExecutionContext, ToolResult } from './types.js';

/**
 * Create an end call tool for graceful call termination
 * 
 * This tool allows the LLM to terminate the call after delivering farewell.
 * The shutdown callback triggers room disconnect after audio finishes playing.
 */
export function createEndCallTool(
    context: ToolExecutionContext
): llm.FunctionTool<{ reason?: string }, any, ToolResult> {
    return llm.tool({
        description: 'End the call gracefully after saying goodbye to the user. Use this ONLY after the user indicates they want to end the call (e.g., "thank you", "bye", "that\'s all", "goodbye") AND you have already said your farewell message.',
        parameters: {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    description: 'The reason for ending the call (e.g., "user_goodbye", "task_completed", "user_request")',
                },
            },
            required: [],
        } as any,
        execute: async (args, opts) => {
            logger.info('🔚 End call tool invoked', {
                reason: args.reason || 'user_goodbye',
                sessionId: context.sessionId,
            });

            // Log the end call event
            await context.callTracker.logFunctionCall(
                context.sessionId,
                context.organizationId,
                'end_call',
                { reason: args.reason },
                { status: 'ending' },
                { latencyMs: 0 }
            );

            // Get shutdown callback via deferred getter
            const shutdownCallback = context.getShutdownCallback?.();
            
            // Trigger shutdown after a delay to let farewell audio play
            if (shutdownCallback) {
                // Wait 3 seconds for farewell message to complete playing
                setTimeout(async () => {
                    logger.info('🔌 Executing call shutdown', { sessionId: context.sessionId });
                    try {
                        await shutdownCallback('user_goodbye');
                    } catch (error) {
                        logger.error('Error during call shutdown', { 
                            error: (error as Error).message,
                            sessionId: context.sessionId 
                        });
                    }
                }, 3000);
            } else {
                logger.warning('No shutdown callback available - call will not be terminated', {
                    sessionId: context.sessionId
                });
            }

            return {
                success: true,
                result: 'Call ending gracefully.',
            };
        },
    });
}

/**
 * Create a transfer call tool (placeholder for future implementation)
 */
export function createTransferCallTool(
    context: ToolExecutionContext
): llm.FunctionTool<{ department?: string; reason?: string }, any, ToolResult> {
    return llm.tool({
        description: 'Transfer the call to a human agent or specific department. Use this when the user requests to speak with a human or needs specialized assistance.',
        parameters: {
            type: 'object',
            properties: {
                department: {
                    type: 'string',
                    description: 'The department to transfer to (e.g., "sales", "support", "billing")',
                },
                reason: {
                    type: 'string',
                    description: 'The reason for the transfer',
                },
            },
            required: [],
        } as any,
        execute: async (args, opts) => {
            logger.info('Transfer call requested', {
                department: args.department,
                reason: args.reason,
                sessionId: context.sessionId,
            });

            // Log the transfer request
            await context.callTracker.logFunctionCall(
                context.sessionId,
                context.organizationId,
                'transfer_call',
                { department: args.department, reason: args.reason },
                { status: 'requested' },
                { latencyMs: 0 }
            );

            // Note: Call transfer implementation depends on telephony provider
            return {
                success: true,
                result: `I'll transfer you to ${args.department || 'a human agent'}. Please hold while I connect you.`,
            };
        },
    });
}
