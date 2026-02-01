/**
 * Dynamic Tools
 * 
 * Tools created from generated function configurations.
 * Supports vector search, webhook, and static response handlers.
 * 
 * @module tool-handlers/dynamic-tools
 */

import { llm } from '@livekit/agents';
import { logger } from '../../core/logging.js';
import type { GeneratedFunction } from '../function-generator.js';
import type { ToolExecutionContext, ToolResult } from './types.js';

/**
 * Create a vector search tool from generated function
 * Returns raw text from RAG for LLM to process with full context
 */
export function createVectorSearchTool(
    func: GeneratedFunction,
    context: ToolExecutionContext
): llm.FunctionTool<any, any, ToolResult> {
    return llm.tool({
        description: func.description,
        parameters: {
            type: 'object',
            properties: func.parameters.properties,
            required: func.parameters.required,
        } as any,
        execute: async (args, opts) => {
            const startTime = Date.now();
            logger.info(`Executing vector search: ${func.name}`, {
                args,
                sessionId: context.sessionId,
            });

            try {
                // Extract query from args (usually first string parameter)
                const queryArg = Object.entries(args).find(
                    ([_, val]) => typeof val === 'string'
                );
                const query = queryArg ? queryArg[1] as string : JSON.stringify(args);

                // Use searchWithContext to get raw text for better LLM comprehension
                // Reduced from 3 to 2 chunks for faster RAG response
                const { response, context: rawText } = await context.knowledgeService.searchWithContext(query, 3);
                const latencyMs = Date.now() - startTime;

                // Log what we got from RAG
                logger.info(`RAG search response for ${func.name}`, {
                    found: response.found,
                    count: response.count,
                    hasRawText: !!rawText,
                    rawTextLength: rawText?.length || 0,
                    rawTextPreview: rawText?.slice(0, 200),
                });

                await context.callTracker.logFunctionCall(
                    context.sessionId,
                    context.organizationId,
                    func.name,
                    args,
                    response,
                    { latencyMs }
                );

                // Check if we have meaningful RAG context
                if (!rawText || rawText.trim() === '') {
                    logger.warning(`Vector search returned no context for ${func.name}`, {
                        query,
                        responseFound: response.found,
                        itemCount: response.count,
                    });
                    return {
                        success: true,
                        result: 'I couldn\'t find specific information about that. Please try rephrasing your question.',
                    };
                }

                // Return raw text from RAG - LLM will extract relevant sections
                logger.info(`Vector search result for ${func.name}`, {
                    query,
                    textLength: rawText.length,
                    textPreview: rawText.slice(0, 200) + '...',
                });

                return {
                    success: true,
                    result: rawText,
                };
            } catch (error) {
                return {
                    success: false,
                    error: `Failed to execute ${func.name}: ${(error as Error).message}`,
                };
            }
        },
    });
}

/**
 * Create a webhook tool from generated function
 */
export function createWebhookTool(
    func: GeneratedFunction,
    context: ToolExecutionContext
): llm.FunctionTool<any, any, ToolResult> {
    return llm.tool({
        description: func.description,
        parameters: {
            type: 'object',
            properties: func.parameters.properties,
            required: func.parameters.required,
        } as any,
        execute: async (args, opts) => {
            const startTime = Date.now();
            const webhookUrl = func.handlerConfig?.webhookUrl;

            if (!webhookUrl) {
                return {
                    success: false,
                    error: 'Webhook URL not configured.',
                };
            }

            logger.info(`Executing webhook: ${func.name}`, {
                url: webhookUrl,
                sessionId: context.sessionId,
            });

            try {
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...func.handlerConfig?.headers,
                    },
                    body: JSON.stringify({
                        ...args,
                        sessionId: context.sessionId,
                        organizationId: context.organizationId,
                        agentId: context.agentId,
                    }),
                });

                const result = await response.json();
                const latencyMs = Date.now() - startTime;

                await context.callTracker.logFunctionCall(
                    context.sessionId,
                    context.organizationId,
                    func.name,
                    args,
                    result,
                    { latencyMs }
                );

                return {
                    success: response.ok,
                    result: result.message || result.data || result,
                };
            } catch (error) {
                return {
                    success: false,
                    error: `Webhook call failed: ${(error as Error).message}`,
                };
            }
        },
    });
}

/**
 * Create a static response tool from generated function
 */
export function createStaticTool(
    func: GeneratedFunction,
    context: ToolExecutionContext
): llm.FunctionTool<any, any, ToolResult> {
    return llm.tool({
        description: func.description,
        parameters: {
            type: 'object',
            properties: func.parameters.properties,
            required: func.parameters.required,
        } as any,
        execute: async (args, opts) => {
            logger.info(`Executing static tool: ${func.name}`, {
                sessionId: context.sessionId,
            });

            const staticResponse = func.handlerConfig?.response || func.handlerConfig?.message;

            await context.callTracker.logFunctionCall(
                context.sessionId,
                context.organizationId,
                func.name,
                args,
                { response: staticResponse },
                { latencyMs: 0 }
            );

            return {
                success: true,
                result: staticResponse || 'Action completed.',
            };
        },
    });
}
