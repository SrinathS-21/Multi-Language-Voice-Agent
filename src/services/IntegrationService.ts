/**
 * Integration Service
 * 
 * Central service for executing integration plugins.
 * Handles trigger matching, execution, retries, and logging.
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api.js';
import {
    getPluginRegistry,
    initializeBuiltInPlugins,
    IntegrationExecutionContext,
    IntegrationExecutionResult,
    IIntegrationPlugin,
    IntegrationTriggerType,
    StoredAgentIntegration,
} from '../plugins/integrations/index.js';

/**
 * Integration Service Configuration
 */
export interface IntegrationServiceConfig {
    convexUrl: string;
    maxRetries?: number;
    retryDelayMs?: number;
    enableLogging?: boolean;
}

/**
 * Execution result with metadata
 */
interface ExecutionWithMeta {
    integrationId: string;
    integrationName: string;
    toolId: string;
    result: IntegrationExecutionResult;
}

/**
 * Integration Service
 * Manages execution of integration plugins based on triggers
 */
export class IntegrationService {
    private convex: ConvexHttpClient;
    private config: IntegrationServiceConfig;
    private initialized: boolean = false;
    
    constructor(config: IntegrationServiceConfig) {
        this.config = {
            maxRetries: 3,
            retryDelayMs: 1000,
            enableLogging: true,
            ...config,
        };
        this.convex = new ConvexHttpClient(config.convexUrl);
    }
    
    /**
     * Initialize the service and register built-in plugins
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;
        
        console.log('[IntegrationService] Initializing...');
        
        // Register built-in plugins
        initializeBuiltInPlugins();
        
        this.initialized = true;
        console.log('[IntegrationService] Initialized successfully');
    }
    
    /**
     * Trigger integrations for a specific event
     * @param trigger The event that occurred
     * @param context The execution context with call data
     */
    async triggerIntegrations(
        trigger: IntegrationTriggerType,
        context: IntegrationExecutionContext
    ): Promise<ExecutionWithMeta[]> {
        if (!this.initialized) {
            await this.initialize();
        }
        
        console.log(`[IntegrationService] Processing trigger: ${trigger} for call ${context.callId}`);
        
        // Get active integrations for this agent and trigger
        const integrations = await this.getIntegrationsForTrigger(context.agentId, trigger);
        
        if (integrations.length === 0) {
            console.log(`[IntegrationService] No integrations configured for trigger: ${trigger}`);
            return [];
        }
        
        console.log(`[IntegrationService] Found ${integrations.length} integrations to execute`);
        
        // Execute each integration
        const results: ExecutionWithMeta[] = [];
        
        for (const integration of integrations) {
            const result = await this.executeIntegration(integration, context, trigger);
            results.push(result);
        }
        
        // Log summary
        const successful = results.filter(r => r.result.success).length;
        const failed = results.filter(r => !r.result.success).length;
        console.log(`[IntegrationService] Completed: ${successful} successful, ${failed} failed`);
        
        return results;
    }
    
