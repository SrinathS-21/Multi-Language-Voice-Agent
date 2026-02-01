/**
 * OpenAI API Error Handler
 * 
 * Provides comprehensive error handling for OpenAI API calls including:
 * - Rate limit detection and exponential backoff
 * - Authentication error handling
 * - Retry logic with configurable attempts
 * - User-friendly error messages
 * - Health monitoring integration
 */

import { logger } from '../core/logging.js';
import { openaiHealthMonitor } from './openai-health-monitor.js';

export interface OpenAIErrorContext {
  operation: string;
  attempt?: number;
  maxRetries?: number;
}

export interface ErrorHandlerResult {
  shouldRetry: boolean;
  retryAfterMs?: number;
  userMessage?: string;
  isRateLimitError?: boolean;
  isAuthError?: boolean;
}

/**
 * Analyze OpenAI API error and determine retry strategy
 */
export async function handleOpenAIError(
  error: any,
  context: OpenAIErrorContext
): Promise<ErrorHandlerResult> {
  const status = error.status || error.statusCode || error.response?.status;
  const attempt = context.attempt || 0;
  const maxRetries = context.maxRetries || 3;
  
  // Rate limit (429)
  if (status === 429) {
    openaiHealthMonitor.recordFailure('rate_limit', 'Rate limit exceeded');
    
    const retryAfter = error.headers?.get?.('retry-after') || 
                       error.response?.headers?.['retry-after'] ||
                       error.response?.headers?.['Retry-After'];
    const retryMs = retryAfter 
      ? parseInt(retryAfter) * 1000 
      : Math.min(1000 * Math.pow(2, attempt), 32000);
    
    logger.warning('🚦 OpenAI API rate limit exceeded', {
      operation: context.operation,
      attempt: attempt + 1,
      maxRetries,
      retryAfterMs: retryMs,
      retryAfterSec: Math.round(retryMs / 1000),
    });
    
    return {
      shouldRetry: attempt < maxRetries,
      retryAfterMs: retryMs,
      userMessage: 'I\'m experiencing high demand right now. Please bear with me for a moment.',
      isRateLimitError: true,
    };
  }
  
  // Server errors (5xx) - transient, should retry
  if (status >= 500 && status < 600) {
    openaiHealthMonitor.recordFailure('server', `Server error ${status}`);
    
    const retryMs = Math.min(1000 * Math.pow(2, attempt), 16000);
    
    logger.warning('🔧 OpenAI API server error', {
      operation: context.operation,
      status,
      attempt: attempt + 1,
      maxRetries,
      retryAfterMs: retryMs,
    });
    
    return {
      shouldRetry: attempt < maxRetries,
      retryAfterMs: retryMs,
      userMessage: attempt < maxRetries 
        ? undefined 
        : 'I\'m having temporary connectivity issues. Let me continue helping you with what I can.',
    };
  }
  
  // Authentication errors (401, 403) - don't retry
  if (status === 401 || status === 403) {
    openaiHealthMonitor.recordFailure('auth', `Authentication failed: ${status}`);
    
    logger.error('🔐 OpenAI API authentication failed', {
      operation: context.operation,
      status,
      message: status === 401 
        ? 'API key is invalid or expired' 
        : 'API key lacks required permissions or account has insufficient credits',
      hint: 'Check OPENAI_API_KEY and account billing status',
    });
    
    return {
      shouldRetry: false,
      userMessage: 'I\'m having trouble accessing my knowledge system. Our technical team has been notified. I\'ll continue helping you with the information I have.',
      isAuthError: true,
    };
  }
  
  // Bad request (400) - don't retry
  if (status === 400) {
    openaiHealthMonitor.recordFailure('other', 'Bad request');
    
    logger.error('❌ OpenAI API bad request', {
      operation: context.operation,
      status,
      error: error.message || String(error),
    });
    
    return {
      shouldRetry: false,
      userMessage: 'I encountered an issue processing that request. Let me try a different approach.',
    };
  }
  
  // Network or unknown errors
  openaiHealthMonitor.recordFailure('other', error.message || String(error));
  
  logger.error('⚠️ OpenAI API error', {
    operation: context.operation,
    error: error.message || String(error),
    status: status || 'unknown',
    attempt: attempt + 1,
  });
  
  return {
    shouldRetry: attempt < maxRetries && !status, // Only retry network errors
    retryAfterMs: Math.min(2000 * Math.pow(2, attempt), 10000),
    userMessage: 'I encountered a technical issue. Let me continue helping you.',
  };
}

