/**
 * Latency Tracker - High-precision latency measurement for voice pipeline
 * 
 * Measures latency at each stage of the voice pipeline:
 * 1. SIP Connection (trunk → room)
 * 2. VAD Detection (audio → speech detected)
 * 3. STT (speech → text)
 * 4. LLM (text → response)
 * 5. TTS (response → audio)
 * 6. End-to-End (user stops speaking → agent starts speaking)
 * 
 * Provides:
 * - Real-time measurements
 * - Histogram statistics (min, max, avg, p50, p95, p99)
 * - Target breach alerting
 * - Session-level aggregation
 */

import { EventEmitter } from 'events';
import { logger } from '../core/logging.js';
import { telephonyConfig, getLatencyTarget } from './config.js';
import { LatencyMeasurement, SessionLatencyStats } from './types.js';

/**
 * Latency operation types with their targets
 */
export enum LatencyOperation {
  // SIP/Telephony specific
  SIP_CONNECT = 'sip_connect',
  SIP_MEDIA_START = 'sip_media_start',
  
  // Voice Activity Detection
  VAD_SPEECH_START = 'vad_speech_start',
  VAD_SPEECH_END = 'vad_speech_end',
  
  // Speech-to-Text
  STT_FIRST_TOKEN = 'stt_first_token',
  STT_COMPLETE = 'stt_complete',
  
  // LLM Processing
  LLM_FIRST_TOKEN = 'llm_first_token',
  LLM_COMPLETE = 'llm_complete',
  
  // Text-to-Speech
  TTS_FIRST_CHUNK = 'tts_first_chunk',
  TTS_COMPLETE = 'tts_complete',
  
  // End-to-End measurements
  E2E_USER_TO_AGENT = 'e2e_user_to_agent',
  E2E_FULL_TURN = 'e2e_full_turn',
  
  // Function calling
  FUNCTION_CALL = 'function_call',
  RAG_SEARCH = 'rag_search',
}

/**
 * Get target latency for an operation
 */
function getOperationTarget(operation: LatencyOperation): number {
  const targetMap: Record<LatencyOperation, number> = {
    [LatencyOperation.SIP_CONNECT]: telephonyConfig.latencyTargets.sipConnect,
    [LatencyOperation.SIP_MEDIA_START]: telephonyConfig.latencyTargets.sipConnect,
    [LatencyOperation.VAD_SPEECH_START]: 50,
    [LatencyOperation.VAD_SPEECH_END]: 50,
    [LatencyOperation.STT_FIRST_TOKEN]: telephonyConfig.latencyTargets.sttFirstToken,
    [LatencyOperation.STT_COMPLETE]: telephonyConfig.latencyTargets.sttComplete,
    [LatencyOperation.LLM_FIRST_TOKEN]: telephonyConfig.latencyTargets.llmFirstToken,
    [LatencyOperation.LLM_COMPLETE]: telephonyConfig.latencyTargets.llmComplete,
    [LatencyOperation.TTS_FIRST_CHUNK]: telephonyConfig.latencyTargets.ttsFirstChunk,
    [LatencyOperation.TTS_COMPLETE]: telephonyConfig.latencyTargets.ttsComplete,
    [LatencyOperation.E2E_USER_TO_AGENT]: telephonyConfig.latencyTargets.e2eResponse,
    [LatencyOperation.E2E_FULL_TURN]: 3000,
    [LatencyOperation.FUNCTION_CALL]: 500,
    [LatencyOperation.RAG_SEARCH]: 300,
  };
  
  return targetMap[operation] || 1000;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, index)];
}

/**
 * Active timing context for measuring a single operation
 */
interface TimingContext {
  operation: LatencyOperation;
  startTime: number;
  metadata?: Record<string, any>;
}

/**
 * Latency Tracker for a single session
 */
