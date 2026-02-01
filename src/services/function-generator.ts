/**
 * Function Generator Service
 * 
 * Generates dynamic function schemas for voice agent tool use.
 * Functions are the actions the AI can take during a conversation.
 * 
 * Features:
 * - Generate domain-specific default functions
 * - Create custom functions from configuration
 * - Build OpenAI-compatible function schemas
 * - Support for vector search, webhooks, and static actions
 */

import { logger } from '../core/logging.js';
import { 
    getDomainRegistry, 
    DomainType, 
    FunctionTemplate, 
    HandlerType 
} from '../models/domain.js';
import { AgentConfigData } from './agent-config.js';

/**
 * OpenAI-compatible function definition
 */
export interface FunctionDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description: string;
            enum?: string[];
            default?: any;
        }>;
        required: string[];
    };
}

/**
 * Extended function with handler metadata
 */
export interface GeneratedFunction extends FunctionDefinition {
    handlerType: HandlerType;
    handlerConfig: Record<string, any>;
    enabled: boolean;
    priority: number;
}

/**
 * Custom function definition from database
 */
export interface CustomFunctionConfig {
    name: string;
    description: string;
    parameters: Array<{
        name: string;
        type: string;
        description: string;
        required?: boolean;
        enum?: string[];
    }>;
    handlerType: string;
    handlerConfig?: Record<string, any>;
    enabled?: boolean;
}

/**
 * Function generation options
 */
export interface FunctionGeneratorOptions {
    includeDefaults: boolean;
    includeKnowledgeSearch: boolean;
    customFunctions?: CustomFunctionConfig[];
}

/**
 * Function Generator Service
 */
export class FunctionGeneratorService {
    private domainRegistry = getDomainRegistry();

    /**
     * Generate all functions for an agent
     */
    generateFunctions(
        agentConfig: AgentConfigData,
        options: Partial<FunctionGeneratorOptions> = {}
    ): GeneratedFunction[] {
        const opts: FunctionGeneratorOptions = {
            includeDefaults: true,
            includeKnowledgeSearch: true,
            ...options,
        };

        const functions: GeneratedFunction[] = [];

        // 1. Add domain default functions
        if (opts.includeDefaults) {
            const domainFunctions = this.getDomainFunctions(agentConfig.domainType);
            functions.push(...domainFunctions);
        }

        // 2. Add knowledge search function if not already included
        if (opts.includeKnowledgeSearch) {
            const hasSearch = functions.some(f => 
                f.handlerType === HandlerType.VECTOR_SEARCH ||
                f.name.includes('search')
            );
            if (!hasSearch) {
                functions.push(this.createKnowledgeSearchFunction());
            }
        }

        // 3. Add custom functions from config
        if (opts.customFunctions && opts.customFunctions.length > 0) {
            const customGenerated = opts.customFunctions
                .map(cf => this.customToGenerated(cf))
                .filter(f => f !== null) as GeneratedFunction[];
            functions.push(...customGenerated);
        }

        // 4. Add custom functions from agent config
        const agentCustomFunctions = this.extractCustomFunctions(agentConfig);
        if (agentCustomFunctions.length > 0) {
            const customGenerated = agentCustomFunctions
                .map(cf => this.customToGenerated(cf))
                .filter(f => f !== null) as GeneratedFunction[];
            functions.push(...customGenerated);
        }

        // Deduplicate by name (later functions override earlier)
        const uniqueFunctions = this.deduplicateFunctions(functions);

        // Sort by priority
        uniqueFunctions.sort((a, b) => b.priority - a.priority);

        // Silent - reduce noise
        // logger.info(`Generated ${uniqueFunctions.length} functions for agent: ${agentConfig.name}`);

        return uniqueFunctions;
    }

    /**
     * Get domain-specific default functions
     */
    private getDomainFunctions(domainType: DomainType): GeneratedFunction[] {
        const templates = this.domainRegistry.getDefaultFunctions(domainType);

        return templates.map((template, index) => ({
            name: template.name,
            description: template.description,
            parameters: template.parameters as FunctionDefinition['parameters'],
            handlerType: template.handlerType,
            handlerConfig: template.handlerConfig,
            enabled: true,
            priority: 100 - index, // Higher priority for earlier functions
        }));
    }

