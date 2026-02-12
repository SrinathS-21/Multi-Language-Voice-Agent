/**
 * LiveKit Voice Agent - Production Entry Point
 *
 * Clean, modular entry point using LiveKit Agents SDK.
 * All utilities split into separate modules for maintainability.
 * 
 * @module agent
 */

import {
  type JobContext,
  type JobProcess,
  type JobRequest,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
  metrics,
  InferenceRunner,
} from '@livekit/agents';
import * as livekit from '@livekit/agents-plugin-livekit';
import * as silero from '@livekit/agents-plugin-silero';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import dotenv from 'dotenv';

// Core
import { config } from '../core/config.js';
import { logger } from '../core/logging.js';
import { startHealthServer, stopHealthServer } from '../core/health.js';
import { onShutdown } from '../core/shutdown.js';
import { TurnMetricsCollector } from '../core/call-analytics.js';

// Plugins
import { createPluginsFromAgentConfig } from '../plugins/index.js';

// Services
import { SessionService } from '../services/session.js';
import { CallTrackingService } from '../services/call-tracking.js';
import { VoiceKnowledgeService } from '../services/voice-knowledge.js';
import { getAgentConfigService } from '../services/agent-config.js';
import { getFunctionGenerator } from '../services/function-generator.js';
import { buildToolContext, createMinimalToolContext, ToolExecutionContext } from '../services/tool-handlers.js';
import { CallType } from '../models/session.js';

// Telephony
import { createLatencyTracker, LatencyOperation } from '../telephony/index.js';

// Agent modules
import { VAD_CONFIG, VOICE_OPTIONS, CONNECTION_OPTIONS, DEFAULT_AGENT, PREWARM_PHRASES } from './config.js';
import { extractRoomContext, processParticipantContext, injectDateTimeIntoPrompt } from './room-utils.js';
import { VoiceAssistant, activeSessions } from './voice-assistant.js';
import type { AgentContext } from './types.js';

dotenv.config();

// ============================================================================
// GLOBAL ERROR HANDLERS (for LiveKit FFI crashes)
// ============================================================================

// Catch LiveKit Rust FFI panics before they crash the process
process.on('uncaughtException', (error: Error) => {
  // Check if it's a LiveKit FFI panic
  if (error.stack?.includes('livekit-ffi') || error.stack?.includes('rust-sdks')) {
    logger.error('🚨 LiveKit FFI panic detected (non-fatal)', {
      error: error.message,
      stack: error.stack,
    });
    // Don't exit - let the session clean up gracefully
    return;
  }
  
  // For other uncaught exceptions, let shutdown handler deal with it
  logger.error('Uncaught exception', error);
  process.exit(1);
});

// Suppress known race condition errors and non-fatal framework errors
process.on('unhandledRejection', (reason: any) => {
  if (reason?.message?.includes('mark_generation_done') || 
      reason?.message?.includes('no active generation') ||
      reason?.message?.includes('speech_handle') ||
      reason?.message?.includes('Channel closed') ||
      reason?.message?.includes('Room disconnected while waiting for participant') ||
      reason?.message?.includes('runner initialization timed out') ||
      reason?.message?.includes('Required model files not found') ||
      reason?.code === 'ERR_IPC_CHANNEL_CLOSED' ||
      reason?.message?.includes('[object Object]')) {
    logger.debug('Suppressed known LiveKit framework error (non-fatal)', {
      error: reason.message || reason.code || 'FFI/IPC error',
      type: 'framework_error'
    });
    return;
  }
  
  logger.error('Unhandled rejection', { reason });
});

// ============================================================================
// TURN DETECTOR AVAILABILITY CHECK
// ============================================================================

/**
 * Check if the turn-detector ONNX model files are available in the HuggingFace cache.
 * The model must be pre-downloaded via `download-files`; at runtime it uses localFileOnly mode.
 * If unavailable, the agent runs without EOU turn detection (falls back to VAD silence detection).
 */