    /**
     * Execute a single integration with retry logic
     */
    private async executeIntegration(
        integration: StoredAgentIntegration & { tool?: { name: string } },
        context: IntegrationExecutionContext,
        trigger: string
    ): Promise<ExecutionWithMeta> {
        const registry = getPluginRegistry();
        const plugin = registry.get(integration.toolId);
        
        if (!plugin) {
            console.error(`[IntegrationService] Plugin not found: ${integration.toolId}`);
            return {
                integrationId: integration._id,
                integrationName: integration.name,
                toolId: integration.toolId,
                result: {
                    success: false,
                    executionTimeMs: 0,
                    error: {
                        code: 'PLUGIN_NOT_FOUND',
                        message: `Plugin not registered: ${integration.toolId}`,
                        retryable: false,
                    },
                },
            };
        }
        
        // Parse configuration
        let config: unknown;
        try {
            config = typeof integration.config === 'string' 
                ? JSON.parse(integration.config) 
                : integration.config;
        } catch (e) {
            return {
                integrationId: integration._id,
                integrationName: integration.name,
                toolId: integration.toolId,
                result: {
                    success: false,
                    executionTimeMs: 0,
                    error: {
                        code: 'INVALID_CONFIG',
                        message: 'Failed to parse integration configuration',
                        retryable: false,
                    },
                },
            };
        }
        
        // Execute with retry logic
        const maxAttempts = integration.retryEnabled !== false 
            ? (integration.maxRetries ?? this.config.maxRetries ?? 3)
            : 1;
        
        let lastResult: IntegrationExecutionResult | null = null;
        let attemptNumber = 0;
        
        while (attemptNumber < maxAttempts) {
            attemptNumber++;
            
            console.log(`[IntegrationService] Executing ${integration.name} (attempt ${attemptNumber}/${maxAttempts})`);
            
            // Log execution start
            if (this.config.enableLogging) {
                await this.logExecution(integration, context, trigger, 'executing', attemptNumber, maxAttempts);
            }
            
            try {
                lastResult = await plugin.execute(context, config);
                
                // Log result
                if (this.config.enableLogging) {
                    await this.logExecution(
                        integration,
                        context,
                        trigger,
                        lastResult.success ? 'success' : 'failed',
                        attemptNumber,
                        maxAttempts,
                        lastResult
                    );
                }
                
                if (lastResult.success) {
                    return {
                        integrationId: integration._id,
                        integrationName: integration.name,
                        toolId: integration.toolId,
                        result: lastResult,
                    };
                }
                
                // Check if we should retry
                if (!lastResult.error?.retryable || attemptNumber >= maxAttempts) {
                    break;
                }
                
                // Get retry delay
                const retryDecision = plugin.handleError?.(
                    new Error(lastResult.error?.message || 'Unknown error'),
                    attemptNumber
                );
                
                if (!retryDecision?.shouldRetry) {
                    break;
                }
                
                const delay = retryDecision?.delayMs ?? (integration.retryDelayMs ?? this.config.retryDelayMs ?? 1000);
                console.log(`[IntegrationService] Retrying in ${delay}ms...`);
                await this.sleep(delay);
                
            } catch (error) {
                lastResult = {
                    success: false,
                    executionTimeMs: 0,
                    error: {
                        code: 'EXECUTION_ERROR',
                        message: error instanceof Error ? error.message : 'Unknown error',
                        retryable: true,
                    },
                };
                
                if (this.config.enableLogging) {
                    await this.logExecution(
                        integration,
                        context,
                        trigger,
                        'failed',
                        attemptNumber,
                        maxAttempts,
                        lastResult
                    );
                }
            }
        }
        
        return {
            integrationId: integration._id,
            integrationName: integration.name,
            toolId: integration.toolId,
            result: lastResult || {
                success: false,
                executionTimeMs: 0,
                error: {
                    code: 'UNKNOWN_ERROR',
                    message: 'Execution failed for unknown reason',
                    retryable: false,
                },
            },
        };
    }
    
    /**
     * Get integrations for a specific trigger
     */
    private async getIntegrationsForTrigger(
        agentId: string,
        trigger: string
    ): Promise<Array<StoredAgentIntegration & { tool?: { name: string } }>> {
        try {
            const integrations = await this.convex.query(api.integrations.getIntegrationsForTrigger, {
                agentId,
                trigger,
            });
            return integrations as any[];
        } catch (error) {
            console.error('[IntegrationService] Failed to fetch integrations:', error);
            return [];
        }
    }
    
