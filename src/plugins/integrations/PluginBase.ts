/**
 * Base Plugin Class
 * 
 * Abstract class providing common functionality for all integration plugins.
 * Extend this class to create new plugins.
 */

import {
    IIntegrationPlugin,
    IntegrationPluginMetadata,
    IntegrationExecutionContext,
    IntegrationExecutionResult,
    IntegrationConfigValidationResult,
    IntegrationTestConnectionResult,
    IntegrationRetryDecision,
    IntegrationConfigSchema,
    IntegrationTriggerType,
    IntegrationCategory,
} from './types.js';

/**
 * Logger interface for plugin operations
 */
export interface PluginLogger {
    debug(message: string, meta?: Record<string, unknown>): void;
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Default console logger
 */
const defaultLogger: PluginLogger = {
    debug: (msg, meta) => console.debug(`[Plugin] ${msg}`, meta || ''),
    info: (msg, meta) => console.info(`[Plugin] ${msg}`, meta || ''),
    warn: (msg, meta) => console.warn(`[Plugin] ${msg}`, meta || ''),
    error: (msg, meta) => console.error(`[Plugin] ${msg}`, meta || ''),
};

/**
 * Abstract base class for integration plugins
 */
export abstract class IntegrationPluginBase implements IIntegrationPlugin {
    protected logger: PluginLogger;
    
    constructor(logger?: PluginLogger) {
        this.logger = logger || defaultLogger;
    }
    
    // ============================================
    // ABSTRACT METHODS (must be implemented)
    // ============================================
    
    /**
     * Plugin metadata - must be defined by subclass
     */
    abstract get metadata(): IntegrationPluginMetadata;
    
    /**
     * Execute the plugin - must be implemented by subclass
     */
    abstract execute(
        context: IntegrationExecutionContext,
        config: unknown
    ): Promise<IntegrationExecutionResult>;
    
    // ============================================
    // DEFAULT IMPLEMENTATIONS (can be overridden)
    // ============================================
    