function isTurnDetectorAvailable(): boolean {
  const cacheDir = join(homedir(), '.cache', 'huggingface', 'hub', 'models--livekit--turn-detector');
  const available = existsSync(cacheDir);
  if (!available) {
    logger.info('⚠️  Turn detector model not found in cache - running without EOU turn detection');
    logger.info('   To enable: run `node dist/src/agent/index.js download-files` with network access');
  } else {
    logger.info('✅ Turn detector model found in cache');
  }
  return available;
}

const turnDetectorAvailable = isTurnDetectorAvailable();

// If turn-detector models are not available, clear all registered inference runners
// BEFORE cli.runApp() creates the AgentServer. This prevents the framework from
// spawning an inference subprocess that will crash on missing ONNX model files,
// which would block worker registration entirely.
if (!turnDetectorAvailable) {
  const runners = InferenceRunner.registeredRunners;
  for (const key of Object.keys(runners)) {
    delete runners[key];
  }
  logger.info('Cleared inference runners - inference subprocess will not be started');
}

// ============================================================================
// HEALTH SERVER
// ============================================================================

let healthServer: ReturnType<typeof startHealthServer> | null = null;
const isJobSubprocess = typeof process.send === 'function';

if (!isJobSubprocess) {
  const healthPort = parseInt(process.env.HEALTH_PORT || '8080', 10);
  healthServer = startHealthServer(healthPort);

  onShutdown(async () => {
    if (healthServer) await stopHealthServer(healthServer);
  });
}