    /**
     * Log execution to database
     */
    private async logExecution(
        integration: StoredAgentIntegration,
        context: IntegrationExecutionContext,
        trigger: string,
        status: 'pending' | 'executing' | 'success' | 'failed' | 'retrying',
        attemptNumber: number,
        maxAttempts: number,
        result?: IntegrationExecutionResult
    ): Promise<void> {
        try {
            await this.convex.mutation(api.integrations.logExecution, {
                organizationId: context.organizationId,
                agentId: context.agentId,
                integrationId: integration._id as any,
                toolId: integration.toolId,
                callSessionId: context.callSessionId,
                trigger,
                status,
                requestPayload: result?.requestPayload,
                responseData: result?.responsePayload,
                errorMessage: result?.error?.message,
                errorCode: result?.error?.code,
                attemptNumber,
                maxAttempts,
                executionTimeMs: result?.executionTimeMs,
            });
        } catch (error) {
            console.error('[IntegrationService] Failed to log execution:', error);
        }
    }
    
    /**
     * Test a specific integration
     */
    async testIntegration(
        toolId: string,
        config: unknown
    ): Promise<{ success: boolean; message: string; latencyMs?: number }> {
        if (!this.initialized) {
            await this.initialize();
        }
        
        const registry = getPluginRegistry();
        const plugin = registry.get(toolId);
        
        if (!plugin) {
            return {
                success: false,
                message: `Plugin not found: ${toolId}`,
            };
        }
        
        if (plugin.testConnection) {
            return await plugin.testConnection(config);
        }
        
        // Fallback to config validation
        const validation = plugin.validateConfig(config);
        return {
            success: validation.valid,
            message: validation.valid 
                ? 'Configuration is valid' 
                : `Validation errors: ${validation.errors?.map(e => e.message).join(', ')}`,
        };
    }
    
    /**
     * Get available plugins
     */
    getAvailablePlugins(): Array<{
        id: string;
        name: string;
        description: string;
        category: string;
        icon?: string;
        supportedTriggers: string[];
    }> {
        if (!this.initialized) {
            initializeBuiltInPlugins();
            this.initialized = true;
        }
        
        return getPluginRegistry().getMarketplaceList();
    }
    
    /**
     * Sleep helper
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Singleton instance
 */
let serviceInstance: IntegrationService | null = null;

/**
 * Get or create the integration service instance
 */
export function getIntegrationService(config?: IntegrationServiceConfig): IntegrationService {
    if (!serviceInstance) {
        if (!config) {
            throw new Error('IntegrationService must be initialized with config');
        }
        serviceInstance = new IntegrationService(config);
    }
    return serviceInstance;
}

/**
 * Create execution context from call session data
 */
export function createExecutionContext(
    callData: {
        callId: string;
        callSessionId: string;
        agentId: string;
        organizationId: string;
        callerNumber?: string;
        callDirection?: 'inbound' | 'outbound';
        startTime?: Date;
        endTime?: Date;
        duration?: number;
        transcript?: Array<{ role: string; content: string; timestamp?: Date }>;
        extractedData?: Record<string, unknown>;
        functionCalls?: Array<{
            functionName: string;
            parameters: Record<string, unknown>;
            result?: unknown;
            timestamp?: number;
            success?: boolean;
        }>;
        agentName?: string;
    },
    trigger: IntegrationTriggerType
): IntegrationExecutionContext & { functionCalls?: Array<{ functionName: string; parameters: Record<string, unknown>; result?: unknown; timestamp?: number }>; agentName?: string } {
    // Build full transcript string
    const fullTranscript = callData.transcript
        ?.map(t => `${t.role}: ${t.content}`)
        .join('\n');
    
    return {
        callId: callData.callId,
        callSessionId: callData.callSessionId,
        agentId: callData.agentId,
        organizationId: callData.organizationId,
        callerNumber: callData.callerNumber,
        callDirection: callData.callDirection || 'inbound',
        startTime: callData.startTime || new Date(),
        endTime: callData.endTime,
        duration: callData.duration,
        transcript: callData.transcript as any,
        fullTranscript,
        extractedData: callData.extractedData as any,
        trigger,
        triggerTimestamp: new Date(),
        // Extended context for dynamic data extraction
        functionCalls: callData.functionCalls,
        agentName: callData.agentName,
    };
}
