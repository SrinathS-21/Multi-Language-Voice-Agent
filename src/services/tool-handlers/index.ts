/**
 * Tool Handlers Module
 * 
 * Implements LiveKit-compatible tool handlers for voice agent function calling.
 * These handlers execute when the LLM decides to call a function.
 * 
 * Note: Call termination happens via farewell message detection, not a tool.
 * 
 * @module tool-handlers
 */

// Types
export type {
    ToolExecutionContext,
    ToolResult,
    ShutdownCallbackFn,
} from './types.js';

// Search tools
export {
    createKnowledgeSearchTool,
    createGeneralSearchTool,
} from './search.js';

// Call management tools
export {
    createTransferCallTool,
} from './calls.js';

// Business tools
export {
    createBusinessInfoTool,
} from './business.js';

// Dynamic tools (from generated functions)
export {
    createVectorSearchTool,
    createWebhookTool,
    createStaticTool,
} from './dynamic.js';

// Tool context builder
export {
    buildToolContext,
    createMinimalToolContext,
} from './context.js';

// Import for default export
import { buildToolContext, createMinimalToolContext } from './context.js';
import { createKnowledgeSearchTool, createGeneralSearchTool } from './search.js';
import { createTransferCallTool } from './calls.js';

// Default export for backward compatibility
export default {
    buildToolContext,
    createMinimalToolContext,
    createKnowledgeSearchTool,
    createGeneralSearchTool,
    createTransferCallTool,
};
