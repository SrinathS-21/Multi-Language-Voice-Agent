/**
 * Plugin Factory
 * 
 * Creates STT, TTS, and LLM plugin instances based on configuration.
 * Enables easy provider swapping without modifying agent code.
 * 
 * Usage:
 * ```typescript
 * const plugins = createPlugins({
 *   sttProvider: 'sarvam',
 *   ttsProvider: 'sarvam',
 *   llmProvider: 'openai',
 *   language: 'ta-IN',
 *   apiKeys: {
 *     sarvam: process.env.SARVAM_API_KEY,
 *     openai: process.env.OPENAI_API_KEY,
 *   },
 * });
 * ```
 * 
 * @module plugins/factory
 */

import * as openai from '@livekit/agents-plugin-openai';
import { SarvamSTT } from './sarvam_stt.js';
import { SarvamTTS, type OnTextSynthesizedCallback } from './sarvam_tts.js';
import { config } from '../core/config.js';
import { logger } from '../core/logging.js';
import type {
  PluginBundle,
  PluginFactoryConfig,
  STTConfig,
  TTSConfig,
  LLMConfig,
  STTProvider,
  TTSProvider,
  LLMProvider,
  TTSWithPrewarm,
  STTWithPrewarm,
} from './types.js';
import type { stt, tts, llm } from '@livekit/agents';

// ============================================
// SARVAM LANGUAGE DETECTION
// ============================================

/**
 * List of Indian languages supported by Sarvam AI
 * These languages benefit from Sarvam's built-in VAD for better
 * interruption detection compared to Silero
 */
export const SARVAM_LANGUAGES = [
  'bn-IN',  // Bengali
  'en-IN',  // English (India)
  'gu-IN',  // Gujarati
  'hi-IN',  // Hindi
  'kn-IN',  // Kannada
  'ml-IN',  // Malayalam
  'mr-IN',  // Marathi
  'od-IN',  // Odia
  'pa-IN',  // Punjabi
  'ta-IN',  // Tamil
  'te-IN',  // Telugu
] as const;

/**
 * Check if a language is supported by Sarvam AI
 * Used to determine whether to use Sarvam VAD (for Indian languages)
 * or Silero VAD (for other languages)
 * 
 * @param language - Language code (e.g., 'ta-IN', 'hi-IN', 'en-US')
 * @returns true if Sarvam should handle VAD for this language
 */
export function isSarvamLanguage(language: string): boolean {
  return SARVAM_LANGUAGES.includes(language as typeof SARVAM_LANGUAGES[number]);
}

// ============================================
// DEFAULT CONFIGURATIONS
// ============================================

/**
 * Default STT configuration
 * Note: vadSignals is dynamically set based on language in createPluginsFromEnv
 */
const DEFAULT_STT_CONFIG: Partial<STTConfig> = {
  model: 'saarika:v2.5',
  sampleRate: 16000,
  highVadSensitivity: false,
  vadSignals: false,  // Default off - enabled dynamically for Indian languages
};

/**
 * Default TTS configuration
 */
const DEFAULT_TTS_CONFIG: Partial<TTSConfig> = {
  model: 'bulbul:v2',
  speaker: 'anushka',
  pace: 0.85,
  enablePreprocessing: true,
};

/**
 * Default LLM configuration
 */
const DEFAULT_LLM_CONFIG: Partial<LLMConfig> = {
  model: 'gpt-4o-mini',
  temperature: 0.3, // Increased from 0.1 to improve tool calling behavior
};

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create STT plugin instance
 * 
 * Supports multiple providers:
 * - 'sarvam': Sarvam AI (Indian languages) - with connection pooling and prewarm
 * - 'deepgram', 'assemblyai', 'whisper': Add imports and implementations
 * - 'custom': Uses baseUrl from config for local/custom endpoints
 */
