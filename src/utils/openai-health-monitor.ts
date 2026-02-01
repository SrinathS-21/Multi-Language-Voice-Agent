/**
 * OpenAI API Health Monitor
 * 
 * Tracks API health metrics and provides real-time status information
 */

import { logger } from '../core/logging.js';

interface HealthMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitErrors: number;
  authErrors: number;
  serverErrors: number;
  lastErrorTime?: Date;
  lastErrorMessage?: string;
  consecutiveFailures: number;
  averageResponseTimeMs: number;
}

class OpenAIHealthMonitor {
  private metrics: HealthMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitErrors: 0,
    authErrors: 0,
    serverErrors: 0,
    consecutiveFailures: 0,
    averageResponseTimeMs: 0,
  };

  private responseTimes: number[] = [];
  private readonly MAX_RESPONSE_TIME_SAMPLES = 100;
  private readonly DEGRADED_THRESHOLD = 0.2; // 20% failure rate
  private readonly CRITICAL_THRESHOLD = 0.5; // 50% failure rate

  /**
   * Record a successful API request
   */
  recordSuccess(responseTimeMs: number): void {
    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.metrics.consecutiveFailures = 0;

    // Track response time
    this.responseTimes.push(responseTimeMs);
    if (this.responseTimes.length > this.MAX_RESPONSE_TIME_SAMPLES) {
      this.responseTimes.shift();
    }

    // Update average
    this.metrics.averageResponseTimeMs =
      this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }

  /**
   * Record a failed API request
   */
  recordFailure(errorType: 'rate_limit' | 'auth' | 'server' | 'other', errorMessage: string): void {
    this.metrics.totalRequests++;
    this.metrics.failedRequests++;
    this.metrics.consecutiveFailures++;
    this.metrics.lastErrorTime = new Date();
    this.metrics.lastErrorMessage = errorMessage;

    switch (errorType) {
      case 'rate_limit':
        this.metrics.rateLimitErrors++;
        break;
      case 'auth':
        this.metrics.authErrors++;
        break;
      case 'server':
        this.metrics.serverErrors++;
        break;
    }

    // Log warning if consecutive failures exceed threshold
    if (this.metrics.consecutiveFailures >= 3) {
      logger.warning('⚠️ OpenAI API experiencing consecutive failures', {
        consecutiveFailures: this.metrics.consecutiveFailures,
        lastError: errorMessage,
        healthStatus: this.getHealthStatus(),
      });
    }

    // Log critical error if auth failures detected
    if (errorType === 'auth') {
      logger.error('🔐 OpenAI API authentication failed - check API key and billing', {
        totalAuthErrors: this.metrics.authErrors,
        suggestion: 'Visit https://platform.openai.com/account/billing',
      });
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): 'healthy' | 'degraded' | 'critical' | 'unknown' {
    if (this.metrics.totalRequests === 0) {
      return 'unknown';
    }

    const failureRate = this.metrics.failedRequests / this.metrics.totalRequests;

    if (this.metrics.authErrors > 0) {
      return 'critical'; // Auth errors are critical
    }

    if (failureRate >= this.CRITICAL_THRESHOLD) {
      return 'critical';
    }

    if (failureRate >= this.DEGRADED_THRESHOLD || this.metrics.consecutiveFailures >= 2) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Get detailed metrics
   */
  getMetrics(): HealthMetrics & { failureRate: number; healthStatus: string } {
    const failureRate =
      this.metrics.totalRequests > 0
        ? this.metrics.failedRequests / this.metrics.totalRequests
        : 0;

    return {
      ...this.metrics,
      failureRate: Math.round(failureRate * 100) / 100,
      healthStatus: this.getHealthStatus(),
    };
  }

  /**
   * Get user-friendly status message
   */
  getStatusMessage(): string {
    const status = this.getHealthStatus();

    switch (status) {
      case 'healthy':
        return 'All systems operational';
      case 'degraded':
        return 'Experiencing some delays. Please be patient.';
      case 'critical':
        if (this.metrics.authErrors > 0) {
          return 'System configuration issue detected. Our team has been notified.';
        }
        return 'Experiencing significant issues. Our team is working on it.';
      case 'unknown':
        return 'System starting up';
    }
  }

  /**
   * Reset metrics (for testing or periodic resets)
   */
  reset(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitErrors: 0,
      authErrors: 0,
      serverErrors: 0,
      consecutiveFailures: 0,
      averageResponseTimeMs: 0,
    };
    this.responseTimes = [];
  }

  /**
   * Log periodic health report
   */
  logHealthReport(): void {
    const metrics = this.getMetrics();

    if (metrics.totalRequests === 0) {
      return; // Don't log if no requests made
    }

    const logLevel = metrics.healthStatus === 'critical' ? 'error' : 
                     metrics.healthStatus === 'degraded' ? 'warning' : 'info';

    logger[logLevel]('📊 OpenAI API Health Report', {
      status: metrics.healthStatus,
      totalRequests: metrics.totalRequests,
      successRate: `${Math.round((metrics.successfulRequests / metrics.totalRequests) * 100)}%`,
      failureRate: `${Math.round(metrics.failureRate * 100)}%`,
      rateLimitErrors: metrics.rateLimitErrors,
      authErrors: metrics.authErrors,
      serverErrors: metrics.serverErrors,
      consecutiveFailures: metrics.consecutiveFailures,
      avgResponseTime: `${Math.round(metrics.averageResponseTimeMs)}ms`,
      lastError: metrics.lastErrorMessage
        ? `${metrics.lastErrorMessage.substring(0, 100)}...`
        : 'none',
    });
  }
}

// Singleton instance
export const openaiHealthMonitor = new OpenAIHealthMonitor();

// Log health report every 5 minutes
setInterval(() => {
  openaiHealthMonitor.logHealthReport();
}, 5 * 60 * 1000);
