/**
 * Search Tools
 * 
 * Knowledge search and hybrid search tools for voice agents.
 * 
 * @module tool-handlers/search-tools
 */

import { llm } from '@livekit/agents';
import { logger } from '../../core/logging.js';
import type { ToolExecutionContext, ToolResult } from './types.js';

/**
 * Create a knowledge search tool for RAG-powered responses
 */
export function createKnowledgeSearchTool(
    context: ToolExecutionContext
): llm.FunctionTool<{ query: string; limit?: number }, any, ToolResult> {
    return llm.tool({
        description: 'Search the knowledge base for information relevant to the user\'s question. Use this when the user asks about products, services, menu items, prices, availability, or any business-specific information.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query based on the user\'s question',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of results to return (default: 5)',
                },
            },
            required: ['query'],
        } as any,
        execute: async (args, opts) => {
            const startTime = Date.now();
            logger.info('Executing knowledge search tool', {
                query: args.query,
                limit: args.limit,
                sessionId: context.sessionId,
            });

            try {
                const response = await context.knowledgeService.search(
                    args.query,
                    args.limit || 5
                );

                const latencyMs = Date.now() - startTime;

                // Log tool call
                await context.callTracker.logFunctionCall(
                    context.sessionId,
                    context.organizationId,
                    'knowledge_search',
                    { query: args.query, limit: args.limit },
                    response,
                    { latencyMs }
                );

                if (!response.found) {
                    return {
                        success: true,
                        result: response.message || 'No results found for your query.',
                    };
                }

                // Format results for LLM
                const formattedResults = response.items?.map((item, idx) => {
                    let text = `${idx + 1}. ${item.name}`;
                    if (item.price > 0) {
                        text += ` - ₹${item.price}`;
                    }
                    if (item.description) {
                        text += `\n   ${item.description}`;
                    }
                    return text;
                }).join('\n');

                return {
                    success: true,
                    result: `Found ${response.count} results:\n${formattedResults}`,
                };
            } catch (error) {
                logger.error('Knowledge search tool error', {
                    error: (error as Error).message,
                    sessionId: context.sessionId,
                });
                return {
                    success: false,
                    error: 'Failed to search knowledge base. Please try again.',
                };
            }
        },
    });
}

/**
 * Create a general search tool for broader queries
 */
export function createGeneralSearchTool(
    context: ToolExecutionContext
): llm.FunctionTool<{ query: string; category?: string }, any, ToolResult> {
    return llm.tool({
        description: 'Search for general information in the knowledge base. Use this for FAQs, policies, hours, locations, or other general business information.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The search query',
                },
                category: {
                    type: 'string',
                    description: 'Optional category to filter results (e.g., "faq", "policy", "hours")',
                },
            },
            required: ['query'],
        } as any,
        execute: async (args, opts) => {
            const startTime = Date.now();
            logger.info('Executing general search tool', {
                query: args.query,
                category: args.category,
                sessionId: context.sessionId,
            });

            try {
                const { response, context: ragContext } = await context.knowledgeService.searchWithContext(
                    args.query,
                    5
                );

                const latencyMs = Date.now() - startTime;

                await context.callTracker.logFunctionCall(
                    context.sessionId,
                    context.organizationId,
                    'general_search',
                    { query: args.query, category: args.category },
                    { found: response.found, context: ragContext },
                    { latencyMs }
                );

                if (!response.found || !ragContext) {
                    return {
                        success: true,
                        result: 'I couldn\'t find specific information about that. Please try rephrasing your question.',
                    };
                }

                return {
                    success: true,
                    result: ragContext,
                };
            } catch (error) {
                logger.error('General search tool error', {
                    error: (error as Error).message,
                    sessionId: context.sessionId,
                });
                return {
                    success: false,
                    error: 'Failed to search. Please try again.',
                };
            }
        },
    });
}
