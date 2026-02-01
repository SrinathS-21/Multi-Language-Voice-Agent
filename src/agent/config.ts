/**
 * Agent Configuration Constants
 * 
 * Centralized configuration for voice agent behavior.
 * @module agent/config
 */

/**
 * Voice Activity Detection (VAD) settings - Silero VAD
 * 
 * OPTIMIZED for responsive conversations:
 * - Reduced silence duration for faster turn detection
 * - Balanced activation threshold for noise rejection
 * - Lower prefix padding for faster speech onset detection
 * 
 * Course Insight: "VAD starts a timer for a developer configurable number 
 * of milliseconds before firing an end-of-turn event"
 */
export const VAD_CONFIG = {
  minSilenceDuration: 0.4,       // Reduced from 0.8 → faster turn detection
  minSpeechDuration: 0.1,        // Reduced from 0.15 → faster speech detection
  activationThreshold: 0.5,      // Keep - good for noise rejection
  prefixPaddingDuration: 0.2,    // Reduced from 0.3 → faster speech onset
} as const;

/**
 * Voice session options for natural conversation flow
 * 
 * OPTIMIZED for responsiveness and proper interruption handling:
 * - Lower endpointing delays for faster response
 * - Single word interrupt for faster barge-in
 */
export const VOICE_OPTIONS = {
  preemptiveGeneration: true,     // Start LLM before turn complete (KEEP!)
  maxToolSteps: 5,
  allowInterruptions: true,
  minEndpointingDelay: 0.4,       // Reduced from 0.8 → faster response
  maxEndpointingDelay: 0.8,       // Reduced from 1.5 → max 800ms wait
  minInterruptionDuration: 0.15,  // Reduced from 0.3 → faster barge-in
  minInterruptionWords: 1,        // Reduced from 2 → single word interrupt
} as const;

/**
 * Connection retry settings for reliability
 */
export const CONNECTION_OPTIONS = {
  llmConnOptions: { maxRetry: 3, retryIntervalMs: 2000, timeoutMs: 60000 },
  ttsConnOptions: { maxRetry: 3, retryIntervalMs: 1000, timeoutMs: 30000 },
  sttConnOptions: { maxRetry: 3, retryIntervalMs: 1000, timeoutMs: 30000 },
} as const;

/**
 * Default agent settings (used when no config found in database)
 */
export const DEFAULT_AGENT = {
  name: 'Voice Assistant',
  businessName: 'Your Business',
  greeting: 'Hello! How can I help you today?',
} as const;

/**
 * Common phrases to prewarm in TTS cache
 */
export const PREWARM_PHRASES = [
  'Is there anything else I can help you with?',
  'Thank you for your question.',
  'Let me check that for you.',
  'I understand.',
  'One moment please.',
  'நிச்சயமா, நான் உங்களுக்கு உதவ முடியும்.',
  'உங்க பெயர் என்ன?',
  'உங்க போன் நம்பர் சொல்லுங்க.',
  'Thank you! Have a great day!',
] as const;