function createSTT(
  provider: STTProvider,
  language: string,
  apiKey: string | undefined,
  overrides?: Partial<STTConfig>
): STTWithPrewarm {
  const sttConfig: Partial<STTConfig> = {
    apiKey,
    language,
    ...DEFAULT_STT_CONFIG,
    ...overrides,
  };

  // Silent - reduce noise
  // logger.info('Creating STT plugin', {
  //   provider,
  //   language: sttConfig.language,
  //   model: sttConfig.model,
  //   baseUrl: sttConfig.baseUrl,
  // });

  switch (provider) {
    case 'sarvam':
      if (!sttConfig.apiKey) throw new Error('Sarvam API key required');
      return new SarvamSTT({
        apiKey: sttConfig.apiKey,
        languageCode: sttConfig.language!,
        model: sttConfig.model,
        sampleRate: sttConfig.sampleRate,
        highVadSensitivity: sttConfig.highVadSensitivity,
        vadSignals: sttConfig.vadSignals,
      });

    // Add other providers here:
    // case 'deepgram':
    //   return new deepgram.STT({ apiKey: sttConfig.apiKey, model: sttConfig.model });

    // case 'whisper':
    //   return new whisper.STT({ baseUrl: sttConfig.baseUrl, model: sttConfig.model });

    case 'custom':
      if (!sttConfig.baseUrl) throw new Error('baseUrl required for custom STT provider');
      logger.info('Using custom STT endpoint', { baseUrl: sttConfig.baseUrl });
      // Implement custom STT wrapper here
      throw new Error('Custom STT provider not yet implemented. Add your implementation here.');

    default:
      throw new Error(`Unsupported STT provider: ${provider}. Add implementation in factory.ts`);
  }
}

/**
 * Create TTS plugin instance
 * 
 * Supports multiple providers:
 * - 'sarvam': Sarvam AI (Indian languages)
 * - 'elevenlabs', 'azure', 'cartesia': Add imports and implementations
 * - 'custom': Uses baseUrl from config for local/custom endpoints
 */
function createTTS(
  provider: TTSProvider,
  language: string,
  apiKey: string | undefined,
  overrides?: Partial<TTSConfig>
): TTSWithPrewarm {
  const ttsConfig: Partial<TTSConfig> = {
    apiKey,
    language,
    ...DEFAULT_TTS_CONFIG,
    ...overrides,
  };

  // Silent - reduce noise
  // logger.info('Creating TTS plugin', {
  //   provider,
  //   language: ttsConfig.language,
  //   speaker: ttsConfig.speaker,
  //   model: ttsConfig.model,
  //   baseUrl: ttsConfig.baseUrl,
  // });

  let ttsInstance: TTSWithPrewarm;

  switch (provider) {
    case 'sarvam':
      if (!ttsConfig.apiKey) throw new Error('Sarvam API key required');
      ttsInstance = new SarvamTTS({
        apiKey: ttsConfig.apiKey,
        languageCode: ttsConfig.language!,
        speaker: ttsConfig.speaker,
        model: ttsConfig.model,
        pace: ttsConfig.pace,
        enablePreprocessing: ttsConfig.enablePreprocessing,
        onTextSynthesized: ttsConfig.onTextSynthesized,
      }) as TTSWithPrewarm;
      break;

    // Add other providers here:
    // case 'elevenlabs':
    //   return new elevenlabs.TTS({ apiKey: ttsConfig.apiKey, voice: ttsConfig.speaker });

    // case 'cartesia':
    //   return new cartesia.TTS({ apiKey: ttsConfig.apiKey, voice: ttsConfig.speaker });

    case 'custom':
      if (!ttsConfig.baseUrl) throw new Error('baseUrl required for custom TTS provider');
      logger.info('Using custom TTS endpoint', { baseUrl: ttsConfig.baseUrl });
      // Implement custom TTS wrapper here
      throw new Error('Custom TTS provider not yet implemented. Add your implementation here.');

    default:
      throw new Error(`Unsupported TTS provider: ${provider}. Add implementation in factory.ts`);
  }

  // Prewarm connection pool for faster first response
  if (ttsInstance.prewarm) {
    ttsInstance.prewarm();
  }

  return ttsInstance;
}

/**
 * Create LLM plugin instance
 * 
 * Supports multiple providers:
 * - 'openai': OpenAI (GPT models) - recommended for function calling
 * - 'ollama': Ollama (local models like llama3, mistral)
 * - 'anthropic': Claude models
 * - 'custom': Uses baseUrl from config for local/custom endpoints
 */
