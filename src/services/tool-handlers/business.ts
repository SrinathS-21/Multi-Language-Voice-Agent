/**
 * Business Info Tools
 * 
 * Tools for retrieving structured business information.
 * 
 * @module tool-handlers/business-tools
 */

import { llm } from '@livekit/agents';
import { logger } from '../../core/logging.js';
import type { ToolExecutionContext, ToolResult } from './types.js';

/**
 * Create a business info tool for structured data (hours, location, contact)
 */
export function createBusinessInfoTool(
    context: ToolExecutionContext
): llm.FunctionTool<{ info_type: string }, any, ToolResult> {
    return llm.tool({
        description: 'Get business information like hours, location, contact details, policies, or features. Optimized for frequently asked questions.',
        parameters: {
            type: 'object',
            properties: {
                info_type: {
                    type: 'string',
                    enum: ['hours', 'location', 'contact', 'policies', 'features', 'general'],
                    description: 'Type of business information to retrieve',
                },
            },
            required: ['info_type'],
        } as any,
        execute: async (args, opts) => {
            const startTime = Date.now();
            logger.info('Executing business info tool', {
                infoType: args.info_type,
                sessionId: context.sessionId,
            });

            try {
                const result = await context.knowledgeService.getBusinessInfo(
                    args.info_type as any
                );

                const latencyMs = Date.now() - startTime;

                await context.callTracker.logFunctionCall(
                    context.sessionId,
                    context.organizationId,
                    'get_business_info',
                    { info_type: args.info_type },
                    result,
                    { latencyMs }
                );

                if (!result.found) {
                    return {
                        success: true,
                        result: result.message || "I don't have that specific information available.",
                    };
                }

                return {
                    success: true,
                    result: result.message || 'Information retrieved',
                    data: result.data,
                };
            } catch (error) {
                logger.error('Business info tool error', {
                    error: (error as Error).message,
                    sessionId: context.sessionId,
                });
                return {
                    success: false,
                    error: 'Failed to retrieve business information',
                };
            }
        },
    });
}
