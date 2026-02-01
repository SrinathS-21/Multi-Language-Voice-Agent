/**
 * Agent Config Service
 * 
 * Loads agent configurations from Convex and generates
 * provider-ready configs for Sarvam AI (STT, TTS, LLM).
 * 
 * Responsibilities:
 * - Load agent config from Convex
 * - Merge domain defaults
 * - Generate Sarvam AI provider configs
 * - Validate configuration
 */

import { config } from '../core/config.js';
import { logger } from '../core/logging.js';
import { getDomainRegistry, DomainType } from '../models/domain.js';

/**
 * Parsed agent configuration from database
 */
export interface AgentConfigData {
    // Core identity
    id: string;
    organizationId: string;
    name: string;
    role?: string;
    aiPersonaName?: string; // Spoken introduction name

    // System prompt
    systemPrompt: string;

    // Voice settings
    voice?: VoiceConfig;

    // Language settings
    language: string; // Language code (e.g., 'ta-IN')
    languageName: string; // Full language name (e.g., 'Tamil')
    supportedLanguages?: string[];

    // Agent interaction messages
    greeting?: string; // Message spoken when call begins
    farewell?: string; // Message spoken when call ends

    // Domain configuration
    domainType: DomainType;
    customInstructions?: string;

    // Rate limits
    maxConcurrentCalls?: number;
    monthlyCallLimit?: number;

    // Knowledge settings
    enableContextualEnrichment?: boolean;

    // Raw config JSON (for voice, pace, and future config)
    rawConfig?: Record<string, any>;
}

/**
 * Voice configuration
 */
export interface VoiceConfig {
    voiceId?: string;
    model?: string;
    speed?: number;
    pitch?: number;
    tone?: string;
}

// Language code mappings
const LANGUAGE_CODES: Record<string, string> = {
    'en': 'en-IN',
    'en-IN': 'en-IN',
    'en-US': 'en-IN',
    'hi': 'hi-IN',
    'hi-IN': 'hi-IN',
    'ta': 'ta-IN',
    'ta-IN': 'ta-IN',
    'te': 'te-IN',
    'te-IN': 'te-IN',
    'kn': 'kn-IN',
    'kn-IN': 'kn-IN',
    'ml': 'ml-IN',
    'ml-IN': 'ml-IN',
    'bn': 'bn-IN',
    'bn-IN': 'bn-IN',
    'mr': 'mr-IN',
    'mr-IN': 'mr-IN',
    'gu': 'gu-IN',
    'gu-IN': 'gu-IN',
    'pa': 'pa-IN',
    'pa-IN': 'pa-IN',
};

// Language code to full name mapping
const LANGUAGE_NAMES: Record<string, string> = {
    'en': 'English',
    'en-IN': 'English',
    'en-US': 'English',
    'hi': 'Hindi',
    'hi-IN': 'Hindi',
    'ta': 'Tamil',
    'ta-IN': 'Tamil',
    'te': 'Telugu',
    'te-IN': 'Telugu',
    'kn': 'Kannada',
    'kn-IN': 'Kannada',
    'ml': 'Malayalam',
    'ml-IN': 'Malayalam',
    'bn': 'Bengali',
    'bn-IN': 'Bengali',
    'mr': 'Marathi',
    'mr-IN': 'Marathi',
    'gu': 'Gujarati',
    'gu-IN': 'Gujarati',
    'pa': 'Punjabi',
    'pa-IN': 'Punjabi',
};

/**
 * Agent Config Service
 * 
 * Hybrid Caching Strategy (see docs/PROMPT_CACHING_OPTIMIZATION.md):
 * - Layer 1: RAM cache for agent config (60s TTL)
 * - Layer 2: RAM cache for full prompts (10min TTL, timestamp-based key)
 * - Layer 3: Convex DB with pre-built fullPrompt field
 */
export class AgentConfigService {
    private convexUrl: string;
    private domainRegistry = getDomainRegistry();
    
    // Layer 1: Agent config cache (60s TTL)
    private configCache = new Map<string, { config: AgentConfigData; timestamp: number }>();
    private configCacheTtl = 60000; // 1 minute
    
    // Layer 2: Full prompt cache (10min TTL, timestamp-based key)
    // Key format: ${agentId}:${updatedAt} for auto-invalidation
    private promptCache = new Map<string, { prompt: string; timestamp: number }>();
    private promptCacheTtl = 600000; // 10 minutes

    constructor(convexUrl?: string) {
        const url = convexUrl || config.convex.url;
        if (!url) {
            throw new Error('CONVEX_URL is required for AgentConfigService');
        }
        this.convexUrl = url;
    }