    /**
     * Validate configuration against the schema
     * Default implementation validates required fields
     */
    validateConfig(config: unknown): IntegrationConfigValidationResult {
        const errors: { field: string; message: string }[] = [];
        const schema = this.metadata.configSchema;
        
        if (!config || typeof config !== 'object') {
            return {
                valid: false,
                errors: [{ field: 'config', message: 'Configuration must be an object' }],
            };
        }
        
        const configObj = config as Record<string, unknown>;
        
        // Check required fields
        if (schema.required) {
            for (const field of schema.required) {
                if (configObj[field] === undefined || configObj[field] === null || configObj[field] === '') {
                    errors.push({
                        field,
                        message: `${field} is required`,
                    });
                }
            }
        }
        
        // Validate field types
        for (const [field, prop] of Object.entries(schema.properties)) {
            const value = configObj[field];
            
            if (value === undefined || value === null) continue;
            
            // Type validation
            if (prop.type === 'string' && typeof value !== 'string') {
                errors.push({ field, message: `${field} must be a string` });
            }
            if (prop.type === 'number' && typeof value !== 'number') {
                errors.push({ field, message: `${field} must be a number` });
            }
            if (prop.type === 'boolean' && typeof value !== 'boolean') {
                errors.push({ field, message: `${field} must be a boolean` });
            }
            if (prop.type === 'array' && !Array.isArray(value)) {
                errors.push({ field, message: `${field} must be an array` });
            }
            
            // Pattern validation for strings
            if (prop.type === 'string' && prop.pattern && typeof value === 'string') {
                const regex = new RegExp(prop.pattern);
                if (!regex.test(value)) {
                    errors.push({ field, message: `${field} does not match required pattern` });
                }
            }
            
            // Enum validation
            if (prop.enum && !prop.enum.includes(value as string)) {
                errors.push({ field, message: `${field} must be one of: ${prop.enum.join(', ')}` });
            }
            
            // Min/max for numbers
            if (prop.type === 'number' && typeof value === 'number') {
                if (prop.minimum !== undefined && value < prop.minimum) {
                    errors.push({ field, message: `${field} must be at least ${prop.minimum}` });
                }
                if (prop.maximum !== undefined && value > prop.maximum) {
                    errors.push({ field, message: `${field} must be at most ${prop.maximum}` });
                }
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    
    /**
     * Test the connection with the given configuration
     * Default implementation makes a simple test request
     */
    async testConnection(config: unknown): Promise<IntegrationTestConnectionResult> {
        const validation = this.validateConfig(config);
        
        if (!validation.valid) {
            return {
                success: false,
                message: `Configuration invalid: ${validation.errors?.map(e => e.message).join(', ')}`,
            };
        }
        
        return {
            success: true,
            message: 'Configuration is valid',
        };
    }
    
    /**
     * Transform the execution context into a payload
     * Default implementation returns a standard payload structure
     */
    transformPayload(context: IntegrationExecutionContext, config: unknown): unknown {
        return {
            // Call metadata
            callId: context.callId,
            callSessionId: context.callSessionId,
            agentId: context.agentId,
            organizationId: context.organizationId,
            
            // Caller info
            callerNumber: context.callerNumber || 'unknown',
            callDirection: context.callDirection,
            
            // Timing
            startTime: context.startTime?.toISOString(),
            endTime: context.endTime?.toISOString(),
            duration: context.duration,
            
            // Content
            transcript: context.fullTranscript,
            
            // Extracted data
            customerName: context.extractedData?.customerName,
            intent: context.extractedData?.primaryIntent,
            sentiment: context.extractedData?.sentiment,
            appointmentDate: context.extractedData?.appointmentDate,
            appointmentTime: context.extractedData?.appointmentTime,
            outcome: context.extractedData?.outcome,
            
            // Trigger info
            trigger: context.trigger,
            timestamp: context.triggerTimestamp?.toISOString() || new Date().toISOString(),
            
            // Custom fields
            customFields: context.extractedData?.customFields,
            metadata: context.metadata,
        };
    }
    
    /**
     * Handle errors with retry logic
     * Default implementation uses exponential backoff
     */
    handleError(error: Error, attemptNumber: number): IntegrationRetryDecision {
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second
        
        // Check if error is retryable
        const retryableErrors = [
            'ECONNRESET',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'NETWORK_ERROR',
            '429', // Too Many Requests
            '503', // Service Unavailable
            '502', // Bad Gateway
        ];
        
        const isRetryable = retryableErrors.some(
            code => error.message.includes(code) || error.name.includes(code)
        );
        
        if (!isRetryable || attemptNumber >= maxRetries) {
            return {
                shouldRetry: false,
                reason: isRetryable ? 'Max retries exceeded' : 'Non-retryable error',
            };
        }
        
        // Exponential backoff with jitter
        const delay = Math.min(
            baseDelay * Math.pow(2, attemptNumber - 1) + Math.random() * 1000,
            30000 // Max 30 seconds
        );
        
        return {
            shouldRetry: true,
            delayMs: delay,
            reason: `Retrying due to: ${error.message}`,
        };
    }
    
    // ============================================
    // UTILITY METHODS
    // ============================================
    
    /**
     * Create a successful execution result
     */
    protected createSuccessResult(
        data: unknown,
        executionTimeMs: number,
        requestPayload?: unknown,
        responsePayload?: unknown
    ): IntegrationExecutionResult {
        return {
            success: true,
            data,
            executionTimeMs,
            requestPayload,
            responsePayload,
        };
    }
    
    /**
     * Create an error execution result
     */
    protected createErrorResult(
        code: string,
        message: string,
        executionTimeMs: number,
        retryable: boolean = true,
        details?: unknown,
        requestPayload?: unknown
    ): IntegrationExecutionResult {
        return {
            success: false,
            error: {
                code,
                message,
                details,
                retryable,
            },
            executionTimeMs,
            requestPayload,
        };
    }
    
    /**
     * Template string replacement
     * Replaces {{variable}} with actual values
     */
    protected replaceTemplateVariables(
        template: string,
        context: IntegrationExecutionContext
    ): string {
        const variables: Record<string, string> = {
            callId: context.callId,
            callSessionId: context.callSessionId,
            agentId: context.agentId,
            organizationId: context.organizationId,
            callerNumber: context.callerNumber || '',
            callDirection: context.callDirection,
            duration: context.duration?.toString() || '0',
            transcript: context.fullTranscript || '',
            customerName: context.extractedData?.customerName || '',
            customerEmail: context.extractedData?.customerEmail || '',
            customerPhone: context.extractedData?.customerPhone || '',
            intent: context.extractedData?.primaryIntent || '',
            sentiment: context.extractedData?.sentiment || '',
            appointmentDate: context.extractedData?.appointmentDate || '',
            appointmentTime: context.extractedData?.appointmentTime || '',
            outcome: context.extractedData?.outcome || '',
            trigger: context.trigger,
            timestamp: new Date().toISOString(),
        };
        
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }
        
        return result;
    }
    
    /**
     * Make an HTTP request with timeout
     */
    protected async httpRequest(
        url: string,
        options: {
            method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
            headers?: Record<string, string>;
            body?: unknown;
            timeout?: number;
        } = {}
    ): Promise<{
        status: number;
        statusText: string;
        data: unknown;
        headers: Record<string, string>;
    }> {
        const { method = 'POST', headers = {}, body, timeout = 30000 } = options;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            
            let data: unknown;
            const contentType = response.headers.get('content-type');
            if (contentType?.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }
            
            return {
                status: response.status,
                statusText: response.statusText,
                data,
                headers: this.parseResponseHeaders(response.headers),
            };
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`Request timeout after ${timeout}ms`);
            }
            throw error;
        }
    }
    
    /**
     * Parse response headers into a plain object
     */
    private parseResponseHeaders(headers: Headers): Record<string, string> {
        const result: Record<string, string> = {};
        headers.forEach((value, key) => {
            result[key] = value;
        });
        return result;
    }
}

/**
 * Helper function to create plugin metadata
 */
export function createPluginMetadata(
    id: string,
    name: string,
    description: string,
    category: IntegrationCategory,
    supportedTriggers: IntegrationTriggerType[],
    configSchema: IntegrationConfigSchema,
    options: Partial<IntegrationPluginMetadata> = {}
): IntegrationPluginMetadata {
    return {
        id,
        name,
        version: options.version || '1.0.0',
        description,
        category,
        supportedTriggers,
        configSchema,
        isBuiltIn: options.isBuiltIn ?? true,
        ...options,
    };
}