// ============================================================================
// AGENT DEFINITION
// ============================================================================

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    try {
      proc.userData.sileroVad = await silero.VAD.load(VAD_CONFIG);
      proc.userData.sessionService = new SessionService();
      proc.userData.callTracker = new CallTrackingService();
      logger.info('✅ Agent ready - VAD & services initialized');
    } catch (error: any) {
      logger.error('❌ Failed to load Silero VAD', { error: error.message });
      throw error;
    }
  },

  entry: async (ctx: JobContext) => {
    const roomName = ctx.job.room?.name || ctx.room?.name || 'unknown-room';
    logger.info('📞 Call incoming', { roomName });

    // Get preloaded resources
    const sileroVad = ctx.proc.userData.sileroVad as silero.VAD;
    const sessionService = ctx.proc.userData.sessionService as SessionService;
    const callTracker = ctx.proc.userData.callTracker as CallTrackingService;

    // Extract IDs from room name first, then try dispatch metadata as fallback
    let { organizationId, agentId, isSIPRoom } = extractRoomContext(roomName);

    // Check dispatch metadata for IDs (outbound handler passes these)
    let isWarmupPing = false;
    try {
      const metadata = ctx.job.metadata ? JSON.parse(ctx.job.metadata) : null;
      if (metadata) {
        if (metadata.warmup) {
          isWarmupPing = true;
        } else {
          if (metadata.organizationId) organizationId = metadata.organizationId;
          if (metadata.agentId) agentId = metadata.agentId;
          logger.info('📋 Dispatch metadata applied', { organizationId, agentId, callType: metadata.callType });
        }
      }
    } catch {
      // metadata not JSON or not present — use room name extraction
    }

    // Handle warmup pings — just connect and disconnect immediately
    // This keeps the agent container warm without running full call setup
    if (isWarmupPing) {
      logger.info('🔥 Warmup ping received — staying alive', { roomName });
      await ctx.connect();
      // Disconnect after a brief moment (room will be cleaned up by the ping script)
      setTimeout(() => {
        ctx.room?.disconnect().catch(() => {});
      }, 2000);
      return;
    }

    // Initialize latency tracking
    const latencyTracker = createLatencyTracker(`pre_${Date.now()}`, {
      callType: isSIPRoom ? 'inbound' : 'web',
      isSIPCall: isSIPRoom,
    });
    const setupTimingKey = latencyTracker.startTiming(LatencyOperation.SIP_CONNECT, { stage: 'setup' });

    // Initialize services
    const functionGenerator = getFunctionGenerator();
    const agentConfigService = getAgentConfigService();
    const knowledgeService = new VoiceKnowledgeService(organizationId, agentId);

    // Parallel initialization
    const [session, agentConfig] = await Promise.all([
      sessionService.createSession({
        organizationId,
        agentId,
        roomName,
        callType: isSIPRoom ? CallType.INBOUND : CallType.WEB,
        isTelephony: isSIPRoom,
        config: { language: config.sarvam.language },
      }),
      agentConfigService.loadAgentConfig(agentId).catch(() => null),
      knowledgeService.warmupNamespace().catch(() => null),
    ]);

    // Process agent config
    let agentName = DEFAULT_AGENT.name;
    let greeting = DEFAULT_AGENT.greeting;
    let farewell = 'Thank you for calling! Have a great day!';
    let functions: any[] = [];
    let agentLanguage = config.sarvam.language;
    let agentVoice = config.sarvam.ttsSpeaker || 'anushka';
    let agentPace = config.sarvam.ttsPace || 0.85;

    if (agentConfig) {
      // Log what we received from database
      logger.info('📥 Agent config loaded from DB', {
        agentId,
        name: agentConfig.name,
        language: agentConfig.language,
        greeting: agentConfig.greeting?.substring(0, 50) || '(none)',
        farewell: agentConfig.farewell?.substring(0, 50) || '(none)',
        rawConfigVoice: agentConfig.rawConfig?.voice || '(none)',
        rawConfigPace: agentConfig.rawConfig?.pace || '(none)',
        rawConfigKeys: Object.keys(agentConfig.rawConfig || {}),
      });

      agentName = agentConfig.name || agentName;
      // Use direct greeting/farewell columns from database, fallback to rawConfig, then defaults
      greeting = agentConfig.greeting || agentConfig.rawConfig?.greeting || agentConfig.rawConfig?.welcome_message || greeting;
      farewell = agentConfig.farewell || agentConfig.rawConfig?.farewell || agentConfig.rawConfig?.endCall || farewell;
      agentLanguage = agentConfig.language || agentLanguage;
      // Use voice from rawConfig (stored as JSON in config column)
      agentVoice = agentConfig.rawConfig?.voice || agentVoice;
      agentPace = agentConfig.rawConfig?.pace || agentPace;

      functions = functionGenerator.generateFunctions(agentConfig, {
        includeDefaults: true,
        includeKnowledgeSearch: true,
      });
      
      logger.info(`📋 Agent configured: ${agentName}`, {
        voice: agentVoice,
        pace: agentPace,
        language: agentLanguage,
        greetingPreview: greeting.substring(0, 50),
        farewellPreview: farewell.substring(0, 50),
        toolCount: functions.length,
      });
    } else {
      logger.error('❌ No agent config found - agent must be configured in database', { agentId });
      throw new Error(`Agent ${agentId} not found. Please configure the agent in the database.`);
    }

    // Get system prompt - agent MUST have a prompt configured
    const promptResult = await agentConfigService.getCachedFullPrompt(agentId);
    if (!promptResult.prompt) {
      logger.error('❌ Agent has no prompt configured', { agentId });
      throw new Error(`Agent ${agentId} has no prompt. Run: npx convex run agents:rebuildAllPrompts`);
    }

    logger.info('📝 System prompt loaded', {
      source: promptResult.source,
      latencyMs: promptResult.latencyMs,
      promptLength: promptResult.prompt.length,
      promptPreview: promptResult.prompt.substring(0, 100) + '...',
    });

    const systemPrompt = injectDateTimeIntoPrompt(promptResult.prompt);

    // Create metrics collector
    const metricsCollector = new TurnMetricsCollector(session.sessionId, {
      enablePerTurnLogs: true,
      enableSessionSummary: true,
      includeTranscriptions: true,
    });

    // Create agent context
    const agentContext: AgentContext = {
      organizationId,
      agentId,
      agentName,
      greeting,
      farewell,
      sessionId: session.sessionId,
      sessionService,
      callTracker,
      knowledgeService,
      functions,
      metricsCollector,
      latencyTracker,
      isTelephony: isSIPRoom,
    };

    // Create a mutable reference for the assistant (set after creation)
    let assistantRef: VoiceAssistant | null = null;

    // Build tool context with deferred shutdown callback
    const toolExecutionContext: ToolExecutionContext = {
      organizationId,
      agentId,
      sessionId: session.sessionId,
      knowledgeService,
      sessionService,
      callTracker,
      // Deferred getter - returns the shutdown callback when the assistant is ready
      getShutdownCallback: () => assistantRef?.getShutdownCallback(),
    };

    // Build tools first
    const tools = functions.length > 0
      ? buildToolContext(functions, toolExecutionContext)
      : createMinimalToolContext(toolExecutionContext);

    // Create assistant with tools
    const assistant = new VoiceAssistant(systemPrompt, tools, agentContext);
    
    // Set the reference so deferred callback can access it
    assistantRef = assistant;

    // Initialize plugins using agent-specific configuration (voice, pace, language from database)
    const plugins = createPluginsFromAgentConfig({
      language: agentLanguage,
      voice: agentVoice,
      pace: agentPace,
    });

    logger.info(`🎤 TTS configured: Voice=${agentVoice}, Pace=${agentPace}, Language=${agentLanguage}`);

    // Setup TTS callback for response capture
    if (plugins.tts.setOnTextSynthesized) {
      plugins.tts.setOnTextSynthesized((text: string) => {
        if (text?.trim()) {
          metricsCollector.recordAgentResponse(text);
          callTracker.logAgentResponse(session.sessionId, organizationId, text, { agentId })
            .catch(err => logger.error('Failed to log response', { error: err.message }));
        }
      });
    }

    // Prewarm TTS and STT connections for faster first response
    plugins.tts.prewarm(2);
    plugins.tts.prewarmPhraseCache([greeting, ...PREWARM_PHRASES]).catch(() => {});
    plugins.stt.prewarm(1);  // Pre-warm STT WebSocket connection

    // Create voice session
    // Turn detection requires pre-downloaded ONNX model files.
    // If unavailable (e.g. Docker build couldn't download from HuggingFace),
    // we fall back to VAD-only silence detection which still works well.
    const voiceSession = new voice.AgentSession({
      vad: sileroVad,
      stt: plugins.stt,
      llm: plugins.llm,
      tts: plugins.tts,
      ...(turnDetectorAvailable ? { turnDetection: new livekit.turnDetector.MultilingualModel() } : {}),
      voiceOptions: VOICE_OPTIONS,
      connOptions: CONNECTION_OPTIONS,
    });

    // Setup event handlers
    setupVoiceSessionEvents(voiceSession, session.sessionId, organizationId, agentId, latencyTracker, metricsCollector, callTracker);

    // Connect and start
    await ctx.connect();
    
    try {
      await voiceSession.start({
        agent: assistant,
        room: ctx.room,
        inputOptions: { noiseCancellation: BackgroundVoiceCancellation() },
      });
      logger.info(`✅ Session active - ID: ${session.sessionId.substring(0, 12)}...`);
    } catch (error: any) {
      // Handle FFI and IPC errors gracefully
      if (error.message?.includes('Channel closed') || 
          error.code === 'ERR_IPC_CHANNEL_CLOSED' ||
          error.message?.includes('[object Object]')) {
        logger.error('IPC/FFI error starting voice session - this is a known LiveKit framework issue', { 
          error: error.message,
          code: error.code,
          sessionId: session.sessionId.substring(0, 12),
          suggestion: 'Session may continue normally - monitoring for recovery'
        });
        // Don't throw - let session attempt to continue
      } else {
        logger.error('Failed to start voice session', { 
          error: error.message, 
          stack: error.stack,
          sessionId: session.sessionId 
        });
        throw error;
      }
    }

    latencyTracker.endTiming(setupTimingKey);

    // Wait for participant
    const participant = await ctx.waitForParticipant();
    processParticipantContext(participant, greeting, latencyTracker, agentContext);

    logger.info(`🟢 Ready - Participant: ${participant.identity}`);
  },
});

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function setupVoiceSessionEvents(
  voiceSession: voice.AgentSession,
  sessionId: string,
  organizationId: string,
  agentId: string,
  latencyTracker: any,
  metricsCollector: TurnMetricsCollector,
  callTracker: CallTrackingService
): void {
  const usageCollector = new metrics.UsageCollector();
  
  // Track if agent is currently producing output (for interrupt detection)
  let agentIsProducingOutput = false;

  voiceSession.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
    usageCollector.collect(ev.metrics);
    metricsCollector.recordMetrics(ev.metrics);

    const m = ev.metrics as any;
    
    // Extract metrics based on type - SDK provides detailed metrics for each component
    // Reference: LiveKit agents-js SDK metrics/base.ts
    if (m.type === 'llm_metrics') {
      // LLMMetrics: ttftMs (Time To First Token), durationMs, tokensPerSecond
      if (typeof m.ttftMs === 'number' && m.ttftMs >= 0) {
        latencyTracker.recordMeasurement(LatencyOperation.LLM_FIRST_TOKEN, m.ttftMs);
        logger.debug('LLM TTFT recorded', {
          ttftMs: m.ttftMs,
          durationMs: m.durationMs,
          tokensPerSecond: m.tokensPerSecond,
          sessionId: sessionId.substring(0, 12),
        });
      }
      if (typeof m.durationMs === 'number' && m.durationMs >= 0) {
        latencyTracker.recordMeasurement(LatencyOperation.LLM_COMPLETE, m.durationMs);
      }
    } else if (m.type === 'tts_metrics') {
      // TTSMetrics: ttfbMs (Time To First Byte), durationMs, audioDurationMs
      if (typeof m.ttfbMs === 'number' && m.ttfbMs >= 0) {
        latencyTracker.recordMeasurement(LatencyOperation.TTS_FIRST_CHUNK, m.ttfbMs);
        logger.debug('TTS TTFB recorded', {
          ttfbMs: m.ttfbMs,
          durationMs: m.durationMs,
          audioDurationMs: m.audioDurationMs,
          sessionId: sessionId.substring(0, 12),
        });
      }
      if (typeof m.durationMs === 'number' && m.durationMs >= 0) {
        latencyTracker.recordMeasurement(LatencyOperation.TTS_COMPLETE, m.durationMs);
      }
    } else if (m.type === 'stt_metrics') {
      // STTMetrics: durationMs, audioDurationMs
      if (typeof m.durationMs === 'number' && m.durationMs >= 0) {
        latencyTracker.recordMeasurement(LatencyOperation.STT_COMPLETE, m.durationMs);
      }
    } else if (m.type === 'eou_metrics') {
      // EOUMetrics: endOfUtteranceDelayMs, transcriptionDelayMs, onUserTurnCompletedDelayMs
      logger.debug('EOU metrics received', {
        endOfUtteranceDelayMs: m.endOfUtteranceDelayMs,
        transcriptionDelayMs: m.transcriptionDelayMs,
        onUserTurnCompletedDelayMs: m.onUserTurnCompletedDelayMs,
        sessionId: sessionId.substring(0, 12),
      });
    } else if (m.type === 'vad_metrics') {
      // VADMetrics: idleTimeMs, inferenceDurationTotalMs, inferenceCount
      logger.debug('VAD metrics received', {
        idleTimeMs: m.idleTimeMs,
        inferenceCount: m.inferenceCount,
        sessionId: sessionId.substring(0, 12),
      });
    } else if (m.type === 'realtime_model_metrics') {
      // RealtimeModelMetrics: ttftMs, durationMs, inputTokens, outputTokens
      if (typeof m.ttftMs === 'number' && m.ttftMs >= 0) {
        latencyTracker.recordMeasurement(LatencyOperation.LLM_FIRST_TOKEN, m.ttftMs);
        logger.debug('Realtime LLM TTFT recorded', {
          ttftMs: m.ttftMs,
          durationMs: m.durationMs,
          inputTokens: m.inputTokens,
          outputTokens: m.outputTokens,
          sessionId: sessionId.substring(0, 12),
        });
      }
    }
  });

  voiceSession.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev: any) => {
    const userText = ev.transcript || ev.text || '';
    if (ev.isFinal || ev.final) latencyTracker.markUserSpeechEnd();

    if (userText) {
      metricsCollector.recordUserInput(userText);
      callTracker.logUserMessage(sessionId, organizationId, userText, { agentId }).catch(() => {});
    }
    
    // Debug: Log turn detection context
    logger.debug('Turn detection input', {
      transcript: userText,
      isFinal: ev.isFinal || ev.final,
      sessionId: sessionId.substring(0, 12),
    });
  });

  // CRITICAL: Handle agent state changes for interrupt detection
  voiceSession.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev: any) => {
    const newState = ev.state || ev.newState;
    const oldState = ev.oldState;
    
    logger.info('Agent state changed', { 
      oldState, 
      newState, 
      sessionId: sessionId.substring(0, 12) 
    });
    
    if (newState === 'speaking') {
      latencyTracker.markAgentSpeechStart();
      agentIsProducingOutput = true;
    } else if (newState === 'thinking') {
      agentIsProducingOutput = true;
    } else if (newState === 'listening' || newState === 'idle') {
      agentIsProducingOutput = false;
    }
  });
  
  // CRITICAL: Handle user state changes for interrupt handling
  // Course insight: "When an interruption occurs, every part of the voice pipeline 
  // downstream is flushed. LLM inference stops, TTS audio stops."
  // 
  // NOTE ON AUDIO FLUSH DELAY:
  // The SDK calls interrupt() which internally calls:
  // 1. speechHandle.interrupt() - marks speech as interrupted
  // 2. audioOutput.clearBuffer() - resolves interruptedFuture
  // 3. realtimeSession?.interrupt() - cancels LLM generation
  // 
  // HOWEVER: Audio already pushed to AudioSource.captureFrame() will still play out.
  // This is a WebRTC limitation - ~200-500ms of audio may play after interrupt.
  // We minimize this by using small sentence chunks (30-60 chars).
  let interruptStartTime: number | null = null;
  let lastInterruptTime = 0;
  const INTERRUPT_DEBOUNCE_MS = 100; // Prevent rapid-fire interrupts
  
  voiceSession.on(voice.AgentSessionEventTypes.UserStateChanged, (ev: any) => {
    const newState = ev.state || ev.newState;
    const oldState = ev.oldState;
    
    logger.debug('User state changed', { 
      oldState, 
      newState, 
      agentIsProducingOutput,
      sessionId: sessionId.substring(0, 12) 
    });
    
    // User started speaking while agent is producing output = INTERRUPT
    if (newState === 'speaking' && oldState !== 'speaking' && agentIsProducingOutput) {
      const now = performance.now();
      
      // Debounce rapid interrupts to prevent race conditions
      if (now - lastInterruptTime < INTERRUPT_DEBOUNCE_MS) {
        logger.debug('Debouncing rapid interrupt', { 
          sessionId: sessionId.substring(0, 12),
          timeSinceLastMs: (now - lastInterruptTime).toFixed(2)
        });
        return;
      }
      
      lastInterruptTime = now;
      interruptStartTime = now;
      
      logger.info('🛑 INTERRUPT DETECTED - User started speaking while agent active', {
        sessionId: sessionId.substring(0, 12),
        timestamp: interruptStartTime,
      });
      
      // The SDK's interrupt() method handles:
      // 1. Stopping LLM generation
      // 2. Flushing TTS audio  
      // 3. Syncing context to last played audio position
      try {
        // Call interrupt immediately - SDK will call clearBuffer() internally
        voiceSession.interrupt();
        agentIsProducingOutput = false;
        
        const interruptDuration = performance.now() - interruptStartTime;
        logger.info('✅ Pipeline interrupted and flushed', { 
          sessionId: sessionId.substring(0, 12),
          interruptCallDurationMs: interruptDuration.toFixed(2),
        });
      } catch (err: any) {
        // Catch specific speech handle errors and continue gracefully
        if (err.message?.includes('mark_generation_done') || err.message?.includes('no active generation')) {
          logger.warning('Speech handle race condition during interrupt (non-fatal)', { 
            error: err.message,
            sessionId: sessionId.substring(0, 12) 
          });
          agentIsProducingOutput = false; // Reset state anyway
        } else {
          logger.error('Failed to interrupt voice session', { 
            error: err.message,
            stack: err.stack, 
            sessionId: sessionId.substring(0, 12) 
          });
        }
      }
    }
  });

  voiceSession.on(voice.AgentSessionEventTypes.FunctionToolsExecuted, (ev: any) => {
    const toolNames = ev.functionCalls?.map((f: any) => f.name) || [];
    if (toolNames.length > 0) {
      metricsCollector.recordToolCalls(toolNames);
      logger.info('Tools executed', { sessionId, functions: toolNames });
    }
  });

  voiceSession.on(voice.AgentSessionEventTypes.Error, (ev: any) => {
    logger.error('Session error', { error: ev.error || ev, sessionId });
  });
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

