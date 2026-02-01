/**
 * Services Index
 * 
 * Re-exports all service modules for easy importing.
 * 
 * Note: Some modules have overlapping exports. Import from specific
 * module files if you need functions from multiple modules.
 */

// Core Services
export * from './agent-config.js';
export * from './call-tracking.js';
export * from './session.js';

// Document & Knowledge Services
export * from './chunking.js';
// Document parser (selective export to avoid chunking conflicts)
export { DocumentParserService, getDocumentParser } from './document-parser/service.js';

// Voice Knowledge (export main service, not utilities that conflict with chunking)
export {
    VoiceKnowledgeService,
    createVoiceKnowledgeService,
    expandQuery,
    getAdjustedThreshold,
} from './voice-knowledge/index.js';

export type {
    ParsedItem,
    VoiceSearchItem,
    VoiceSearchResponse,
    AgentRagConfig,
    BusinessInfoResult,
    HybridSearchResult,
    HybridSearchOptions,
    CacheStats,
    WarmupResult,
} from './voice-knowledge/index.js';

// Function & Tool Services
export * from './function-generator.js';
export * from './tool-handlers.js';

// Integration Services (Tool Marketplace)
export {
    IntegrationService,
    getIntegrationService,
    createExecutionContext,
    type IntegrationServiceConfig,
} from './IntegrationService.js';

export {
    IntegrationEventHandler,
    getIntegrationEventHandler,
    initializeIntegrationHandler,
    type CallSessionData,
    type IntentDetectedEvent,
    type EscalationEvent,
} from './IntegrationEventHandler.js';
