/**
 * Call Analytics - Per-turn metrics collection and formatted console logging
 * 
 * Purpose: Clean, readable terminal output for call metrics without DB storage
 */

import { logger } from './logging.js';

// ============================================================================
// TYPES
// ============================================================================

interface TurnMetric {
  turnNumber: number;
  timestamp: number;
  
  // Transcriptions
  userText?: string;
  agentText?: string;
  
  // Latencies (ms)
  sttLatencyMs?: number;
  llmLatencyMs?: number;
  llmTtftMs?: number;    // Time to First Token
  ttsLatencyMs?: number;
  ttsTtfbMs?: number;    // Time to First Byte
  totalLatencyMs?: number;
  
  // Token usage
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  cacheHitRate?: number; // 0-100
  
  // Tool calls
  toolCalls?: string[];
  
  // Cost
  estimatedCost?: number;
}

interface SessionSummary {
  sessionId: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  totalTurns: number;
  
  // Aggregate latencies
  avgSttLatencyMs: number;
  minSttLatencyMs: number;
  maxSttLatencyMs: number;
  
  avgLlmLatencyMs: number;
  minLlmLatencyMs: number;
  maxLlmLatencyMs: number;
  
  avgTtsLatencyMs: number;
  minTtsLatencyMs: number;
  maxTtsLatencyMs: number;
  
  avgTotalLatencyMs: number;
  
  // Aggregate tokens
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCachedTokens: number;
  avgCacheHitRate: number;
  
  // Tools
  toolCallCounts: Record<string, number>;
  totalToolCalls: number;
  
  // Cost
  totalEstimatedCost: number;
}

interface AnalyticsConfig {
  // Pricing (GPT-4o-mini default)
  costPerInputToken: number;
  costPerOutputToken: number;
  costPerCachedToken: number;
  
  // Console output
  enablePerTurnLogs: boolean;
  enableSessionSummary: boolean;
  includeTranscriptions: boolean;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: AnalyticsConfig = {
  // GPT-4o-mini pricing (as of Jan 2026)
  costPerInputToken: 0.00000015,    // $0.15 per 1M tokens
  costPerOutputToken: 0.0000006,    // $0.60 per 1M tokens
  costPerCachedToken: 0.000000075,  // $0.075 per 1M tokens
  
  enablePerTurnLogs: true,  // ✅ Shows latency, tokens, cost, RAG chunks per turn
  enableSessionSummary: true,
  includeTranscriptions: true,  // ✅ Shows user/agent speech text
};

// ============================================================================
// TURN METRICS COLLECTOR
// ============================================================================

export class TurnMetricsCollector {
  private sessionId: string;
  private config: AnalyticsConfig;
  private startTime: number;
  private turns: TurnMetric[] = [];
  private currentTurn: Partial<TurnMetric> = {};
  private turnCounter = 0;

  constructor(sessionId: string, config: Partial<AnalyticsConfig> = {}) {
    this.sessionId = sessionId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = Date.now();
  }

  /**
   * Record user speech transcription
   */
  recordUserInput(text: string): void {
    this.currentTurn.userText = text;
  }

  /**
   * Record agent response text
   */
  recordAgentResponse(text: string): void {
    this.currentTurn.agentText = text;
  }