    /**
     * Create standard knowledge search function
     */
    private createKnowledgeSearchFunction(): GeneratedFunction {
        return {
            name: 'search_knowledge',
            description: 'Search the knowledge base for information. Use this when the customer asks a question that requires looking up information.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query - what information is needed',
                    },
                },
                required: ['query'],
            },
            handlerType: HandlerType.VECTOR_SEARCH,
            handlerConfig: {
                limit: 5,
                includeMetadata: true,
            },
            enabled: true,
            priority: 90,
        };
    }

    /**
     * Convert custom function config to generated function
     */
    private customToGenerated(custom: CustomFunctionConfig): GeneratedFunction | null {
        if (!custom.name || !custom.description) {
            logger.warning('Invalid custom function - missing name or description');
            return null;
        }

        // Convert parameters array to OpenAI format
        const properties: Record<string, any> = {};
        const required: string[] = [];

        for (const param of custom.parameters || []) {
            properties[param.name] = {
                type: param.type || 'string',
                description: param.description,
            };
            if (param.enum) {
                properties[param.name].enum = param.enum;
            }
            if (param.required) {
                required.push(param.name);
            }
        }

        // Parse handler type
        const handlerType = this.parseHandlerType(custom.handlerType);

        return {
            name: custom.name,
            description: custom.description,
            parameters: {
                type: 'object',
                properties,
                required,
            },
            handlerType,
            handlerConfig: custom.handlerConfig || {},
            enabled: custom.enabled !== false,
            priority: 70, // Custom functions have medium priority
        };
    }

    /**
     * Parse handler type from string
     */
    private parseHandlerType(typeStr: string): HandlerType {
        const normalized = typeStr.toLowerCase().replace(/[_-]/g, '');

        switch (normalized) {
            case 'vectorsearch':
            case 'search':
            case 'rag':
                return HandlerType.VECTOR_SEARCH;
            case 'convexquery':
            case 'query':
            case 'database':
                return HandlerType.CONVEX_QUERY;
            case 'webhook':
            case 'http':
            case 'api':
                return HandlerType.WEBHOOK;
            case 'static':
            case 'action':
            default:
                return HandlerType.STATIC;
        }
    }

    /**
     * Extract custom functions from agent config
     */
    private extractCustomFunctions(agentConfig: AgentConfigData): CustomFunctionConfig[] {
        const rawConfig = agentConfig.rawConfig;
        if (!rawConfig) return [];

        // Check for functions array in config
        if (Array.isArray(rawConfig.functions)) {
            return rawConfig.functions as CustomFunctionConfig[];
        }

        // Check for customFunctions
        if (Array.isArray(rawConfig.customFunctions)) {
            return rawConfig.customFunctions as CustomFunctionConfig[];
        }

        return [];
    }

    /**
     * Deduplicate functions by name
     */
    private deduplicateFunctions(functions: GeneratedFunction[]): GeneratedFunction[] {
        const seen = new Map<string, GeneratedFunction>();

        for (const func of functions) {
            // Later functions override earlier ones
            seen.set(func.name, func);
        }

        return Array.from(seen.values());
    }

    /**
     * Convert to OpenAI tools format
     */
    toOpenAITools(functions: GeneratedFunction[]): Array<{
        type: 'function';
        function: FunctionDefinition;
    }> {
        return functions
            .filter(f => f.enabled)
            .map(f => ({
                type: 'function' as const,
                function: {
                    name: f.name,
                    description: f.description,
                    parameters: f.parameters,
                },
            }));
    }

    /**
     * Get function by name
     */
    getFunction(functions: GeneratedFunction[], name: string): GeneratedFunction | undefined {
        return functions.find(f => f.name === name);
    }

    /**
     * Create a simple function definition
     */
    createFunction(
        name: string,
        description: string,
        parameters: Array<{
            name: string;
            type: string;
            description: string;
            required?: boolean;
        }>,
        handlerType: HandlerType = HandlerType.STATIC,
        handlerConfig: Record<string, any> = {}
    ): GeneratedFunction {
        const properties: Record<string, any> = {};
        const required: string[] = [];

        for (const param of parameters) {
            properties[param.name] = {
                type: param.type,
                description: param.description,
            };
            if (param.required) {
                required.push(param.name);
            }
        }

        return {
            name,
            description,
            parameters: {
                type: 'object',
                properties,
                required,
            },
            handlerType,
            handlerConfig,
            enabled: true,
            priority: 50,
        };
    }

    /**
     * Validate function definition
     */
    validateFunction(func: GeneratedFunction): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!func.name) {
            errors.push('Function name is required');
        }

        if (!func.description) {
            errors.push('Function description is required');
        }

        if (func.name && !/^[a-z][a-z0-9_]*$/i.test(func.name)) {
            errors.push('Function name must be alphanumeric with underscores');
        }

        if (func.parameters?.type !== 'object') {
            errors.push('Parameters must be an object type');
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }
}

// Singleton instance
let serviceInstance: FunctionGeneratorService | null = null;

/**
 * Get the function generator service singleton
 */
export function getFunctionGenerator(): FunctionGeneratorService {
    if (!serviceInstance) {
        serviceInstance = new FunctionGeneratorService();
    }
    return serviceInstance;
}

export default FunctionGeneratorService;