    /**
     * Make a Convex query via HTTP
     */
    private async convexQuery(functionPath: string, args: Record<string, any>): Promise<any> {
        const url = `${this.convexUrl}/api/query`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: functionPath,
                args,
                format: 'json',
            }),
        });

        if (!response.ok) {
            throw new Error(`Convex query failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        return result.value;
    }

    /**
     * Execute a Convex mutation via HTTP
     */
    private async convexMutation(functionName: string, args: Record<string, any>): Promise<any> {
        const url = `${this.convexUrl}/api/mutation`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                path: functionName,
                args,
                format: 'json',
            }),
        });

        if (!response.ok) {
            throw new Error(`Convex mutation failed: ${response.statusText}`);
        }

        const result = await response.json();
        return result.value;
    }

    /**
     * Load agent configuration from Convex
     */
    async loadAgentConfig(agentId: string): Promise<AgentConfigData | null> {
        // Check config cache first
        const cached = this.configCache.get(agentId);
        if (cached && Date.now() - cached.timestamp < this.configCacheTtl) {
            logger.debug(`Using cached config for agent: ${agentId}`);
            return cached.config;
        }

        try {
            const agent = await this.convexQuery('agents:get', {
                id: agentId,
            });

            if (!agent) {
                logger.warning(`Agent not found: ${agentId}`);
                return null;
            }

            // Log raw agent data from DB for debugging
            logger.debug('🔍 Raw agent data from Convex', {
                agentId,
                name: agent.name,
                language: agent.language,
                greeting: agent.greeting,
                farewell: agent.farewell,
                configJson: agent.config,
                hasSystemPrompt: !!agent.systemPrompt,
                systemPromptLength: agent.systemPrompt?.length,
            });

            const configData = this.parseAgentConfig(agent);

            // Cache the result
            this.configCache.set(agentId, {
                config: configData,
                timestamp: Date.now(),
            });

            return configData;
        } catch (error) {
            logger.error(`Failed to load agent config: ${agentId}`, error as Error);
            throw error;
        }
    }

    /**
     * Get cached full prompt for an agent
     * 
     * Uses hybrid caching strategy:
     * 1. Check RAM cache (1-2ms if hit)
     * 2. Load from DB fullPrompt field (100ms)
     * 
     * NOTE: If fullPrompt is missing, run migration:
     *   npx convex run agents:rebuildAllPrompts
     * 
     * @returns Full prompt string, or null if agent not found
     */
    async getCachedFullPrompt(agentId: string): Promise<{ prompt: string | null; source: 'ram' | 'db' | 'not_found' | 'missing'; latencyMs: number }> {
        const startTime = Date.now();

        try {
            // First, load agent from DB to get updatedAt for cache key
            const agent = await this.convexQuery('agents:get', { id: agentId });
            
            if (!agent) {
                return { 
                    prompt: null, 
                    source: 'not_found', 
                    latencyMs: Date.now() - startTime 
                };
            }

            // Generate cache key using updatedAt for auto-invalidation
            const cacheKey = `${agentId}:${agent.updatedAt}`;

            // Layer 1: Check RAM cache
            const cached = this.promptCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.promptCacheTtl) {
                logger.debug('Prompt cache HIT (RAM)', { agentId, cacheKey });
                return { 
                    prompt: cached.prompt, 
                    source: 'ram', 
                    latencyMs: Date.now() - startTime 
                };
            }

            // Layer 2: Check DB fullPrompt field
            if (agent.fullPrompt) {
                // Cache in RAM for next time
                this.promptCache.set(cacheKey, {
                    prompt: agent.fullPrompt,
                    timestamp: Date.now(),
                });
                logger.debug('Prompt cache MISS (loaded from DB)', { agentId, cacheKey });
                return { 
                    prompt: agent.fullPrompt, 
                    source: 'db', 
                    latencyMs: Date.now() - startTime 
                };
            }

            // No fullPrompt - agent needs migration
            // Run: npx convex run agents:rebuildAllPrompts
            logger.error('⚠️ Agent missing fullPrompt field - run migration', { 
                agentId, 
                agentName: agent.name,
                fix: 'Run: npx convex run agents:rebuildAllPrompts'
            });
            
            // Return basic prompt from systemPrompt field as fallback
            // This keeps the agent working but without the full formatting
            return { 
                prompt: agent.systemPrompt || null, 
                source: 'missing', 
                latencyMs: Date.now() - startTime 
            };

        } catch (error) {
            logger.error(`Failed to get cached prompt: ${agentId}`, error as Error);
            throw error;
        }
    }

    /**
     * Clear prompt cache for a specific agent
     */
    clearPromptCache(agentId: string): void {
        // Clear all entries for this agent (any updatedAt timestamp)
        for (const key of this.promptCache.keys()) {
            if (key.startsWith(`${agentId}:`)) {
                this.promptCache.delete(key);
            }
        }
        logger.debug(`Cleared prompt cache for agent: ${agentId}`);
    }

    /**
     * Clear all prompt caches (use when domain templates change)
     */
    clearAllPromptCache(): void {
        this.promptCache.clear();
        logger.debug('Cleared all prompt caches');
    }

    /**
     * Get cache statistics for monitoring
     */
    getCacheStats(): { configCacheSize: number; promptCacheSize: number } {
        return {
            configCacheSize: this.configCache.size,
            promptCacheSize: this.promptCache.size,
        };
    }

    /**
     * Parse agent document into config data
     */
    private parseAgentConfig(agent: any): AgentConfigData {
        // Parse JSON config (for voice, pace, and future settings)
        let rawConfig: Record<string, any> = {};
        if (agent.config) {
            try {
                rawConfig = JSON.parse(agent.config);
            } catch (e) {
                logger.warning(`Failed to parse agent config JSON: ${agent._id}`);
            }
        }

        // Determine domain type
        const domainType = this.detectDomainType(rawConfig, agent);

        // Get domain defaults
        const domainDefaults = this.domainRegistry.getDomain(domainType);

        // Get language from direct column first, fallback to config
        const languageCode = agent.language || rawConfig.language || 'en-IN';
        const normalizedLanguage = LANGUAGE_CODES[languageCode] || languageCode;
        const languageName = LANGUAGE_NAMES[languageCode] || 'English';

        // Build config - prefer direct columns over rawConfig
        return {
            id: agent._id,
            organizationId: agent.organizationId,
            name: agent.name,
            role: agent.role,
            aiPersonaName: agent.aiPersonaName, // For spoken introduction
            systemPrompt: agent.systemPrompt,
            voice: this.parseVoiceConfig(rawConfig.voice),
            language: normalizedLanguage,
            languageName,
            supportedLanguages: rawConfig.supportedLanguages || [normalizedLanguage],
            greeting: agent.greeting, // Direct column (spoken when call begins)
            farewell: agent.farewell, // Direct column (spoken when call ends)
            domainType,
            customInstructions: rawConfig.customInstructions,
            maxConcurrentCalls: agent.maxConcurrentCalls ?? 5,
            monthlyCallLimit: agent.monthlyCallLimit ?? 1000,
            enableContextualEnrichment: agent.enableContextualEnrichment ?? true,
            rawConfig,
        };
    }

    /**
     * Parse voice config from raw config
     */
    private parseVoiceConfig(voiceRaw?: any): VoiceConfig | undefined {
        if (!voiceRaw) return undefined;

        return {
            voiceId: voiceRaw.voiceId,
            model: voiceRaw.model,
            speed: voiceRaw.speed,
            pitch: voiceRaw.pitch,
            tone: voiceRaw.tone,
        };
    }

    /**
     * Detect domain type from config or content
     */
    private detectDomainType(rawConfig: Record<string, any>, agent: any): DomainType {
        // Check for explicit domain type (support both 'domain' and 'domainType' keys)
        const explicitDomain = rawConfig.domain || rawConfig.domainType;
        if (explicitDomain && Object.values(DomainType).includes(explicitDomain)) {
            logger.info('Using explicit domain type from config', { domain: explicitDomain });
            return explicitDomain as DomainType;
        }

        // Auto-detect from content
        const textToAnalyze = [
            agent.name,
            agent.role,
            agent.systemPrompt,
            rawConfig.businessType,
            rawConfig.industry,
        ].filter(Boolean).join(' ');

        const detected = this.domainRegistry.detectDomain(textToAnalyze);
        // Silent - reduce noise
        // logger.info('Auto-detected domain type', { detected, textPreview: textToAnalyze.substring(0, 50) });
        return detected;
    }

    /**
     * Validate agent configuration
     */
    validateConfig(agentConfig: AgentConfigData): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!agentConfig.name) {
            errors.push('Agent name is required');
        }

        if (!agentConfig.systemPrompt) {
            errors.push('System prompt is required');
        }

        if (!agentConfig.language) {
            errors.push('Language is required');
        }

        // Validate language code
        if (!LANGUAGE_CODES[agentConfig.language]) {
            errors.push(`Unsupported language: ${agentConfig.language}`);
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Clear config cache
     */
    clearCache(agentId?: string): void {
        if (agentId) {
            this.configCache.delete(agentId);
        } else {
            this.configCache.clear();
        }
    }
}

// Singleton instance
let serviceInstance: AgentConfigService | null = null;

/**
 * Get the agent config service singleton
 */
export function getAgentConfigService(): AgentConfigService {
    if (!serviceInstance) {
        serviceInstance = new AgentConfigService();
    }
    return serviceInstance;
}

export default AgentConfigService;