  /**
   * Record metrics from LiveKit MetricsCollected event
   * SDK provides typed metrics: stt_metrics, llm_metrics, tts_metrics, eou_metrics, vad_metrics, realtime_model_metrics
   */
  recordMetrics(metrics: any): void {
    const type = metrics.type;

    // STT Metrics: durationMs, audioDurationMs
    if (type === 'stt_metrics') {
      if (metrics.durationMs !== undefined && metrics.durationMs > 0) {
        this.currentTurn.sttLatencyMs = Math.round(metrics.durationMs);
      }
    }
    
    // LLM Metrics: ttftMs (Time To First Token), durationMs, promptTokens, completionTokens
    else if (type === 'llm_metrics') {
      if (metrics.durationMs !== undefined) {
        this.currentTurn.llmLatencyMs = Math.round(metrics.durationMs);
      }
      if (metrics.ttftMs !== undefined && metrics.ttftMs >= 0) {
        this.currentTurn.llmTtftMs = Math.round(metrics.ttftMs);
      }
      
      // Token usage
      this.currentTurn.inputTokens = metrics.promptTokens || 0;
      this.currentTurn.outputTokens = metrics.completionTokens || 0;
      this.currentTurn.cachedTokens = metrics.promptCachedTokens || 0;
      
      // Calculate cache hit rate
      const totalInput = (this.currentTurn.inputTokens || 0) + (this.currentTurn.cachedTokens || 0);
      if (totalInput > 0) {
        this.currentTurn.cacheHitRate = Math.round(((this.currentTurn.cachedTokens || 0) / totalInput) * 100);
      }
      
      // Calculate cost
      this.currentTurn.estimatedCost = this.calculateCost(
        this.currentTurn.inputTokens || 0,
        this.currentTurn.outputTokens || 0,
        this.currentTurn.cachedTokens || 0
      );
    }
    
    // TTS Metrics: ttfbMs (Time To First Byte), durationMs, audioDurationMs
    else if (type === 'tts_metrics') {
      if (metrics.durationMs !== undefined) {
        this.currentTurn.ttsLatencyMs = Math.round(metrics.durationMs);
      }
      if (metrics.ttfbMs !== undefined && metrics.ttfbMs >= 0) {
        this.currentTurn.ttsTtfbMs = Math.round(metrics.ttfbMs);
      }
    }
    
    // Realtime Model Metrics: ttftMs, durationMs, inputTokens, outputTokens
    else if (type === 'realtime_model_metrics') {
      if (metrics.durationMs !== undefined) {
        this.currentTurn.llmLatencyMs = Math.round(metrics.durationMs);
      }
      if (metrics.ttftMs !== undefined && metrics.ttftMs >= 0) {
        this.currentTurn.llmTtftMs = Math.round(metrics.ttftMs);
      }
      
      // Token usage for realtime model
      this.currentTurn.inputTokens = metrics.inputTokens || 0;
      this.currentTurn.outputTokens = metrics.outputTokens || 0;
      this.currentTurn.cachedTokens = metrics.inputTokenDetails?.cachedTokens || 0;
      
      const totalInput = (this.currentTurn.inputTokens || 0) + (this.currentTurn.cachedTokens || 0);
      if (totalInput > 0) {
        this.currentTurn.cacheHitRate = Math.round(((this.currentTurn.cachedTokens || 0) / totalInput) * 100);
      }
    }

    // Calculate total latency when we have LLM metrics
    this.currentTurn.totalLatencyMs = 
      (this.currentTurn.sttLatencyMs || 0) +
      (this.currentTurn.llmLatencyMs || 0) +
      (this.currentTurn.ttsLatencyMs || 0);

    // Check if turn is complete (has LLM metrics) - commit it
    if ((type === 'llm_metrics' || type === 'realtime_model_metrics') && this.config.enablePerTurnLogs) {
      this.commitTurn();
    }
  }

  /**
   * Record tool calls
   */
  recordToolCalls(toolNames: string[]): void {
    this.currentTurn.toolCalls = toolNames;
  }

  /**
   * Commit current turn and print to console
   */
  private commitTurn(): void {
    this.turnCounter++;
    const turn: TurnMetric = {
      turnNumber: this.turnCounter,
      timestamp: Date.now(),
      ...this.currentTurn,
    };

    this.turns.push(turn);
    this.printTurnLog(turn);
    
    // Reset for next turn
    this.currentTurn = {};
  }