/**
 * Fetch with automatic retry logic and exponential backoff
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  context: OpenAIErrorContext
): Promise<Response> {
  let lastError: any;
  const maxRetries = context.maxRetries || 3;
  const startTime = Date.now();
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      const responseTime = Date.now() - startTime;
      
      // Success - return immediately
      if (response.ok) {
        openaiHealthMonitor.recordSuccess(responseTime);
        
        if (attempt > 0) {
          logger.info('✅ OpenAI API request succeeded after retry', {
            operation: context.operation,
            attempt: attempt + 1,
            totalAttempts: attempt + 1,
          });
        }
        return response;
      }
      
      // Handle error response
      const errorHandler = await handleOpenAIError(
        { status: response.status, response },
        { ...context, attempt }
      );
      
      // Don't retry if handler says so, or if this is the last attempt
      if (!errorHandler.shouldRetry || attempt === maxRetries - 1) {
        logger.warning('🛑 OpenAI API request failed - not retrying', {
          operation: context.operation,
          status: response.status,
          attempt: attempt + 1,
          reason: !errorHandler.shouldRetry ? 'non-retryable error' : 'max retries exceeded',
        });
        return response; // Return error response for caller to handle
      }
      
      // Wait before retry
      if (errorHandler.retryAfterMs) {
        logger.info('⏳ Waiting before retry', {
          operation: context.operation,
          attempt: attempt + 1,
          waitMs: errorHandler.retryAfterMs,
          nextAttempt: attempt + 2,
        });
        await new Promise(resolve => setTimeout(resolve, errorHandler.retryAfterMs));
      }
      
      lastError = { status: response.status };
      
    } catch (error) {
      lastError = error;
      
      const errorHandler = await handleOpenAIError(
        error,
        { ...context, attempt }
      );
      
      // Don't retry if handler says so, or if this is the last attempt
      if (!errorHandler.shouldRetry || attempt === maxRetries - 1) {
        logger.error('🛑 OpenAI API request failed with exception', {
          operation: context.operation,
          error: (error as Error).message,
          attempt: attempt + 1,
        });
        throw error;
      }
      
      // Wait before retry
      const waitMs = errorHandler.retryAfterMs || 1000 * Math.pow(2, attempt);
      logger.info('⏳ Retrying after exception', {
        operation: context.operation,
        attempt: attempt + 1,
        waitMs,
        nextAttempt: attempt + 2,
      });
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  
  // Should not reach here, but just in case
  throw lastError || new Error(`Max retries (${maxRetries}) exceeded for ${context.operation}`);
}

/**
 * Check if OpenAI API key is configured
 */
export function validateOpenAIKey(): { isValid: boolean; error?: string } {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    return {
      isValid: false,
      error: 'OPENAI_API_KEY environment variable not set',
    };
  }
  
  if (!apiKey.startsWith('sk-')) {
    return {
      isValid: false,
      error: 'OPENAI_API_KEY appears to be invalid (should start with sk-)',
    };
  }
  
  if (apiKey.length < 20) {
    return {
      isValid: false,
      error: 'OPENAI_API_KEY appears to be invalid (too short)',
    };
  }
  
  return { isValid: true };
}

/**
 * Create headers for OpenAI API requests with proper authentication
 */
export function createOpenAIHeaders(): HeadersInit {
  const validation = validateOpenAIKey();
  
  if (!validation.isValid) {
    logger.error('OpenAI API key validation failed', { error: validation.error });
    throw new Error(validation.error);
  }
  
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
  };
}
