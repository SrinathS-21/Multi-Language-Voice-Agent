/**
 * Tool Context Builder
 * 
 * Builds tool context for LiveKit voice agents.
 * Combines predefined tools with generated function tools.
 * 
 * @module tool-handlers/tool-context
 */

import { llm } from '@livekit/agents';
import { logger } from '../../core/logging.js';
import type { GeneratedFunction } from '../function-generator.js';
import type { ToolExecutionContext } from './types.js';
import { createKnowledgeSearchTool } from './search.js';
import { createTransferCallTool, createEndCallTool } from './calls.js';
import { createVectorSearchTool, createWebhookTool, createStaticTool } from './dynamic.js';

/**
 * Build tool context from generated functions
 * 
 * Creates a tool context that handles:
 * 1. End call tool for graceful termination
 * 2. Transfer call tool for escalation to human agents
 * 3. Generated functions from domain configs (search_catalog, get_information, etc.)
 */
export function buildToolContext(
    generatedFunctions: GeneratedFunction[],
    executionContext: ToolExecutionContext
): llm.ToolContext {
    const toolContext: llm.ToolContext = {};

    // Add end call tool for graceful call termination
    toolContext['end_call'] = createEndCallTool(executionContext);

    // Add transfer call tool for escalating to human agents
    toolContext['transfer_call'] = createTransferCallTool(executionContext);

    // Add generated functions based on handler type
    for (const func of generatedFunctions) {
        if (!func.enabled) continue;

        switch (func.handlerType) {
            case 'vector_search':
                // Use knowledge search handler
                toolContext[func.name] = createVectorSearchTool(func, executionContext);
                break;

            case 'webhook':
                // Create webhook handler
                toolContext[func.name] = createWebhookTool(func, executionContext);
                break;

            case 'static':
                // Create static response handler
                toolContext[func.name] = createStaticTool(func, executionContext);
                break;

            default:
                logger.warning(`Unknown handler type for function: ${func.name}`, {
                    handlerType: func.handlerType,
                });
        }
    }

    // Log available tools for debugging
    logger.info('🔧 Available tools for agent', {
        toolCount: Object.keys(toolContext).length,
        toolNames: Object.keys(toolContext),
    });

    return toolContext;
}

/**
 * Create minimal tool context with search and end_call tools
 */
export function createMinimalToolContext(
    executionContext: ToolExecutionContext
): llm.ToolContext {
    return {
        search_knowledge: createKnowledgeSearchTool(executionContext),
        end_call: createEndCallTool(executionContext),
    };
}
