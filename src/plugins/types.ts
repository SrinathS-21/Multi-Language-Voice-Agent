/**
 * Plugin Type Definitions
 * 
 * Defines interfaces for STT, TTS, and LLM plugins to enable
 * easy provider swapping via factory pattern.
 * 
 * @module plugins/types
 */

import { stt, tts, llm, type APIConnectOptions } from '@livekit/agents';

// ============================================
// LANGUAGE TYPES
// ============================================

/**
 * Supported Indian languages for Sarvam AI plugins
 */
export type SupportedLanguage =
  | 'bn-IN'  // Bengali
  | 'en-IN'  // English (India)
  | 'gu-IN'  // Gujarati
  | 'hi-IN'  // Hindi
  | 'kn-IN'  // Kannada
  | 'ml-IN'  // Malayalam
  | 'mr-IN'  // Marathi
  | 'od-IN'  // Odia
  | 'pa-IN'  // Punjabi
  | 'ta-IN'  // Tamil
  | 'te-IN'; // Telugu

// ============================================
// PLUGIN CONFIGURATION INTERFACES
// ============================================

/**
 * Speech-to-Text plugin configuration
 */
export interface STTConfig {
  /** API key for the provider (optional for local models) */
  apiKey?: string;
  /** Language code (e.g., 'ta-IN', 'hi-IN') */
  language: SupportedLanguage | string;
  /** Model identifier */
  model?: string;
  /** Base URL for custom/local endpoints (e.g., 'http://localhost:8000') */
  baseUrl?: string;
  /** Audio sample rate in Hz */
  sampleRate?: number;
  /** Enable high VAD sensitivity */
  highVadSensitivity?: boolean;
  /** Enable VAD signals */
  vadSignals?: boolean;
}

/**
 * Text-to-Speech plugin configuration
 */
export interface TTSConfig {
  /** API key for the provider (optional for local models) */
  apiKey?: string;
  /** Language code (e.g., 'ta-IN', 'hi-IN') */
  language: SupportedLanguage | string;
  /** Voice/speaker identifier */
  speaker?: string;
  /** Model identifier */
  model?: string;
  /** Base URL for custom/local endpoints (e.g., 'http://localhost:5000') */
  baseUrl?: string;
  /** Speech pace (0.5 to 2.0) */
  pace?: number;
  /** Enable text preprocessing */
  enablePreprocessing?: boolean;
  /** Callback fired when TTS synthesizes text (for agent response logging) */
  onTextSynthesized?: (text: string) => void;
}

/**
 * Large Language Model plugin configuration
 */
export interface LLMConfig {
  /** API key for the provider (optional for local models) */
  apiKey?: string;
  /** Model identifier (e.g., 'gpt-4o-mini', 'llama3', 'mistral') */
  model: string;
  /** Base URL for custom/local endpoints (e.g., 'http://localhost:11434' for Ollama) */
  baseUrl?: string;
  /** Temperature for response generation (0.0 to 2.0) */
  temperature?: number;
}

// ============================================
// PROVIDER TYPES
// ============================================

/**
 * Available STT providers
 * - 'sarvam': Sarvam AI (Indian languages)
 * - 'deepgram': Deepgram STT
 * - 'assemblyai': AssemblyAI
 * - 'whisper': OpenAI Whisper (local or API)
 * - 'custom': Custom local or remote STT server
 */
export type STTProvider = 'sarvam' | 'deepgram' | 'assemblyai' | 'whisper' | 'custom';

/**
 * Available TTS providers
 * - 'sarvam': Sarvam AI (Indian languages)
 * - 'elevenlabs': ElevenLabs TTS
 * - 'azure': Azure Speech Services
 * - 'cartesia': Cartesia TTS
 * - 'custom': Custom local or remote TTS server
 */
export type TTSProvider = 'sarvam' | 'elevenlabs' | 'azure' | 'cartesia' | 'custom';

/**
 * Available LLM providers
 * - 'openai': OpenAI (GPT models)
 * - 'sarvam': Sarvam AI
 * - 'anthropic': Anthropic (Claude)
 * - 'ollama': Ollama (local models)
 * - 'custom': Custom local or remote LLM server
 */
export type LLMProvider = 'openai' | 'sarvam' | 'anthropic' | 'ollama' | 'custom';

// ============================================
// PLUGIN BUNDLE
// ============================================

/**
 * Extended TTS interface with prewarm support
 */
export interface TTSWithPrewarm extends tts.TTS {
  /** 
   * Prewarm the TTS connection pool for faster first response.
   * @param count - Number of connections to prewarm (default: 2)
   */
  prewarm(count?: number): void;
  
  /**
   * Prewarm the phrase cache with common phrases.
   * @param phrases - Array of phrases to pre-synthesize and cache
   * @returns Promise resolving to number of phrases cached
   */
  prewarmPhraseCache(phrases: string[]): Promise<number>;
  
  /**
   * Get phrase cache statistics.
   */
  getPhraseCacheStats(): { size: number; maxSize: number };
  
  /**
   * Set callback for when text is synthesized (for logging agent responses)
   * @param callback - Function to call with the synthesized text
   */
  setOnTextSynthesized?(callback: (text: string) => void): void;
}

/**
 * Extended STT interface with prewarm support
 */
export interface STTWithPrewarm extends stt.STT {
  /** 
   * Prewarm the STT connection pool for faster first response.
   * @param count - Number of connections to prewarm (default: 1)
   */
  prewarm(count?: number): void;
  
  /**
   * Close the connection pool and cleanup resources.
   */
  close(): Promise<void>;
}

/**
 * Complete plugin bundle returned by factory
 */
export interface PluginBundle {
  /** Speech-to-Text plugin instance (with prewarm support) */
  stt: STTWithPrewarm;
  /** Text-to-Speech plugin instance (with prewarm support) */
  tts: TTSWithPrewarm;
  /** Large Language Model plugin instance */
  llm: llm.LLM;
}

/**
 * Factory configuration for creating plugins
 */
export interface PluginFactoryConfig {
  /** STT provider ('sarvam', 'deepgram', 'whisper', 'custom', etc.) */
  sttProvider: STTProvider;
  /** TTS provider ('sarvam', 'elevenlabs', 'cartesia', 'custom', etc.) */
  ttsProvider: TTSProvider;
  /** LLM provider ('openai', 'ollama', 'anthropic', 'custom', etc.) */
  llmProvider: LLMProvider;
  /** Language for STT and TTS */
  language: SupportedLanguage | string;
  /** API keys for providers (flexible structure, all optional for local models) */
  apiKeys?: {
    [provider: string]: string;
  };
  /** Optional overrides for individual plugins */
  overrides?: {
    stt?: Partial<STTConfig>;
    tts?: Partial<TTSConfig>;
    llm?: Partial<LLMConfig>;
  };
}

// ============================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================

export { stt, tts, llm };
export type { APIConnectOptions };