  /**
   * Print formatted turn log
   */
  private printTurnLog(turn: TurnMetric): void {
    const lines: string[] = [];
    
    lines.push('════════════════════════════════════════════════════════════════════════');
    lines.push(`🎤 TURN #${turn.turnNumber} (Session: ${this.sessionId.substring(0, 8)}...)`);
    lines.push('────────────────────────────────────────────────────────────────────────');
    
    // Transcriptions
    if (this.config.includeTranscriptions) {
      if (turn.userText) {
        lines.push(`User: "${turn.userText}"`);
      }
      if (turn.agentText) {
        lines.push(`Agent: "${turn.agentText}"`);
      }
      if (turn.userText || turn.agentText) {
        lines.push('');
      }
    }
    
    // Latency breakdown
    if (turn.sttLatencyMs || turn.llmLatencyMs || turn.ttsLatencyMs) {
      lines.push('⏱️  LATENCY BREAKDOWN:');
      if (turn.sttLatencyMs) {
        lines.push(`  ├─ STT:  ${turn.sttLatencyMs}ms  (Sarvam saarika)`);
      }
      if (turn.llmLatencyMs) {
        const ttftInfo = turn.llmTtftMs !== undefined ? ` [TTFT: ${turn.llmTtftMs}ms]` : '';
        lines.push(`  ├─ LLM:  ${turn.llmLatencyMs}ms${ttftInfo}  (gpt-4o-mini)`);
      }
      if (turn.ttsLatencyMs) {
        const ttfbInfo = turn.ttsTtfbMs !== undefined ? ` [TTFB: ${turn.ttsTtfbMs}ms]` : '';
        lines.push(`  └─ TTS:  ${turn.ttsLatencyMs}ms${ttfbInfo}  (Sarvam bulbul)`);
      }
      lines.push('  ───────────────');
      lines.push(`  TOTAL:  ${turn.totalLatencyMs?.toLocaleString()}ms`);
      lines.push('');
    }
    
    // Token usage
    if (turn.inputTokens !== undefined) {
      lines.push('💰 TOKEN USAGE:');
      lines.push(`  ├─ Input:    ${turn.inputTokens.toLocaleString()} tokens`);
      lines.push(`  ├─ Output:   ${turn.outputTokens?.toLocaleString() || 0} tokens`);
      lines.push(`  └─ Cached:   ${turn.cachedTokens?.toLocaleString() || 0} tokens (${turn.cacheHitRate || 0}% cache hit)`);
      lines.push('  ───────────────────────────');
      lines.push(`  Cost: ~$${turn.estimatedCost?.toFixed(4) || '0.0000'}`);
      lines.push('');
    }
    
    // Tools
    if (turn.toolCalls && turn.toolCalls.length > 0) {
      lines.push(`🔧 TOOLS: ${turn.toolCalls.join(', ')}`);
    } else {
      lines.push('🔧 TOOLS: None');
    }
    
    lines.push('════════════════════════════════════════════════════════════════════════');
    lines.push(''); // Extra blank line
    
    // Print all lines at once (prevents interleaving with other logs)
    console.log(lines.join('\n'));
  }