function createLLM(
  provider: LLMProvider,
  apiKey: string | undefined,
  overrides?: Partial<LLMConfig>
): llm.LLM {
  const llmConfig: Partial<LLMConfig> = {
    model: DEFAULT_LLM_CONFIG.model!,
    temperature: DEFAULT_LLM_CONFIG.temperature,
    ...overrides,
  };

  // Silent - reduce noise
  // logger.info('Creating LLM plugin', {
  //   provider,
  //   model: llmConfig.model,
  //   temperature: llmConfig.temperature,
  //   baseUrl: llmConfig.baseUrl,
  // });

  switch (provider) {
    case 'openai':
      // Validate API key before creating LLM instance
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        logger.error('OpenAI API key not configured', {
          hint: 'Set OPENAI_API_KEY environment variable',
        });
        throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
      }
      
      if (!apiKey.startsWith('sk-')) {
        logger.warning('OpenAI API key format may be invalid', {
          hint: 'API keys should start with "sk-"',
        });
      }
      
      try {
        const llmInstance = new openai.LLM({
          model: llmConfig.model!,
          temperature: llmConfig.temperature,
          ...(llmConfig.baseUrl && { baseURL: llmConfig.baseUrl }),
        });
        
        logger.info('✅ OpenAI LLM initialized', {
          model: llmConfig.model,
          temperature: llmConfig.temperature,
        });
        
        return llmInstance;
      } catch (error) {
        logger.error('Failed to initialize OpenAI LLM', {
          error: (error as Error).message,
          model: llmConfig.model,
        });
        throw new Error(`Failed to initialize OpenAI LLM: ${(error as Error).message}`);
      }

    case 'ollama':
      // Ollama uses OpenAI-compatible API
      if (!llmConfig.baseUrl) {
        llmConfig.baseUrl = 'http://localhost:11434/v1';
      }
      logger.info('Using Ollama LLM', { baseUrl: llmConfig.baseUrl, model: llmConfig.model });
      return new openai.LLM({
        model: llmConfig.model!,
        temperature: llmConfig.temperature,
        baseURL: llmConfig.baseUrl,
      });

    // Add other providers here:
    // case 'anthropic':
    //   return new anthropic.LLM({ apiKey, model: llmConfig.model });

    case 'sarvam':
      logger.warning('Sarvam LLM has limited function calling support. Using OpenAI is recommended.');
      // Add Sarvam LLM implementation when available
      throw new Error('Sarvam LLM not yet implemented');

    case 'custom':
      if (!llmConfig.baseUrl) throw new Error('baseUrl required for custom LLM provider');
      logger.info('Using custom LLM endpoint', { baseUrl: llmConfig.baseUrl });
      // Most custom LLMs support OpenAI-compatible API
      return new openai.LLM({
        model: llmConfig.model!,
        temperature: llmConfig.temperature,
        baseURL: llmConfig.baseUrl,
      });

    default:
      throw new Error(`Unsupported LLM provider: ${provider}. Add implementation in factory.ts`);
  }
}

// ============================================
// MAIN FACTORY
// ============================================

/**
 * Create all plugins based on configuration
 * 
 * This is the main entry point for plugin creation.
 * It creates STT, TTS, and LLM plugins based on the provided config.
 * 
 * @param factoryConfig - Configuration for plugin creation
 * @returns PluginBundle with all three plugins
 * 
 * @example
 * ```typescript
 * const plugins = createPlugins({
 *   sttProvider: 'sarvam',
 *   ttsProvider: 'sarvam',
 *   llmProvider: 'openai',
 *   language: 'ta-IN',
 *   apiKeys: {
 *     sarvam: config.sarvam.apiKey,
 *     openai: config.convex.openaiApiKey,
 *   },
 * });
 * ```
 */
export function createPlugins(factoryConfig: PluginFactoryConfig): PluginBundle {
  const {
    sttProvider,
    ttsProvider,
    llmProvider,
    language,
    apiKeys = {},
    overrides,
  } = factoryConfig;

  // Silent - reduce noise
  // logger.info('Creating plugin bundle', {
  //   sttProvider,
  //   ttsProvider,
  //   llmProvider,
  //   language,
  // });

  // Get API keys from flexible structure
  const sttKey = apiKeys[sttProvider] || apiKeys.sarvam;
  const ttsKey = apiKeys[ttsProvider] || apiKeys.sarvam;
  const llmKey = apiKeys[llmProvider] || apiKeys.openai;

  // Create plugins
  const stt = createSTT(sttProvider, language, sttKey, overrides?.stt);
  const tts = createTTS(ttsProvider, language, ttsKey, overrides?.tts);
  const llm = createLLM(llmProvider, llmKey, overrides?.llm);

  return { stt, tts, llm };
}

/**
 * Create plugins using environment configuration
 * 
 * Convenience function that uses values from config module.
 * 
 * @param language - Language code for STT and TTS
 * @param overrides - Optional overrides for individual plugins
 * @returns PluginBundle with all three plugins
 * 
 * @deprecated Use createPluginsFromAgentConfig for agent-specific settings
 */
