/**
 * Convex Client - Pure HTTP wrapper for Convex backend operations
 * 
 * PRODUCTION APPROACH: Uses direct HTTP API calls instead of SDK imports.
 * This matches the Python implementation and avoids TypeScript compilation issues.
 * 
 * Benefits:
 * - No import chain from convex folder
 * - Predictable latency (~50-100ms per call)
 * - Easy caching at HTTP layer
 * - Simpler monolithic deployment
 * 
 * Provides:
 * - Singleton client instance
 * - Query/mutation/action helpers via HTTP
 * - Error handling and retries with exponential backoff
 * - Connection pooling via fetch (keep-alive)
 */

import { logger } from './logging.js';

/**
 * Convex API response structure
 */
interface ConvexResponse<T = any> {
    status?: 'success' | 'error';
    value?: T;
    errorMessage?: string;
    errorData?: any;
}

/**
 * Configuration for Convex client
 */
interface ConvexClientConfig {
    url: string;
    deployKey?: string;
    maxRetries?: number;
    retryDelayMs?: number;
    timeout?: number;
}

/**
 * Pure HTTP Convex client - Production ready, low latency
 * Matches Python implementation pattern for consistency
 */
export class ConvexClient {
    private baseUrl: string;
    private deployKey?: string;
    private maxRetries: number;
    private retryDelayMs: number;
    private timeout: number;

    constructor(config: ConvexClientConfig) {
        if (!config.url) {
            throw new Error('CONVEX_URL is required');
        }

        // Normalize URL (remove trailing slash)
        this.baseUrl = config.url.replace(/\/$/, '');
        this.deployKey = config.deployKey;
        this.maxRetries = config.maxRetries ?? 3;
        this.retryDelayMs = config.retryDelayMs ?? 500; // Start with 500ms for voice latency
        this.timeout = config.timeout ?? 10000; // 10s timeout

        // Silent - reduce noise
        // logger.info('ConvexClient initialized (HTTP mode)', { url: this.baseUrl });
    }

    /**
     * Build headers for Convex requests
     */
    private getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        
        if (this.deployKey) {
            headers['Authorization'] = `Convex ${this.deployKey}`;
        }
        
        return headers;
    }

    /**
     * Execute a Convex query via HTTP
     * 
     * @param functionPath - Function path like "agents:get" or "callSessions:getBySessionId"
     * @param args - Arguments to pass to the function
     */
    async query<T = any>(functionPath: string, args: Record<string, any> = {}): Promise<T> {
        return this.executeWithRetry<T>(
            () => this.httpCall<T>('/api/query', functionPath, args),
            'query',
            functionPath
        );
    }

    /**
     * Execute a Convex mutation via HTTP
     * 
     * @param functionPath - Function path like "callSessions:create"
     * @param args - Arguments to pass to the function
     */
    async mutation<T = any>(functionPath: string, args: Record<string, any> = {}): Promise<T> {
        return this.executeWithRetry<T>(
            () => this.httpCall<T>('/api/mutation', functionPath, args),
            'mutation',
            functionPath
        );
    }

    /**
     * Execute a Convex action via HTTP
     * Actions are used for operations that need side effects like vector search
     * 
     * @param functionPath - Function path like "rag:search"
     * @param args - Arguments to pass to the function
     * @param customTimeout - Optional timeout in milliseconds (overrides default)
     */
    async action<T = any>(functionPath: string, args: Record<string, any> = {}, customTimeout?: number): Promise<T> {
        return this.executeWithRetry<T>(
            () => this.httpCall<T>('/api/action', functionPath, args, customTimeout),
            'action',
            functionPath
        );
    }

    /**
     * Internal HTTP call to Convex API
     */
    private async httpCall<T>(
        endpoint: string,
        functionPath: string,
        args: Record<string, any>,
        customTimeout?: number
    ): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const timeoutMs = customTimeout ?? this.timeout;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    path: functionPath,
                    args,
                    format: 'json',
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data: ConvexResponse<T> = await response.json();

            if (data.status === 'error') {
                const errorMsg = data.errorMessage || 'Unknown Convex error';
                logger.error(`Convex error: ${errorMsg}`, { functionPath, errorData: data.errorData });
                throw new Error(errorMsg);
            }

            return data.value as T;
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error instanceof Error && error.name === 'AbortError') {
                const timeoutMs = customTimeout ?? this.timeout;
                throw new Error(`Convex request timeout after ${timeoutMs}ms`);
            }
            throw error;
        }
    }

    /**
     * Execute with retry logic and exponential backoff
     * Optimized for voice latency - starts with shorter delays
     */
    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        operationType: string,
        functionPath: string
    ): Promise<T> {
        let lastError: Error | undefined;
        const startTime = Date.now();

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const result = await operation();
                
                // Log latency for monitoring
                const latencyMs = Date.now() - startTime;
                if (latencyMs > 500) {
                    logger.warning(`Slow Convex ${operationType}: ${functionPath} took ${latencyMs}ms`);
                }
                
                return result;
            } catch (error) {
                lastError = error as Error;
                
                logger.warning(`Convex ${operationType} failed (attempt ${attempt}/${this.maxRetries})`, {
                    function: functionPath,
                    error: lastError.message,
                });

                if (attempt < this.maxRetries) {
                    // Exponential backoff: 500ms, 1000ms, 2000ms
                    const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
                    await this.sleep(delay);
                }
            }
        }

        const totalLatency = Date.now() - startTime;
        logger.error(`Convex ${operationType} failed after ${this.maxRetries} attempts (${totalLatency}ms)`, {
            function: functionPath,
            error: lastError?.message,
        });
        throw lastError;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================
// Singleton Instance
// ============================================

let convexClientInstance: ConvexClient | null = null;

/**
 * Get or create the Convex client singleton
 */
export function getConvexClient(): ConvexClient {
    if (!convexClientInstance) {
        const convexUrl = process.env.CONVEX_URL;
        
        if (!convexUrl) {
            throw new Error(
                'CONVEX_URL environment variable is not set. ' +
                'Run `npx convex dev` to get your deployment URL.'
            );
        }

        convexClientInstance = new ConvexClient({
            url: convexUrl,
            deployKey: process.env.CONVEX_DEPLOY_KEY,
            maxRetries: 3,
            retryDelayMs: 500,  // Start with 500ms for voice latency
            timeout: 10000,
        });
    }

    return convexClientInstance;
}

/**
 * Check if Convex is configured
 */
export function isConvexConfigured(): boolean {
    return !!process.env.CONVEX_URL;
}

/**
 * Reset the client (useful for testing)
 */
export function resetConvexClient(): void {
    convexClientInstance = null;
}