onShutdown(async () => {
  if (activeSessions.size === 0) return;

  logger.info(`Flushing ${activeSessions.size} active sessions...`);

  const flushPromises = Array.from(activeSessions.values()).map(async ({ callTracker, sessionId }) => {
    try {
      return await callTracker.flushSessionToConvex(sessionId);
    } catch (error) {
      logger.error('Flush failed', { sessionId, error: (error as Error).message });
      return { success: false };
    }
  });

  await Promise.allSettled(flushPromises);
  logger.info('All sessions flushed');
});

// ============================================================================
// DUPLICATE ROOM GUARD
// ============================================================================
// Track rooms with active jobs to prevent duplicate agents joining the same room.
// requestFunc runs in the main worker process, so this Set is shared across all jobs.
// Room names are unique per call (include random suffix), so long timeouts are safe.
const activeJobRooms = new Set<string>();
const rejectedJobIds = new Set<string>();

async function handleJobRequest(req: JobRequest): Promise<void> {
  const roomName = req.room?.name || '';
  const jobId = req.id;

  // Silently reject jobs we've already rejected (stops log spam from retries)
  if (rejectedJobIds.has(jobId)) {
    await req.reject();
    return;
  }

  // Reject if another agent is already active in this room
  if (activeJobRooms.has(roomName)) {
    rejectedJobIds.add(jobId);
    logger.info('🚫 Rejected duplicate job for room (agent already active)', {
      roomName,
      jobId,
    });
    await req.reject();
    return;
  }

  activeJobRooms.add(roomName);
  logger.info('✅ Accepted job for room', { roomName, jobId });
  await req.accept();

  // Clean up after call ends. Room names are unique per call (random suffix),
  // so a generous timeout won't block future calls. 10 minutes covers any call.
  setTimeout(() => {
    activeJobRooms.delete(roomName);
    rejectedJobIds.delete(jobId);
  }, 600_000); // 10 min safety cleanup
}

// The agent name MUST match the name used in:
// 1. createDispatch(roomName, AGENT_NAME) in outbound-handler.ts
// 2. SIP dispatch rule's roomConfig.agents[].agentName for inbound calls
// Setting agentName enables explicit dispatch (recommended for telephony).
const AGENT_NAME = 'sarvam-voice-agent';

// Run the agent with optimized worker options for stability
cli.runApp(new WorkerOptions({ 
  agent: fileURLToPath(import.meta.url),
  agentName: AGENT_NAME,
  requestFunc: handleJobRequest,
  numIdleProcesses: 1,
  jobMemoryLimitMB: 1024,
}));