export function createPluginsFromEnv(
  language: string,
  overrides?: PluginFactoryConfig['overrides']
): PluginBundle {
  // DUAL VAD ARCHITECTURE:
  // 
  // 1. Silero VAD (in AgentSession) - REQUIRED for pipeline control
  //    - Turn detection, interrupt handling, when to start LLM
  //    - Runs locally on agent server (~20ms latency)
  //    - Configured via VAD_CONFIG in config.ts
  // 
  // 2. Sarvam VAD (in STT API) - OPTIONAL for transcript timing
  //    - Helps Sarvam emit better transcript segment boundaries
  //    - Runs on Sarvam server (remote)
  //    - Does NOT affect pipeline control, no conflict with Silero
  //
  // Enable Sarvam vadSignals for Indian languages - improves transcript quality
  const enableSarvamVadSignals = isSarvamLanguage(language);

  logger.debug('VAD configuration', {
    language,
    sarvamVadSignals: enableSarvamVadSignals,
    sileroVad: 'ALWAYS (pipeline control)',
  });

  return createPlugins({
    sttProvider: 'sarvam',
    ttsProvider: 'sarvam',
    llmProvider: 'openai',
    language,
    apiKeys: {
      sarvam: config.sarvam.apiKey,
      openai: config.convex.openaiApiKey,
    },
    overrides: {
      stt: {
        model: config.sarvam.sttModel,
        // Enable Sarvam's VAD signals for better transcript timing (Indian languages)
        // This does NOT conflict with Silero VAD - they serve different purposes
        vadSignals: enableSarvamVadSignals,
        highVadSensitivity: false, // Keep false to avoid double-triggers
        ...overrides?.stt,  // Allow explicit overrides
      },
      tts: {
        model: config.sarvam.ttsModel,
        speaker: config.sarvam.ttsSpeaker,
        pace: config.sarvam.ttsPace,
        ...overrides?.tts,
      },
      llm: {
        temperature: config.sarvam.llmTemperature,
        ...overrides?.llm,
      },
    },
  });
}

// ============================================
// AGENT CONFIG BASED PLUGIN CREATION
// ============================================

/**
 * Agent-specific plugin configuration
 * These values come from the agent's config in the database
 */
export interface AgentPluginConfig {
  /** Language code for STT/TTS (e.g., 'ta-IN', 'en-IN') */
  language: string;
  /** TTS voice/speaker (e.g., 'anushka', 'arvind') */
  voice?: string;
  /** TTS speech pace (0.5 to 2.0, default 0.85) */
  pace?: number;
  /** STT model (default: 'saarika:v2.5') */
  sttModel?: string;
  /** TTS model (default: 'bulbul:v2') */
  ttsModel?: string;
  /** LLM temperature (0.0 to 2.0, default 0.1) */
  temperature?: number;
}

/**
 * Create plugins using agent-specific configuration
 * 
 * API keys are always loaded from environment/vault for security.
 * All other settings (language, voice, pace) come from agent config.
 * 
 * @param agentConfig - Agent-specific plugin settings from database
 * @returns PluginBundle with STT, TTS, and LLM plugins
 * 
 * @example
 * ```typescript
 * const plugins = createPluginsFromAgentConfig({
 *   language: 'ta-IN',
 *   voice: 'anushka',
 *   pace: 0.85,
 * });
 * ```
 */
export function createPluginsFromAgentConfig(
  agentConfig: AgentPluginConfig
): PluginBundle {
  const {
    language,
    voice = 'anushka',
    pace = 0.85,
    sttModel = 'saarika:v2.5',
    ttsModel = 'bulbul:v2',
    temperature = 0.1,
  } = agentConfig;

  // DUAL VAD ARCHITECTURE:
  // Silero VAD (in AgentSession) = pipeline control (ALWAYS enabled)
  // Sarvam VAD signals = transcript timing enhancement for Indian languages
  const enableSarvamVadSignals = isSarvamLanguage(language);

  logger.info('Creating plugins from agent config', {
    language,
    voice,
    pace,
    sttModel,
    ttsModel,
    sarvamVadSignals: enableSarvamVadSignals,
  });

  return createPlugins({
    sttProvider: 'sarvam',
    ttsProvider: 'sarvam',
    llmProvider: 'openai',
    language,
    // API keys ALWAYS from environment/vault (never from agent config)
    apiKeys: {
      sarvam: config.sarvam.apiKey,
      openai: config.convex.openaiApiKey,
    },
    overrides: {
      stt: {
        model: sttModel,
        // Enable Sarvam VAD signals for better transcript timing (Indian languages)
        vadSignals: enableSarvamVadSignals,
        highVadSensitivity: false, // Keep false to avoid double-triggers
      },
      tts: {
        model: ttsModel,
        speaker: voice,
        pace: pace,
      },
      llm: {
        temperature: temperature,
      },
    },
  });
}

// ============================================
// EXPORTS
// ============================================

export type { PluginBundle, PluginFactoryConfig };