export class LatencyTracker extends EventEmitter {
  private sessionId: string;
  private callType: 'web' | 'inbound' | 'outbound';
  private isSIPCall: boolean;
  private measurements: LatencyMeasurement[] = [];
  private activeTimings: Map<string, TimingContext> = new Map();
  private startedAt: number;
  private e2eMeasurements: number[] = [];
  
  // Track turn-level timing
  private currentTurnStart?: number;
  private userSpeechEndTime?: number;
  
  constructor(
    sessionId: string,
    options?: {
      callType?: 'web' | 'inbound' | 'outbound';
      isSIPCall?: boolean;
    }
  ) {
    super();
    this.sessionId = sessionId;
    this.callType = options?.callType || 'web';
    this.isSIPCall = options?.isSIPCall || false;
    this.startedAt = performance.now();
    
    logger.debug('LatencyTracker initialized', {
      sessionId,
      callType: this.callType,
      isSIPCall: this.isSIPCall,
    });
  }

  /**
   * Start timing an operation
   * Returns a unique key that must be used to end the timing
   */
  startTiming(operation: LatencyOperation, metadata?: Record<string, any>): string {
    const key = `${operation}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    
    this.activeTimings.set(key, {
      operation,
      startTime: performance.now(),
      metadata,
    });
    
    logger.debug('Latency timing started', {
      sessionId: this.sessionId,
      operation,
      key,
    });
    
    return key;
  }

  /**
   * End timing for an operation
   */
  endTiming(key: string): LatencyMeasurement | null {
    const context = this.activeTimings.get(key);
    if (!context) {
      logger.warning('Attempted to end timing for unknown key', { key });
      return null;
    }
    
    this.activeTimings.delete(key);
    
    const endTime = performance.now();
    const durationMs = endTime - context.startTime;
    const targetMs = getOperationTarget(context.operation);
    const exceededTarget = durationMs > targetMs;
    
    const measurement: LatencyMeasurement = {
      operation: context.operation,
      startTime: context.startTime,
      endTime,
      durationMs,
      exceededTarget,
      targetMs,
    };
    
    this.measurements.push(measurement);
    
    // Log with appropriate level based on target breach
    const logLevel = exceededTarget ? 'warn' : 'debug';
    logger[logLevel === 'warn' ? 'warning' : 'debug']('Latency measurement recorded', {
      sessionId: this.sessionId,
      operation: context.operation,
      durationMs: Math.round(durationMs * 100) / 100,
      targetMs,
      exceededTarget,
      metadata: context.metadata,
    });
    
    // Emit event for real-time monitoring
    this.emit('measurement', measurement);
    
    if (exceededTarget) {
      this.emit('target_exceeded', measurement);
    }
    
    return measurement;
  }

  /**
   * Mark the start of a new conversational turn
   */
  markTurnStart(): void {
    this.currentTurnStart = performance.now();
    logger.debug('Turn started', { sessionId: this.sessionId });
  }

  /**
   * Mark when user stops speaking (end of input)
   */
  markUserSpeechEnd(): void {
    this.userSpeechEndTime = performance.now();
    logger.debug('User speech ended', { sessionId: this.sessionId });
  }

  /**
   * Mark when agent starts speaking (measures E2E latency)
   */
  markAgentSpeechStart(): void {
    if (this.userSpeechEndTime) {
      const e2eLatency = performance.now() - this.userSpeechEndTime;
      this.e2eMeasurements.push(e2eLatency);
      
      const targetMs = telephonyConfig.latencyTargets.e2eResponse;
      const exceededTarget = e2eLatency > targetMs;
      
      const measurement: LatencyMeasurement = {
        operation: LatencyOperation.E2E_USER_TO_AGENT,
        startTime: this.userSpeechEndTime,
        endTime: performance.now(),
        durationMs: e2eLatency,
        exceededTarget,
        targetMs,
      };
      
      this.measurements.push(measurement);
      this.emit('measurement', measurement);
      
      if (exceededTarget) {
        this.emit('target_exceeded', measurement);
        logger.warning('E2E latency exceeded target', {
          sessionId: this.sessionId,
          e2eLatencyMs: Math.round(e2eLatency * 100) / 100,
          targetMs,
        });
      } else {
        logger.info('E2E latency recorded', {
          sessionId: this.sessionId,
          e2eLatencyMs: Math.round(e2eLatency * 100) / 100,
          targetMs,
        });
      }
      
      // Reset for next turn
      this.userSpeechEndTime = undefined;
    }
  }

  /**
   * Record a one-shot measurement (when you have start and end times)
   */
  recordMeasurement(
    operation: LatencyOperation,
    durationMs: number,
    metadata?: Record<string, any>
  ): LatencyMeasurement {
    const targetMs = getOperationTarget(operation);
    const exceededTarget = durationMs > targetMs;
    
    const measurement: LatencyMeasurement = {
      operation,
      startTime: performance.now() - durationMs,
      endTime: performance.now(),
      durationMs,
      exceededTarget,
      targetMs,
    };
    
    this.measurements.push(measurement);
    
    logger.debug('Direct latency measurement recorded', {
      sessionId: this.sessionId,
      operation,
      durationMs: Math.round(durationMs * 100) / 100,
      targetMs,
      exceededTarget,
      metadata,
    });
    
    this.emit('measurement', measurement);
    
    if (exceededTarget) {
      this.emit('target_exceeded', measurement);
    }
    
    return measurement;
  }

  /**
   * Get statistics for a specific operation
   */
  getOperationStats(operation: LatencyOperation): {
    count: number;
    minMs: number;
    maxMs: number;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    targetMs: number;
    exceededCount: number;
  } {
    const opMeasurements = this.measurements.filter(m => m.operation === operation);
    
    if (opMeasurements.length === 0) {
      return {
        count: 0,
        minMs: 0,
        maxMs: 0,
        avgMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        targetMs: getOperationTarget(operation),
        exceededCount: 0,
      };
    }
    
    const durations = opMeasurements.map(m => m.durationMs).sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    
    return {
      count: durations.length,
      minMs: Math.round(durations[0] * 100) / 100,
      maxMs: Math.round(durations[durations.length - 1] * 100) / 100,
      avgMs: Math.round((sum / durations.length) * 100) / 100,
      p50Ms: Math.round(percentile(durations, 50) * 100) / 100,
      p95Ms: Math.round(percentile(durations, 95) * 100) / 100,
      p99Ms: Math.round(percentile(durations, 99) * 100) / 100,
      targetMs: getOperationTarget(operation),
      exceededCount: opMeasurements.filter(m => m.exceededTarget).length,
    };
  }

  /**
   * Get full session latency statistics
   */
  getSessionStats(): SessionLatencyStats {
    // Get unique operations that have measurements
    const operations = [...new Set(this.measurements.map(m => m.operation))];
    
    // Build summary for each operation
    const summary: SessionLatencyStats['summary'] = {};
    for (const op of operations) {
      summary[op] = this.getOperationStats(op as LatencyOperation);
    }
    
    // E2E latency stats
    const sortedE2E = [...this.e2eMeasurements].sort((a, b) => a - b);
    const e2eSum = sortedE2E.reduce((a, b) => a + b, 0);
    
    return {
      sessionId: this.sessionId,
      callType: this.callType,
      isSIPCall: this.isSIPCall,
      measurements: this.measurements,
      summary,
      e2eLatency: {
        minMs: sortedE2E.length > 0 ? Math.round(sortedE2E[0] * 100) / 100 : 0,
        maxMs: sortedE2E.length > 0 ? Math.round(sortedE2E[sortedE2E.length - 1] * 100) / 100 : 0,
        avgMs: sortedE2E.length > 0 ? Math.round((e2eSum / sortedE2E.length) * 100) / 100 : 0,
        measurements: sortedE2E.map(v => Math.round(v * 100) / 100),
      },
      startedAt: this.startedAt,
      updatedAt: performance.now(),
    };
  }

  /**
   * Log a summary of latency stats (for end of session)
   */
  logSummary(): void {
    const stats = this.getSessionStats();
    
    logger.info('Session latency summary', {
      sessionId: this.sessionId,
      callType: this.callType,
      isSIPCall: this.isSIPCall,
      totalMeasurements: stats.measurements.length,
      e2eLatency: stats.e2eLatency,
      summary: stats.summary,
    });
    
    // Log any operations that frequently exceeded targets
    for (const [op, opStats] of Object.entries(stats.summary)) {
      if (opStats.exceededCount > 0) {
        const exceededPercentage = (opStats.exceededCount / opStats.count) * 100;
        if (exceededPercentage > 10) {
          logger.warning('Operation frequently exceeded latency target', {
            operation: op,
            exceededPercentage: Math.round(exceededPercentage),
            exceededCount: opStats.exceededCount,
            totalCount: opStats.count,
            targetMs: opStats.targetMs,
            avgMs: opStats.avgMs,
            p95Ms: opStats.p95Ms,
          });
        }
      }
    }
  }

  /**
   * Export measurements for external analytics
   */
  exportMeasurements(): LatencyMeasurement[] {
    return [...this.measurements];
  }

  /**
   * Flush measurements to database (Convex)
   * Call this at end of session to persist all metrics
   */
  async flushToDatabase(organizationId: string, agentId?: string): Promise<void> {
    if (this.measurements.length === 0) {
      logger.debug('No latency measurements to flush', { sessionId: this.sessionId });
      return;
    }

    try {
      const { getConvexClient, isConvexConfigured } = await import('../core/convex-client.js');
      
      if (!isConvexConfigured()) {
        logger.warning('Convex not configured - latency metrics not persisted', {
          sessionId: this.sessionId,
          measurementCount: this.measurements.length,
        });
        return;
      }

      const convex = getConvexClient();
      
      // Prepare metrics batch for database
      const metrics = this.measurements.map(m => ({
        sessionId: this.sessionId,
        organizationId,
        agentId,
        metricType: 'latency' as const,
        metricName: m.operation,
        value: m.durationMs,
        unit: 'ms',
        metadata: JSON.stringify({
          exceededTarget: m.exceededTarget,
          targetMs: m.targetMs,
          callType: this.callType,
          isSIPCall: this.isSIPCall,
          timestamp: m.endTime, // Store original timestamp in metadata
        }),
      }));

      // Save batch to callMetrics table
      await convex.mutation('callMetrics:logMetricsBatch', {
        metrics,
      });

      logger.info('Latency metrics flushed to database', {
        sessionId: this.sessionId,
        metricCount: metrics.length,
      });

    } catch (error) {
      logger.error('Failed to flush latency metrics to database', {
        sessionId: this.sessionId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Clear all measurements (for testing/reset)
   */
  reset(): void {
    this.measurements = [];
    this.activeTimings.clear();
    this.e2eMeasurements = [];
    this.currentTurnStart = undefined;
    this.userSpeechEndTime = undefined;
  }
}

/**
 * Create a latency tracker for a session
 */
export function createLatencyTracker(
  sessionId: string,
  options?: {
    callType?: 'web' | 'inbound' | 'outbound';
    isSIPCall?: boolean;
  }
): LatencyTracker {
  return new LatencyTracker(sessionId, options);
}

/**
 * Utility: Measure async function latency
 */
export async function measureLatency<T>(
  tracker: LatencyTracker,
  operation: LatencyOperation,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<{ result: T; latencyMs: number }> {
  const key = tracker.startTiming(operation, metadata);
  
  try {
    const result = await fn();
    const measurement = tracker.endTiming(key);
    return {
      result,
      latencyMs: measurement?.durationMs || 0,
    };
  } catch (error) {
    tracker.endTiming(key);
    throw error;
  }
}