  /**
   * Print session summary at end of call
   */
  printSessionSummary(): SessionSummary {
    if (!this.config.enableSessionSummary || this.turns.length === 0) {
      return this.buildSessionSummary();
    }

    const summary = this.buildSessionSummary();
    const lines: string[] = [];
    
    lines.push('');
    lines.push('╔════════════════════════════════════════════════════════════════════════╗');
    lines.push('║                     📞 CALL ENDED - SUMMARY                            ║');
    lines.push('╚════════════════════════════════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`Session ID: ${this.sessionId}`);
    lines.push(`Duration:   ${this.formatDuration(summary.durationSeconds)}`);
    lines.push(`Total Turns: ${summary.totalTurns}`);
    lines.push('');
    lines.push('───────────────────────────────────────────────────────────────────────');
    lines.push('AGGREGATE METRICS');
    lines.push('───────────────────────────────────────────────────────────────────────');
    lines.push('⏱️  Average Latencies:');
    lines.push(`  ├─ STT:  ${Math.round(summary.avgSttLatencyMs)}ms  (min: ${summary.minSttLatencyMs}ms | max: ${summary.maxSttLatencyMs}ms)`);
    lines.push(`  ├─ LLM:  ${Math.round(summary.avgLlmLatencyMs)}ms  (min: ${summary.minLlmLatencyMs}ms | max: ${summary.maxLlmLatencyMs}ms)`);
    lines.push(`  └─ TTS:  ${Math.round(summary.avgTtsLatencyMs)}ms  (min: ${summary.minTtsLatencyMs}ms | max: ${summary.maxTtsLatencyMs}ms)`);
    lines.push('  ───────────────────────────────────────────────────');
    lines.push(`  AVG TURN: ${Math.round(summary.avgTotalLatencyMs).toLocaleString()}ms`);
    lines.push('');
    lines.push('💰 Total Token Usage:');
    lines.push(`  ├─ Input:    ${summary.totalInputTokens.toLocaleString()} tokens`);
    lines.push(`  ├─ Output:   ${summary.totalOutputTokens.toLocaleString()} tokens`);
    lines.push(`  └─ Cached:   ${summary.totalCachedTokens.toLocaleString()} tokens (${Math.round(summary.avgCacheHitRate)}% cache hit rate)`);
    lines.push('  ───────────────────────────────────────────────────');
    lines.push(`  Estimated Cost: $${summary.totalEstimatedCost.toFixed(4)}`);
    lines.push('');
    
    // Tool usage
    if (summary.totalToolCalls > 0) {
      lines.push('🔧 Tools Used:');
      Object.entries(summary.toolCallCounts).forEach(([tool, count]) => {
        lines.push(`  ├─ ${tool}: ${count} call${count > 1 ? 's' : ''}`);
      });
      lines.push('');
    }
    
    lines.push('───────────────────────────────────────────────────────────────────────');
    lines.push('');
    
    console.log(lines.join('\n'));
    
    return summary;
  }

  /**
   * Build session summary from turns
   */
  private buildSessionSummary(): SessionSummary {
    const sttLatencies = this.turns.filter(t => t.sttLatencyMs).map(t => t.sttLatencyMs!);
    const llmLatencies = this.turns.filter(t => t.llmLatencyMs).map(t => t.llmLatencyMs!);
    const ttsLatencies = this.turns.filter(t => t.ttsLatencyMs).map(t => t.ttsLatencyMs!);
    const totalLatencies = this.turns.filter(t => t.totalLatencyMs).map(t => t.totalLatencyMs!);
    
    const toolCallCounts: Record<string, number> = {};
    let totalToolCalls = 0;
    
    this.turns.forEach(turn => {
      if (turn.toolCalls) {
        turn.toolCalls.forEach(tool => {
          toolCallCounts[tool] = (toolCallCounts[tool] || 0) + 1;
          totalToolCalls++;
        });
      }
    });

    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: Date.now(),
      durationSeconds: Math.round((Date.now() - this.startTime) / 1000),
      totalTurns: this.turns.length,
      
      avgSttLatencyMs: this.avg(sttLatencies),
      minSttLatencyMs: Math.min(...sttLatencies, 0),
      maxSttLatencyMs: Math.max(...sttLatencies, 0),
      
      avgLlmLatencyMs: this.avg(llmLatencies),
      minLlmLatencyMs: Math.min(...llmLatencies, 0),
      maxLlmLatencyMs: Math.max(...llmLatencies, 0),
      
      avgTtsLatencyMs: this.avg(ttsLatencies),
      minTtsLatencyMs: Math.min(...ttsLatencies, 0),
      maxTtsLatencyMs: Math.max(...ttsLatencies, 0),
      
      avgTotalLatencyMs: this.avg(totalLatencies),
      
      totalInputTokens: this.turns.reduce((sum, t) => sum + (t.inputTokens || 0), 0),
      totalOutputTokens: this.turns.reduce((sum, t) => sum + (t.outputTokens || 0), 0),
      totalCachedTokens: this.turns.reduce((sum, t) => sum + (t.cachedTokens || 0), 0),
      avgCacheHitRate: this.avg(this.turns.filter(t => t.cacheHitRate).map(t => t.cacheHitRate!)),
      
      toolCallCounts,
      totalToolCalls,
      
      totalEstimatedCost: this.turns.reduce((sum, t) => sum + (t.estimatedCost || 0), 0),
    };
  }

  /**
   * Calculate cost for a turn
   */
  private calculateCost(inputTokens: number, outputTokens: number, cachedTokens: number): number {
    return (
      inputTokens * this.config.costPerInputToken +
      outputTokens * this.config.costPerOutputToken +
      cachedTokens * this.config.costPerCachedToken
    );
  }

  /**
   * Helper: Calculate average
   */
  private avg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Helper: Format duration
   */
  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }
}
