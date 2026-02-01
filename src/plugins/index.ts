/**
 * Plugins Module
 * 
 * Exports all plugin-related types, classes, and factory functions.
 * 
 * @module plugins
 */

// Plugin implementations
export { SarvamSTT } from './sarvam_stt.js';
export type { SarvamSTTOptions, SarvamSTTLanguage, SarvamSTTModel } from './sarvam_stt.js';

export { SarvamTTS } from './sarvam_tts.js';
export type { SarvamTTSOptions, SarvamTTSLanguage, SarvamTTSModel, SarvamTTSSpeaker } from './sarvam_tts.js';

// Factory
export { 
  createPlugins, 
  createPluginsFromEnv, 
  createPluginsFromAgentConfig,
  isSarvamLanguage, 
  SARVAM_LANGUAGES 
} from './factory.js';

// Types
export type {
  PluginBundle,
  PluginFactoryConfig,
  STTConfig,
  TTSConfig,
  LLMConfig,
  STTProvider,
  TTSProvider,
  LLMProvider,
  SupportedLanguage,
} from './types.js';

export type { AgentPluginConfig } from './factory.js';
