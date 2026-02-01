/**
 * Sarvam AI Text-to-Speech Plugin for LiveKit Agents (TypeScript)
 * 
 * Based on official Python implementation from livekit/agents repository
 * Implements WebSocket streaming with connection pooling
 */

import { tts, type APIConnectOptions, AudioByteStream, ConnectionPool } from '@livekit/agents';
import { AudioFrame } from '@livekit/rtc-node';
import WebSocket from 'ws';
import { randomUUID, createHash } from 'crypto';
import { getLogger } from '../core/logging.js';
import { MPEGDecoder } from 'mpg123-decoder';

const logger = getLogger('sarvam.tts');

const SARVAM_TTS_WS_URL = 'wss://api.sarvam.ai/text-to-speech/ws';
const SAMPLE_RATE = 22050;  // Sarvam's native sample rate (matching Python plugin)
const NUM_CHANNELS = 1;

/**
 * Minimum characters before checking for sentence boundaries.
 * 
 * TRADE-OFF: Streaming chunks vs Barge-in responsiveness
 * 
 * - SMALLER value (20-40): Faster barge-in, but may cut mid-sentence
 * - LARGER value (60-100): Smoother sentences, but slower barge-in response
 * - 9999 (disabled): Wait for full LLM response, no streaming
 * 
 * Character length comparison (same meaning):
 * - Hindi: "सर्जरी हमेशा जरूरी नहीं होती।" → 27 chars
 * - Tamil: "அறுவை சிகிச்சை தேவையில்லை." → 25 chars  
 * - English: "Surgery is not always necessary." → 34 chars
 * 
 * IMPORTANT FOR BARGE-IN:
 * When user interrupts, only PENDING audio can be cleared.
 * Audio already in WebRTC buffer will finish playing (~200-500ms).
 * Smaller chunks = faster interrupt response (less audio buffered).
 * 
 * Current: 100 chars = ~3-4 second audio chunks (smoothest pronunciation)
 * 
 * TUNING:
 * - Increase if audio cuts mid-sentence frequently
 * - Decrease for faster barge-in response (risk: audio glitches)
 * - Set to 9999 to disable streaming entirely
 */
/**
 * Language-specific sentence length thresholds for streaming TTS.
 * Different languages have different character densities and sentence structures.
 * 
 * Script characteristics:
 * - Indic scripts (Devanagari, Tamil, etc.): More compact, use fewer characters
 * - English/Latin: Longer words, more characters per sentence
 * - Urdu/Arabic: Right-to-left, compact script
 * 
 * Optimized for TTFB (Time to First Byte) while ensuring natural sentence breaks.
 */
const LANGUAGE_SENTENCE_THRESHOLDS: Record<string, number> = {
  // English - longer sentences, need more chars for complete thoughts
  'en-IN': 60,
  
  // Hindi (Devanagari script) - compact, shorter threshold
  'hi-IN': 35,
  
  // Tamil (Tamil script) - very compact
  'ta-IN': 35,
  
  // Telugu (Telugu script) - compact Indic script
  'te-IN': 35,
  
  // Bengali/Bangla (Bengali script) - compact
  'bn-IN': 35,
  
  // Marathi (Devanagari script) - same as Hindi
  'mr-IN': 35,
  
  // Gujarati (Gujarati script) - compact Indic script
  'gu-IN': 35,
  
  // Kannada (Kannada script) - compact Indic script
  'kn-IN': 35,
  
  // Malayalam (Malayalam script) - compact but complex ligatures
  'ml-IN': 40,
  
  // Punjabi (Gurmukhi script) - compact
  'pa-IN': 35,
  
  // Odia (Odia script) - compact Indic script
  'od-IN': 35,
  
  // Urdu (Perso-Arabic script) - very compact, right-to-left
  'ur-IN': 30,
};

/**
 * Default threshold for unknown languages
 */
const DEFAULT_SENTENCE_LENGTH = 40;

/**
 * Get minimum sentence length for a given language code.
 * Falls back to default if language not configured.
 */
function getMinSentenceLengthForLanguage(languageCode: string): number {
  return LANGUAGE_SENTENCE_THRESHOLDS[languageCode] || DEFAULT_SENTENCE_LENGTH;
}

/**
 * Detect sentence boundaries in text for streaming TTS.
 * Supports 11+ Indian languages plus English.
 * 
 * @param text - The accumulated text buffer to check
 * @param languageCode - Language code (e.g., 'hi-IN', 'ta-IN') for threshold selection
 * @returns [completeSentence, remainder] if boundary found, null otherwise
 */
function detectSentenceBoundary(text: string, languageCode?: string): [string, string] | null {
  const minLength = languageCode ? getMinSentenceLengthForLanguage(languageCode) : DEFAULT_SENTENCE_LENGTH;
  
  // Optimized patterns based on LiveKit agents and Unicode UAX#29
  // Order: Most specific punctuation → Generic patterns
  // 
  // IMPORTANT: Patterns use (\s*) or (\s+)? to handle both:
  // 1. Streaming: tokens come with spaces, detect boundary at "sentence. Next"
  // 2. End of input: detect sentence that ends with punctuation
  const patterns: RegExp[] = [
    // Devanagari Danda (।) and Double Danda (॥) - Hindi, Marathi, Sanskrit
    // U+0964 (DEVANAGARI DANDA), U+0965 (DEVANAGARI DOUBLE DANDA)
    // Requires whitespace after Danda to avoid mid-word splits
    new RegExp(`^(.{${Math.min(minLength, 35)},}?[\u0964\u0965])(\\s+)`),
    // Also match Danda at end of input (for final flush)
    new RegExp(`^(.{${Math.min(minLength, 35)},}?[\u0964\u0965])$`),
    
    // Urdu/Arabic full stop (۔ U+06D4) - Urdu
    new RegExp(`^(.{${Math.min(minLength, 30)},}?[\u06d4])(\\s+)`),
    new RegExp(`^(.{${Math.min(minLength, 30)},}?[\u06d4])$`),
    
    // Standard punctuation (. ! ?) with whitespace - ALL languages
    // Most Indian languages use standard Latin punctuation
    new RegExp(`^(.{${Math.min(minLength, 35)},}?[.!?।॥])(\\s+)`),
    
    // Standard punctuation at end of input
    new RegExp(`^(.{${Math.min(minLength, 35)},}?[.!?।॥])$`),
    
    // English/Latin - Space + capital letter (new sentence starting)
    new RegExp(`^(.{${minLength},}?[.!?])(\\s+)(?=[A-Z])`),
    
    // Sentence ending with newline (all languages)
    new RegExp(`^(.{${Math.min(minLength, 35)},}?[.!?।॥\u06d4])\\n`),
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const completeSentence = match[1];
      const remainder = text.slice(match[0].length);
      return [completeSentence, remainder];
    }
  }
  
  return null;
}

/**
 * Normalize text for Sarvam TTS API
 * Replaces Unicode characters that Sarvam doesn't support with ASCII equivalents
 * This matches Python plugin behavior which handles this automatically
 */
function normalizeTextForTTS(text: string): string {
  return text
    // Curly apostrophes/single quotes to straight apostrophe
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    // Curly double quotes to straight double quotes
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    // Various dashes to hyphen
    .replace(/[\u2013\u2014\u2015]/g, '-')
    // Ellipsis to three dots
    .replace(/\u2026/g, '...')
    // Non-breaking space to regular space
    .replace(/\u00A0/g, ' ')
    // Remove zero-width characters
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    // Trim leading/trailing whitespace
    .trim();
}

export type SarvamTTSLanguage =
  | 'bn-IN' | 'en-IN' | 'gu-IN' | 'hi-IN' | 'kn-IN'
  | 'ml-IN' | 'mr-IN' | 'od-IN' | 'pa-IN' | 'ta-IN' | 'te-IN';

export type SarvamTTSModel = 'bulbul:v2';

export type SarvamTTSSpeaker = 
  | 'anushka'  // Female voice (default for v2)
  | 'manisha'  // Female voice
  | 'vidya'    // Female voice
  | 'arya'     // Female voice
  | 'abhilash' // Male voice
  | 'karun'    // Male voice
  | 'hitesh';  // Male voice

/**
 * Callback fired when TTS synthesizes text (for agent response logging)
 */
export type OnTextSynthesizedCallback = (text: string) => void;

export interface SarvamTTSOptions {
  apiKey: string;
  languageCode: SarvamTTSLanguage | string;
  speaker?: SarvamTTSSpeaker | string;
  model?: SarvamTTSModel | string;
  pitch?: number;  // -20 to 20
  pace?: number;   // 0.5 to 2.0
  loudness?: number;  // 0.5 to 2.0
  enablePreprocessing?: boolean;
  /** Callback fired when TTS starts synthesizing text (for logging agent responses) */
  onTextSynthesized?: OnTextSynthesizedCallback;
}

export class SarvamTTS extends tts.TTS {
  label = 'SarvamTTS';
  
  private apiKey: string;
  private languageCode: string;
  private speaker: string;
  private model: string;
  private pitch: number;
  private pace: number;
  private loudness: number;
  private enablePreprocessing: boolean;
  
  // Callback for logging agent responses
  private onTextSynthesized?: OnTextSynthesizedCallback;
  
  // Official ConnectionPool for WebSocket reuse (reduces latency for multi-turn)
  private wsPool: ConnectionPool<WebSocket>;
  
  // WASM MP3 decoder (5-10x faster than FFmpeg spawn)
  private mp3Decoder?: MPEGDecoder;
  private mp3DecoderReady: Promise<void>;
  
  // Optimization #9: TTS Phrase Cache
  // Caches decoded PCM audio for common phrases (greetings, acknowledgments)
  // Cache hit saves ~800-1200ms (entire Sarvam API round-trip)
  // Key: hash of (text + voice settings), Value: PCM frames
  private phraseCache: Map<string, { frames: AudioFrame[]; createdAt: number }> = new Map();
  private static PHRASE_CACHE_MAX_SIZE = 100;  // Max cached phrases
  private static PHRASE_CACHE_TTL_MS = 3600_000;  // 1 hour TTL

  constructor(options: SarvamTTSOptions) {
    super(SAMPLE_RATE, NUM_CHANNELS, { streaming: true });

    this.apiKey = options.apiKey;
    this.languageCode = options.languageCode;
    this.speaker = options.speaker || 'anushka';
    this.model = options.model || 'bulbul:v2';
    this.pitch = options.pitch ?? 0;
    this.pace = options.pace ?? 0.85; // Slower pace for clearer Tamil pronunciation
    this.loudness = options.loudness ?? 1.0;
    this.enablePreprocessing = options.enablePreprocessing ?? false;
    this.onTextSynthesized = options.onTextSynthesized;
    
    // Initialize connection pool with connect/close callbacks
    this.wsPool = new ConnectionPool<WebSocket>({
      connectCb: async (timeout: number) => {
        return this._createWebSocket(timeout);
      },
      closeCb: async (ws: WebSocket) => {
        try {
          ws.close();
        } catch {}
      },
      maxSessionDuration: 3600_000, // 1 hour (matching Python plugin)
      connectTimeout: 10_000, // 10 seconds
    });
    
    // Initialize WASM MP3 decoder (reusable, no process spawn overhead)
    // This replaces FFmpeg for 5-10x faster decoding (10-20ms vs 100-200ms)
    this.mp3DecoderReady = this._initMp3Decoder();

    logger.info(`SarvamTTS initialized: model=${this.model}, speaker=${this.speaker}, language=${this.languageCode}`);
  }
  
  /**
   * Initialize the WASM MP3 decoder.
   * Called once during construction, decoder is reused for all audio chunks.
   */
  private async _initMp3Decoder(): Promise<void> {
    try {
      const startTime = performance.now();
      this.mp3Decoder = new MPEGDecoder();
      await this.mp3Decoder.ready;
      const initTime = performance.now() - startTime;
      logger.info('WASM MP3 decoder initialized', { initTimeMs: Math.round(initTime) });
    } catch (error) {
      logger.error('Failed to initialize WASM MP3 decoder', { error });
      throw error;
    }
  }
  
  // ============================================================
  // Optimization #9: Phrase Caching
  // Caches synthesized audio for frequently-used phrases
  // Saves ~800-1200ms per cache hit (entire Sarvam API call skipped)
  // ============================================================
  
  /**
   * Generate cache key for phrase.
   * Includes voice settings to ensure audio matches configuration.
   */
  private _getPhraseCacheKey(text: string): string {
    // Include voice config in hash so different voices have different cache entries
    const configString = `${text}|${this.speaker}|${this.languageCode}|${this.pace}|${this.pitch}|${this.model}`;
    return createHash('md5').update(configString).digest('hex');
  }
  
  /**
   * Get cached audio frames for a phrase.
   * @returns Array of AudioFrames if cached and not expired, undefined otherwise
   * @internal - also used by SarvamSynthesizeStream
   */
  _getFromPhraseCache(text: string): AudioFrame[] | undefined {
    const key = this._getPhraseCacheKey(text);
    const entry = this.phraseCache.get(key);
    
    if (!entry) {
      return undefined;
    }
    
    // Check TTL
    if (Date.now() - entry.createdAt > SarvamTTS.PHRASE_CACHE_TTL_MS) {
      this.phraseCache.delete(key);
      logger.debug('Phrase cache entry expired', { key: key.substring(0, 8), textPreview: text.substring(0, 30) });
      return undefined;
    }
    
    logger.info('Phrase cache HIT', { 
      key: key.substring(0, 8),
      textPreview: text.substring(0, 30),
      frames: entry.frames.length,
      savedMs: '~1000ms'
    });
    
    return entry.frames;
  }
  
  /**
   * Store audio frames in phrase cache.
   * Evicts oldest entries if cache is full.
   * @internal - also used by SarvamSynthesizeStream
   */
  _addToPhaseCache(text: string, frames: AudioFrame[]): void {
    // Skip if no frames to cache
    if (frames.length === 0) return;
    
    // Evict oldest if at capacity (simple FIFO eviction)
    if (this.phraseCache.size >= SarvamTTS.PHRASE_CACHE_MAX_SIZE) {
      const oldestKey = this.phraseCache.keys().next().value;
      if (oldestKey) {
        this.phraseCache.delete(oldestKey);
        logger.debug('Phrase cache eviction', { evictedKey: oldestKey.substring(0, 8) });
      }
    }
    
    const key = this._getPhraseCacheKey(text);
    this.phraseCache.set(key, {
      frames: frames,
      createdAt: Date.now(),
    });
    
    // Silent - only log summary at end
    // logger.info('Phrase cached', { 
    //   key: key.substring(0, 8),
    //   textPreview: text.substring(0, 30),
    //   frames: frames.length,
    //   cacheSize: this.phraseCache.size,
    // });
  }
  
  /**
   * Pre-cache common phrases for instant playback.
   * Call during agent initialization after TTS is ready.
   * 
   * @param phrases - Array of phrases to pre-cache (e.g., greetings)
   * @returns Number of phrases successfully cached
   */
  async prewarmPhraseCache(phrases: string[]): Promise<number> {
    logger.info('Pre-warming phrase cache', { phraseCount: phrases.length });
    
    let cached = 0;
    for (const phrase of phrases) {
      const normalizedText = normalizeTextForTTS(phrase);
      if (!normalizedText || normalizedText.length === 0) continue;
      
      // Skip if already cached
      if (this._getFromPhraseCache(normalizedText)) {
        cached++;
        continue;
      }
      
      // Synthesize and cache
      try {
        const frames = await this._synthesizeToFrames(normalizedText);
        if (frames.length > 0) {
          this._addToPhaseCache(normalizedText, frames);
          cached++;
        }
      } catch (error) {
        logger.warning('Failed to pre-cache phrase', { 
          phrase: normalizedText.substring(0, 30),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    logger.info('Phrase cache pre-warmed', { 
      requested: phrases.length,
      cached,
      cacheSize: this.phraseCache.size,
    });
    
    return cached;
  }
  
  /**
   * Get phrase cache statistics.
   */
  getPhraseCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.phraseCache.size,
      maxSize: SarvamTTS.PHRASE_CACHE_MAX_SIZE,
    };
  }
  
  /**
   * Get a WebSocket connection from the pool or create a new one.
   * Uses official ConnectionPool for thread-safe connection reuse.
   */
  async getPooledConnection(): Promise<WebSocket> {
    logger.debug('Getting WebSocket from connection pool');
    return this.wsPool.get();
  }
  
  /**
   * Return a WebSocket to the pool for reuse.
   */
  returnToPool(ws: WebSocket): void {
    if (ws.readyState === WebSocket.OPEN) {
      logger.debug('Returning WebSocket to pool');
      this.wsPool.put(ws);
    } else {
      // Connection dead, remove it
      this.wsPool.remove(ws);
    }
  }
  
  /**
   * Remove a WebSocket from the pool (on error).
   */
  removeFromPool(ws: WebSocket): void {
    this.wsPool.remove(ws);
  }
  
  /**
   * Create a new WebSocket connection to Sarvam TTS.
   */
  private _createWebSocket(timeoutMs: number = 10000): Promise<WebSocket> {
    const params = new URLSearchParams({
      'model': this.model,
      'send_completion_event': 'true',
    });
    
    const wsUrl = `${SARVAM_TTS_WS_URL}?${params}`;
    
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          'api-subscription-key': this.apiKey,
        },
      });
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('WebSocket connection timeout'));
      }, timeoutMs);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        logger.debug('WebSocket connection established');
        resolve(ws);
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        logger.error('WebSocket connection error', { error: error.message });
        reject(error);
      });
    });
  }
  
  /**
   * Prewarm the connection pool (call during agent initialization).
   * Creates multiple connections in parallel for faster first responses.
   * 
   * @param count - Number of connections to prewarm (default: 2)
   *                Matches MAX_PARALLEL in _processSegments() for optimal performance
   */
  prewarm(count: number = 2): void {
    logger.info('Prewarming TTS WebSocket connection pool', { 
      count,
      model: this.model,
      language: this.languageCode,
    });
    
    // Pre-create multiple connections in parallel (non-blocking)
    // This ensures first N TTS requests have connections ready
    for (let i = 0; i < count; i++) {
      this.wsPool.prewarm();
    }
    
    logger.debug('TTS prewarm initiated', { connectionCount: count });
  }
  
  /**
   * Ensure the MP3 decoder is ready for use.
   * Call before using getMp3Decoder().
   */
  async ensureDecoderReady(): Promise<void> {
    await this.mp3DecoderReady;
  }
  
  /**
   * Get the MP3 decoder instance.
   * Call ensureDecoderReady() first to ensure it's initialized.
   */
  getMp3Decoder(): MPEGDecoder | undefined {
    return this.mp3Decoder;
  }
  
  /**
   * Close all pooled connections and free WASM decoder memory.
   */
  async close(): Promise<void> {
    await this.wsPool.close();
    
    // Free WASM decoder memory
    if (this.mp3Decoder) {
      this.mp3Decoder.free();
      this.mp3Decoder = undefined;
      logger.info('WASM MP3 decoder freed');
    }
  }

  synthesize(text: string, connOptions?: APIConnectOptions, abortSignal?: AbortSignal): tts.ChunkedStream {
    // Notify callback that we're synthesizing this text (for agent response logging)
    if (this.onTextSynthesized && text.trim()) {
      try {
        this.onTextSynthesized(text.trim());
      } catch (err) {
        logger.warning('onTextSynthesized callback error', { error: (err as Error).message });
      }
    }
    return new SarvamChunkedStream(text, this, connOptions, abortSignal);
  }

  stream(options?: { connOptions?: APIConnectOptions }): tts.SynthesizeStream {
    return new SarvamSynthesizeStream(this, options?.connOptions);
  }

  getApiKey(): string {
    return this.apiKey;
  }

  getLanguageCode(): string {
    return this.languageCode;
  }

  getSpeaker(): string {
    return this.speaker;
  }

  getModel(): string {
    return this.model;
  }

  getPitch(): number {
    return this.pitch;
  }

  getPace(): number {
    return this.pace;
  }

  getLoudness(): number {
    return this.loudness;
  }

  getEnablePreprocessing(): boolean {
    return this.enablePreprocessing;
  }
  
  /**
   * Set callback for when text is synthesized (for logging agent responses)
   * Can be set after construction if needed
   */
  setOnTextSynthesized(callback: OnTextSynthesizedCallback): void {
    this.onTextSynthesized = callback;
  }
  
  /**
   * Internal method to notify callback from SynthesizeStream
   * Called when text is about to be synthesized
   */
  _notifyTextSynthesized(text: string): void {
    if (this.onTextSynthesized && text.trim()) {
      try {
        this.onTextSynthesized(text.trim());
      } catch (err) {
        logger.warning('onTextSynthesized callback error', { error: (err as Error).message });
      }
    }
  }
  
  /**
   * Synthesize text to PCM audio frames (for phrase cache prewarming).
   * Uses WebSocket API and returns decoded frames without streaming.
   * 
   * @param text - The text to synthesize
   * @returns Array of AudioFrame objects
   */
  private async _synthesizeToFrames(text: string): Promise<AudioFrame[]> {
    const sessionId = `tts_cache_${Date.now()}_${randomUUID().slice(0, 8)}`;
    logger.debug('Synthesizing text for cache', { sessionId, textLength: text.length });
    
    // Get a WebSocket connection
    const ws = await this.getPooledConnection();
    const frames: AudioFrame[] = [];
    let completionReceived = false;
    let shouldReturnToPool = true;
    
    try {
      // Create a promise that resolves when synthesis is complete
      const synthesisComplete = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Synthesis timeout (30s)'));
        }, 30000);
        
        ws.on('message', async (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            
            if (message.type === 'audio') {
              const base64Audio = message.data?.audio;
              if (base64Audio) {
                // Decode and collect frames
                const mp3Buffer = Buffer.from(base64Audio, 'base64');
                
                await this.mp3DecoderReady;
                if (!this.mp3Decoder) {
                  throw new Error('MP3 decoder not initialized');
                }
                
                const mp3Data = new Uint8Array(mp3Buffer);
                const decoded = this.mp3Decoder.decode(mp3Data);
                const pcmFloat32 = decoded.channelData[0];
                
                // Convert Float32 to Int16
                const pcmInt16 = new Int16Array(pcmFloat32.length);
                for (let i = 0; i < pcmFloat32.length; i++) {
                  const sample = Math.max(-1.0, Math.min(1.0, pcmFloat32[i]));
                  pcmInt16[i] = Math.floor(sample * 32767);
                }
                
                // Create audio frames
                const FRAME_SIZE_MS = 50;
                const samplesPerChannel = Math.floor((SAMPLE_RATE * FRAME_SIZE_MS) / 1000);
                const bstream = new AudioByteStream(SAMPLE_RATE, NUM_CHANNELS, samplesPerChannel);
                
                const pcmArrayBuffer = pcmInt16.buffer.slice(
                  pcmInt16.byteOffset,
                  pcmInt16.byteOffset + pcmInt16.byteLength
                ) as ArrayBuffer;
                
                const newFrames = bstream.write(pcmArrayBuffer);
                const flushedFrames = bstream.flush();
                frames.push(...newFrames, ...flushedFrames);
              }
            } else if (message.type === 'event' && message.data?.event_type === 'final') {
              completionReceived = true;
              clearTimeout(timeout);
              resolve();
            } else if (message.type === 'error') {
              clearTimeout(timeout);
              reject(new Error(message.data?.message || 'TTS API error'));
            }
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        });
        
        ws.on('error', (error) => {
          clearTimeout(timeout);
          shouldReturnToPool = false;
          reject(error);
        });
        
        ws.on('close', () => {
          clearTimeout(timeout);
          shouldReturnToPool = false;
          if (!completionReceived) {
            reject(new Error('WebSocket closed before completion'));
          }
        });
      });
      
      // Send config message
      const configMessage = {
        type: 'config',
        data: {
          language_code: this.languageCode,
          speaker: this.speaker,
          pitch: this.pitch,
          pace: this.pace,
          loudness: this.loudness,
          enable_preprocessing: this.enablePreprocessing,
        },
      };
      ws.send(JSON.stringify(configMessage));
      
      // Send text message
      const textMessage = {
        type: 'text',
        data: { text },
      };
      ws.send(JSON.stringify(textMessage));
      
      // Send flush to trigger synthesis
      const flushMessage = { type: 'flush' };
      ws.send(JSON.stringify(flushMessage));
      
      // Wait for completion
      await synthesisComplete;
      
      // Silent - reduce noise
      // logger.info('Text synthesized for cache', { sessionId, frames: frames.length });
      return frames;
      
    } finally {
      ws.removeAllListeners('message');
      ws.removeAllListeners('error');
      ws.removeAllListeners('close');
      
      if (shouldReturnToPool && ws.readyState === WebSocket.OPEN) {
        this.returnToPool(ws);
      } else {
        this.removeFromPool(ws);
      }
    }
  }
}

class SarvamChunkedStream extends tts.ChunkedStream {
  label = 'SarvamChunkedStream';
  
  private ttsInstance: SarvamTTS;
  private ws: WebSocket | null = null;
  private sessionId: string;
  private configSent: boolean = false;

  constructor(text: string, ttsInstance: SarvamTTS, connOptions?: APIConnectOptions, abortSignal?: AbortSignal) {
    super(text, ttsInstance, connOptions, abortSignal);
    this.ttsInstance = ttsInstance;
    this.sessionId = `tts_chunked_${Date.now()}_${randomUUID().slice(0, 9)}`;
  }

  protected async run(): Promise<void> {
    try {
      await this._connectWebSocket();
      // Config will be sent when first text is sent (see _sendText)
      await this._sendText(this.inputText);
      await this._sendFlush();
      
      // Keep connection alive until all audio is received
      await this._waitForCompletion();
    } catch (error) {
      logger.error('Error in TTS chunked stream', { sessionId: this.sessionId, error });
      throw error;
    } finally {
      this._closeWebSocket();
    }
  }

  private async _connectWebSocket(): Promise<void> {
    const params = new URLSearchParams({
      'model': this.ttsInstance.getModel(),
      'send_completion_event': 'true',
    });

    const wsUrl = `${SARVAM_TTS_WS_URL}?${params}`;
    
    logger.info('Connecting to Sarvam TTS WebSocket', { sessionId: this.sessionId });

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'api-subscription-key': this.ttsInstance.getApiKey(),
        },
      });

      this.ws.on('open', () => {
        logger.info('TTS WebSocket connected', { sessionId: this.sessionId });
        resolve();
      });

      this.ws.on('error', (error) => {
        logger.error('TTS WebSocket error', { sessionId: this.sessionId, error: error.message });
        reject(error);
      });

      this.ws.on('message', (data: Buffer) => {
        this._handleMessage(data);
      });

      this.ws.on('close', (code, reason) => {
        logger.info('TTS WebSocket closed', { sessionId: this.sessionId, code, reason: reason.toString() });
      });
    });
  }

  private async _sendConfig(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (this.configSent) {
      return; // Already sent
    }

    const configMessage = {
      type: 'config',
      data: {
        target_language_code: this.ttsInstance.getLanguageCode(),
        speaker: this.ttsInstance.getSpeaker(),
        pitch: this.ttsInstance.getPitch(),
        pace: this.ttsInstance.getPace(),
        loudness: this.ttsInstance.getLoudness(),
        enable_preprocessing: this.ttsInstance.getEnablePreprocessing(),
        model: this.ttsInstance.getModel(),
      },
    };

    logger.info('Sending TTS config (chunked)', { sessionId: this.sessionId, config: configMessage });
    this.ws.send(JSON.stringify(configMessage));
    this.configSent = true;
    logger.info('TTS config sent successfully (chunked)', { sessionId: this.sessionId });
  }

  private async _sendText(text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Send config before first text
    if (!this.configSent) {
      await this._sendConfig();
    }

    const textMessage = {
      type: 'text',
      data: {
        text,
      },
    };

    this.ws.send(JSON.stringify(textMessage));
    logger.debug('Sent text to TTS', { sessionId: this.sessionId, textLength: text.length });
  }

  private async _sendFlush(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const flushMessage = {
      type: 'flush',
    };

    this.ws.send(JSON.stringify(flushMessage));
    logger.debug('Sent flush to TTS', { sessionId: this.sessionId });
  }

  private completionReceived = false;

  private async _waitForCompletion(): Promise<boolean> {
    // Wait for completion event
    const timeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (!this.completionReceived && Date.now() - startTime < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.completionReceived) {
      logger.error('TTS completion timeout - no completion event received', { 
        sessionId: this.sessionId,
        timeoutMs: timeout,
        elapsedMs: Date.now() - startTime
      });
      return false;
    }
    
    return true;
  }

  private _handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      const msgType = message.type;

      if (msgType === 'audio') {
        this._handleAudio(message.data);
      } else if (msgType === 'event') {
        this._handleEvent(message.data);
      } else if (msgType === 'error') {
        this._handleError(message.data);
      }
    } catch (error) {
      logger.error('Error parsing TTS message', { sessionId: this.sessionId, error });
    }
  }

  private _handleAudio(data: any): void {
    try {
      const base64Audio = data?.audio;
      if (!base64Audio) return;

      // Decode base64 to PCM Int16 data
      const pcmBuffer = Buffer.from(base64Audio, 'base64');
      const int16Data = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);

      const audioFrame = new AudioFrame(
        int16Data,
        SAMPLE_RATE,
        NUM_CHANNELS,
        int16Data.length
      );

      const synthesizedAudio: tts.SynthesizedAudio = {
        requestId: this.sessionId,
        segmentId: this.sessionId,
        frame: audioFrame,
        final: false,
      };

      this.queue.put(synthesizedAudio);
    } catch (error) {
      logger.error('Error handling audio data', { sessionId: this.sessionId, error });
    }
  }

  private _handleEvent(data: any): void {
    const eventType = data?.event_type;
    
    if (eventType === 'final') {
      this.completionReceived = true;
      logger.debug('Received TTS completion event', { sessionId: this.sessionId });
    }
  }

  private _handleError(data: any): void {
    const errorMsg = data?.message || 'Unknown error';
    logger.error('TTS API error', { sessionId: this.sessionId, error: errorMsg });
  }

  private _closeWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Segment represents a single TTS request/response cycle.
 * Each segment gets its own WebSocket connection.
 */
interface Segment {
  id: string;
  textChunks: string[];
  resolve: () => void;
  reject: (error: Error) => void;
}

class SarvamSynthesizeStream extends tts.SynthesizeStream {
  label = 'SarvamSynthesizeStream';
  
  private ttsInstance: SarvamTTS;
  private streamId: string;
  private segmentCount = 0;
  
  // Segment queue for multi-turn handling (like Python's _segments_ch)
  private segmentQueue: Segment[] = [];
  private currentTextChunks: string[] = [];
  private segmentResolvers: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private inputClosed = false;
  private processingSegment = false;
  
  // Track connections that have already received config message
  // Optimization #7: Skip redundant config sends for reused connections
  // WeakSet allows garbage collection when connection is closed
  private configuredConnections = new WeakSet<WebSocket>();

  constructor(ttsInstance: SarvamTTS, connOptions?: APIConnectOptions) {
    super(ttsInstance, connOptions);
    this.ttsInstance = ttsInstance;
    this.streamId = `tts_stream_${Date.now()}_${randomUUID().slice(0, 9)}`;
  }

  protected async run(): Promise<void> {
    // Silent - reduce noise
    // logger.info('SynthesizeStream started - ready for multiple segments', { streamId: this.streamId });
    
    try {
      // Two parallel tasks (like Python's asyncio.gather pattern):
      // 1. Tokenize input - collects text and creates segments on flush
      // 2. Process segments - processes each segment with its own WebSocket
      
      const tokenizePromise = this._tokenizeInput();
      const processPromise = this._processSegments();
      
      await Promise.all([tokenizePromise, processPromise]);
      
    } catch (error) {
      logger.error('Error in TTS synthesize stream', { streamId: this.streamId, error });
      throw error;
    }
    
    // Silent - reduce noise
    // logger.info('SynthesizeStream completed - all segments processed', { 
    //   streamId: this.streamId, 
    //   totalSegments: this.segmentCount 
    // });
  }
  
  /**
   * Collect text from input and create segments on flush (like Python's _tokenize_input)
   * 
   * Phase 2 Optimization: Detect sentence boundaries and flush automatically
   * This enables first sentence to start playing while LLM generates the rest
   */
  private async _tokenizeInput(): Promise<void> {
    // Silent - reduce noise
    // logger.info('Starting input tokenizer with sentence detection', { streamId: this.streamId });
    
    // Sentence buffer for accumulating tokens until sentence boundary
    let sentenceBuffer = '';
    
    try {
      for await (const textOrSentinel of this.input) {
        if (textOrSentinel === SarvamSynthesizeStream.FLUSH_SENTINEL) {
          // Flush means end of current segment - create and queue it
          // First flush any remaining sentence buffer
          if (sentenceBuffer.trim()) {
            this.currentTextChunks.push(sentenceBuffer);
            sentenceBuffer = '';
          }
          if (this.currentTextChunks.length > 0) {
            await this._createAndQueueSegment();
          }
          continue;
        }
        
        // Accumulate text for current segment
        const text = textOrSentinel as string;
        if (text && text.trim()) {
          sentenceBuffer += text;
          
          // Check for sentence boundaries and auto-flush for streaming
          // Use language-aware threshold for optimal TTFB across all Indian languages
          const languageCode = (this.ttsInstance as SarvamTTS).getLanguageCode();
          const minLength = getMinSentenceLengthForLanguage(languageCode);
          
          if (sentenceBuffer.length >= minLength) {
            const boundary = detectSentenceBoundary(sentenceBuffer, languageCode);
            if (boundary) {
              const [completeSentence, remainder] = boundary;
              sentenceBuffer = remainder;
              
              this.currentTextChunks.push(completeSentence);
              
              logger.debug('Sentence detected - auto-flushing for low latency', { 
                streamId: this.streamId, 
                sentenceLength: completeSentence.length,
                sentencePreview: completeSentence.substring(0, 50),
                remainderLength: remainder.length,
              });
              
              // Auto-flush the sentence immediately for lower TTFB
              await this._createAndQueueSegment();
            }
          }
        }
      }
      
      // Input stream closed - flush any remaining text as final segment
      // BUT: Skip very short fragments (< 15 chars) as they're likely incomplete
      // This prevents "நாங்கள் த" type mid-word cuts that sound terrible
      if (sentenceBuffer.trim() && sentenceBuffer.trim().length >= 15) {
        this.currentTextChunks.push(sentenceBuffer);
        logger.debug('Flushing final sentence buffer', {
          streamId: this.streamId,
          length: sentenceBuffer.length,
          preview: sentenceBuffer.substring(0, 50),
        });
      } else if (sentenceBuffer.trim()) {
        logger.warning('Dropping incomplete short fragment at end of stream', {
          streamId: this.streamId,
          fragment: sentenceBuffer.trim(),
          length: sentenceBuffer.trim().length,
        });
      }
      if (this.currentTextChunks.length > 0) {
        await this._createAndQueueSegment();
      }
      
    } finally {
      this.inputClosed = true;
      // Silent - reduce noise
    // logger.info('Input tokenizer finished', { streamId: this.streamId });
    }
  }
  
  /**
   * Create a segment from accumulated text and queue it for processing.
   * 
   * OPTIMIZATION: Don't wait for segment completion - enables parallel processing.
   * LiveKit SDK handles audio frame ordering, so segments can be processed in parallel
   * while audio output remains properly sequenced.
   */
  private async _createAndQueueSegment(): Promise<void> {
    this.segmentCount++;
    const segmentId = `${this.streamId}_seg${this.segmentCount}`;
    
    const segment: Segment = {
      id: segmentId,
      textChunks: [...this.currentTextChunks],
      resolve: () => {},
      reject: () => {},
    };
    
    // Create a promise that resolves when this segment is processed
    // This is used by the parallel processor to track completion
    new Promise<void>((resolve, reject) => {
      segment.resolve = resolve;
      segment.reject = reject;
    });
    
    this.segmentQueue.push(segment);
    this.currentTextChunks = []; // Reset for next segment
    
    // Silent - reduce noise
    // logger.info('Segment queued for parallel processing', { 
    //   streamId: this.streamId, 
    //   segmentId,
    //   textChunks: segment.textChunks.length,
    //   queueLength: this.segmentQueue.length
    // });
    
    // NOTE: We no longer await segmentPromise here!
    // This enables parallel processing - segments are queued immediately
    // and processed by _processSegments() in parallel (up to MAX_PARALLEL).
    // Audio frame ordering is handled by LiveKit SDK.
  }
  
  /**
   * Process segments in parallel (up to MAX_PARALLEL) for pipeline optimization.
   * 
   * Previous: Sequential sentence-by-sentence
   *   Sentence 1: [LLM→TTS→Play] → Sentence 2: [LLM→TTS→Play] → ...
   *   Total: 1500ms + 1500ms + 1500ms = 4500ms for 3 sentences
   * 
   * Optimized: Pipeline overlapping
   *   Sentence 1: [LLM→TTS→Play]
   *                  ↓ (while playing)
   *   Sentence 2:    [LLM→TTS→Play]
   *                     ↓ (while playing)
   *   Sentence 3:       [LLM→TTS→Play]
   *   Total: 1500ms + 500ms + 500ms = 2500ms for 3 sentences
   * 
   * Expected Savings: -500ms per additional sentence (after first)
   */
  private async _processSegments(): Promise<void> {
    const MAX_PARALLEL = 2; // Pipeline 2 segments at once
    const activeProcessing = new Set<Promise<void>>();
    
    // Silent - reduce noise
    // logger.info('Starting parallel segment processor', { 
    //   streamId: this.streamId, 
    //   maxParallel: MAX_PARALLEL 
    // });
    
    while (true) {
      // Wait for a segment to be available or input to close
      while (this.segmentQueue.length === 0 && !this.inputClosed) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Check if we're done (no more segments and input closed)
      if (this.segmentQueue.length === 0 && this.inputClosed) {
        break;
      }
      
      // Process segments in parallel (up to MAX_PARALLEL)
      while (this.segmentQueue.length > 0 && activeProcessing.size < MAX_PARALLEL) {
        const segment = this.segmentQueue.shift()!;
        
        logger.debug('Starting parallel segment processing', { 
          segmentId: segment.id, 
          activeCount: activeProcessing.size + 1,
          queueRemaining: this.segmentQueue.length 
        });
        
        const promise = this._processOneSegment(segment)
          .then(() => {
            segment.resolve();
            logger.debug('Parallel segment completed', { segmentId: segment.id });
          })
          .catch((err) => {
            logger.error('Error processing segment in parallel', { segmentId: segment.id, error: err });
            segment.reject(err as Error);
          })
          .finally(() => {
            activeProcessing.delete(promise);
          });
        
        activeProcessing.add(promise);
      }
      
      // Wait for at least one to complete before continuing (enables pipeline flow)
      if (activeProcessing.size >= MAX_PARALLEL) {
        logger.debug('Max parallel reached, waiting for one to complete', { 
          activeCount: activeProcessing.size 
        });
        await Promise.race([...activeProcessing]);
      }
    }
    
    // Wait for remaining segments to complete
    if (activeProcessing.size > 0) {
      // Silent - reduce noise
      // logger.info('Waiting for remaining parallel segments', { 
      //   remainingCount: activeProcessing.size 
      // });
      await Promise.all([...activeProcessing]);
    }
    
    // 🎯 CRITICAL FIX: Send END_OF_STREAM only ONCE after ALL segments are processed
    // Previously this was sent after EACH segment, causing early termination
    logger.debug('All segments processed, sending final END_OF_STREAM', { 
      streamId: this.streamId,
      totalSegments: this.segmentCount
    });
    this.queue.put(SarvamSynthesizeStream.END_OF_STREAM);
    
    // Silent - reduce noise
    // logger.info('Segment processor finished - all parallel segments completed', { 
    //   streamId: this.streamId 
    // });
  }
  
  /**
   * Process a single segment using pooled WebSocket connection with retry logic
   */
  private async _processOneSegment(segment: Segment): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this._processOneSegmentInternal(segment, attempt);
        return; // Success!
      } catch (error: any) {
        lastError = error;
        logger.warning('TTS segment processing failed, will retry', {
          segmentId: segment.id,
          attempt,
          maxRetries,
          error: error.message
        });
        
        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          logger.info('Waiting before retry', { segmentId: segment.id, delayMs, nextAttempt: attempt + 1 });
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    // All retries failed
    logger.error('TTS segment processing failed after all retries', {
      segmentId: segment.id,
      attempts: maxRetries,
      finalError: lastError?.message
    });
    throw new Error(`TTS failed after ${maxRetries} attempts: ${lastError?.message}`);
  }
  
  /**
   * Internal method to process a single segment (called by retry wrapper)
   */
  private async _processOneSegmentInternal(segment: Segment, attempt: number = 1): Promise<void> {
    const { id: segmentId, textChunks } = segment;
    
    logger.debug('Processing segment attempt', { segmentId, attempt });
    
    // Join all text chunks into a single string and normalize
    // This matches Python plugin behavior which sends complete sentences, not individual tokens
    const combinedText = normalizeTextForTTS(textChunks.join(''));
    
    if (combinedText.length === 0) {
      logger.warning('Segment has no valid text after normalization, skipping', { segmentId });
      return;
    }
    
    // 🎤 CRITICAL: Notify callback that we're synthesizing this text (for agent response logging)
    // This captures EXACTLY what text is being spoken by the agent
    this.ttsInstance._notifyTextSynthesized(combinedText);
    
    // Silent - reduce noise
    // logger.info('Processing segment', { 
    //   streamId: this.streamId, 
    //   segmentId,
    //   originalChunks: textChunks.length,
    //   combinedTextLength: combinedText.length,
    //   textPreview: combinedText.substring(0, 100) + (combinedText.length > 100 ? '...' : '')
    // });
    
    // ============================================================
    // Optimization #9: Check phrase cache first
    // Cache hit saves ~800-1200ms (entire Sarvam API call skipped)
    // ============================================================
    const cachedFrames = this.ttsInstance._getFromPhraseCache(combinedText);
    if (cachedFrames && cachedFrames.length > 0) {
      logger.info('Using cached audio for segment', { 
        segmentId, 
        frames: cachedFrames.length,
        textPreview: combinedText.substring(0, 30),
      });
      
      // Queue cached frames directly
      for (let i = 0; i < cachedFrames.length; i++) {
        const frame = cachedFrames[i];
        const synthesizedAudio: tts.SynthesizedAudio = {
          requestId: segmentId,
          segmentId: segmentId,
          frame: frame,
          final: i === cachedFrames.length - 1,
        };
        this.queue.put(synthesizedAudio);
      }
      
      logger.info('Cached audio frames queued', { segmentId, frames: cachedFrames.length });
      return; // Skip API call entirely
    }
    
    // Get connection from pool (reused or new)
    let ws: WebSocket | null = null;
    let completionReceived = false;
    let pendingAudioDecodes = 0;
    let shouldReturnToPool = true;
    
    // Collect frames for caching (only for short phrases likely to repeat)
    const shouldCacheThisPhrase = combinedText.length < 200;  // Cache phrases under 200 chars
    const collectedFrames: AudioFrame[] = [];
    
    try {
      // Get WebSocket from pool (fast!) instead of creating new connection
      ws = await this.ttsInstance.getPooledConnection();
      // Silent - reduce noise
      // logger.info('Got WebSocket for segment', { segmentId, reused: true });
      
      // Set up message handling for this segment
      const messageHandler = async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          const msgType = message.type;
          
          logger.debug('TTS message received', { segmentId, msgType });
          
          if (msgType === 'audio') {
            pendingAudioDecodes++;
            try {
              // Modified to collect frames for caching
              const frames = await this._handleAudioForSegmentWithFrames(message.data, segmentId);
              if (shouldCacheThisPhrase && frames) {
                collectedFrames.push(...frames);
              }
            } catch (err: any) {
              // Ignore queue closure errors (expected during cleanup)
              if (err.message !== 'Queue is closed') {
                logger.error('Error processing audio frames', { segmentId, error: err.message });
              }
            } finally {
              pendingAudioDecodes--;
            }
          } else if (msgType === 'event') {
            const eventType = message.data?.event_type;
            if (eventType === 'final') {
              completionReceived = true;
              // Silent - reduce noise
              // logger.info('Segment completion received', { segmentId });
              
              // Cache the phrase after successful completion
              if (shouldCacheThisPhrase && collectedFrames.length > 0) {
                this.ttsInstance._addToPhaseCache(combinedText, collectedFrames);
              }
            }
          } else if (msgType === 'error') {
            logger.error('TTS API error', { segmentId, error: message.data?.message });
            shouldReturnToPool = false; // Don't reuse errored connection
          }
        } catch (error) {
          logger.error('Error handling message', { segmentId, error });
        }
      };
      
      // Remove old listeners and add new ones for this segment
      ws.removeAllListeners('message');
      ws.on('message', messageHandler);
      
      ws.removeAllListeners('close');
      ws.on('close', (code, reason) => {
        logger.debug('WebSocket closed', { segmentId, code });
        shouldReturnToPool = false;
      });
      
      ws.removeAllListeners('error');
      ws.on('error', (error) => {
        logger.error('WebSocket error during segment', { segmentId, error: error.message });
        shouldReturnToPool = false;
      });
      
      // Optimization #7: Only send config if this connection hasn't been configured
      // Sarvam API maintains config state per WebSocket connection
      // This saves ~20-50ms per segment (after first)
      const isNewConnection = !this.configuredConnections.has(ws);
      
      if (isNewConnection) {
        const configMessage = {
          type: 'config',
          data: {
            target_language_code: this.ttsInstance.getLanguageCode(),
            speaker: this.ttsInstance.getSpeaker(),
            pitch: this.ttsInstance.getPitch(),
            pace: this.ttsInstance.getPace(),
            loudness: this.ttsInstance.getLoudness(),
            enable_preprocessing: this.ttsInstance.getEnablePreprocessing(),
            model: this.ttsInstance.getModel(),
          },
        };
        ws.send(JSON.stringify(configMessage));
        this.configuredConnections.add(ws);
        // Silent - reduce noise
        // logger.info('Config sent for new connection', { segmentId, connectionConfigured: true });
      } else {
        logger.debug('Reusing configured connection, skipping config', { segmentId });
      }
      
      // Send the complete combined text as a single message (like Python plugin does with sentences)
      const textMessage = { type: 'text', data: { text: combinedText } };
      ws.send(JSON.stringify(textMessage));
      logger.debug('Text sent', { segmentId, textLength: combinedText.length });
      
      // Send flush to trigger synthesis
      ws.send(JSON.stringify({ type: 'flush' }));
      // Silent - reduce noise
    // logger.info('Flush sent for segment', { segmentId });
      
      // Wait for completion with timeout
      const timeout = 30000;
      const startTime = Date.now();
      
      while (!completionReceived && Date.now() - startTime < timeout) {
        if (ws.readyState !== WebSocket.OPEN) {
          logger.warning('WebSocket closed before completion', { segmentId });
          shouldReturnToPool = false;
          throw new Error(`WebSocket closed before TTS completion for segment ${segmentId}`);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // Check if we timed out
      if (!completionReceived) {
        shouldReturnToPool = false;
        const elapsedMs = Date.now() - startTime;
        logger.error('TTS completion timeout - segment processing failed', {
          segmentId,
          timeoutMs: timeout,
          elapsedMs,
          textPreview: combinedText.substring(0, 100)
        });
        throw new Error(`TTS completion timeout after ${elapsedMs}ms for segment ${segmentId}`);
      }
      
      // Wait for pending audio decodes
      const decodeStart = Date.now();
      while (pendingAudioDecodes > 0 && Date.now() - decodeStart < 10000) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      // NOTE: END_OF_STREAM is now sent ONLY ONCE after ALL segments complete
      // in _processSegments(), not after each individual segment.
      // This fixes the bug where only the first sentence was played.
      
    } finally {
      // Return WebSocket to pool for reuse (reduces latency for next segment)
      if (ws) {
        if (shouldReturnToPool && ws.readyState === WebSocket.OPEN) {
          this.ttsInstance.returnToPool(ws);
          // Silent - reduce noise
          // logger.info('WebSocket returned to pool for segment', { segmentId });
        } else {
          // Remove from pool on error (pool.remove handles closure)
          this.ttsInstance.removeFromPool(ws);
          logger.info('WebSocket removed from pool for segment', { segmentId });
        }
      }
    }
  }
  
  /**
   * Handle audio data for a segment - decode MP3 and queue frames
   */
  private async _handleAudioForSegment(data: any, segmentId: string): Promise<void> {
    const base64Audio = data?.audio;
    if (!base64Audio) {
      logger.warning('No audio data in message', { segmentId });
      return;
    }
    
    logger.debug('Decoding audio for segment', { segmentId, encodedLength: base64Audio.length });
    
    // Decode base64 to MP3
    const mp3Buffer = Buffer.from(base64Audio, 'base64');
    
    // Decode MP3 to PCM
    const pcmBuffer = await this._decodeMp3ToPcm(mp3Buffer);
    const int16Data = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
    
    // Silent - reduce noise
    // logger.info('Audio decoded for segment', { 
    //   segmentId, 
    //   samples: int16Data.length,
    //   durationMs: (int16Data.length / SAMPLE_RATE * 1000).toFixed(0)
    // });
    
    // Use AudioByteStream to create frames (50ms each)
    const FRAME_SIZE_MS = 50;
    const samplesPerChannel = Math.floor((SAMPLE_RATE * FRAME_SIZE_MS) / 1000);
    const bstream = new AudioByteStream(SAMPLE_RATE, NUM_CHANNELS, samplesPerChannel);
    
    const pcmArrayBuffer = int16Data.buffer.slice(
      int16Data.byteOffset,
      int16Data.byteOffset + int16Data.byteLength
    ) as ArrayBuffer;
    
    // Get frames from the byte stream
    const frames = bstream.write(pcmArrayBuffer);
    const flushedFrames = bstream.flush();
    
    // Combine all frames
    const allFrames = [...frames, ...flushedFrames];
    let chunksQueued = 0;
    
    // Queue frames IMMEDIATELY without holding buffer
    // This reduces perceived latency by ~30-50ms
    for (let i = 0; i < allFrames.length; i++) {
      const frame = allFrames[i];
      const isLastFrame = i === allFrames.length - 1;
      
      const synthesizedAudio: tts.SynthesizedAudio = {
        requestId: segmentId,
        segmentId: segmentId,
        frame: frame,
        final: isLastFrame,  // Mark only the actual last frame as final
      };
      this.queue.put(synthesizedAudio);
      chunksQueued++;
      
      // Log first frame for latency tracking
      if (i === 0) {
        logger.debug('First audio frame queued', {
          segmentId,
          samples: frame.samplesPerChannel,
          durationMs: Math.round((frame.samplesPerChannel / SAMPLE_RATE) * 1000),
        });
      }
    }
    
    // Silent - reduce noise
    // logger.info('Audio frames queued for segment', { segmentId, chunksQueued });
  }
  
  /**
   * Handle audio data for a segment - decode MP3, queue frames, and return frames for caching.
   * This variant returns the frames so they can be collected for phrase caching.
   */
  private async _handleAudioForSegmentWithFrames(data: any, segmentId: string): Promise<AudioFrame[]> {
    const base64Audio = data?.audio;
    if (!base64Audio) {
      logger.warning('No audio data in message', { segmentId });
      return [];
    }
    
    logger.debug('Decoding audio for segment (with frame collection)', { segmentId, encodedLength: base64Audio.length });
    
    // Decode base64 to MP3
    const mp3Buffer = Buffer.from(base64Audio, 'base64');
    
    // Decode MP3 to PCM
    const pcmBuffer = await this._decodeMp3ToPcm(mp3Buffer);
    const int16Data = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
    
    // Silent - reduce noise
    // logger.info('Audio decoded for segment', { 
    //   segmentId, 
    //   samples: int16Data.length,
    //   durationMs: (int16Data.length / SAMPLE_RATE * 1000).toFixed(0)
    // });
    
    // Use AudioByteStream to create frames (50ms each)
    const FRAME_SIZE_MS = 50;
    const samplesPerChannel = Math.floor((SAMPLE_RATE * FRAME_SIZE_MS) / 1000);
    const bstream = new AudioByteStream(SAMPLE_RATE, NUM_CHANNELS, samplesPerChannel);
    
    const pcmArrayBuffer = int16Data.buffer.slice(
      int16Data.byteOffset,
      int16Data.byteOffset + int16Data.byteLength
    ) as ArrayBuffer;
    
    // Get frames from the byte stream
    const frames = bstream.write(pcmArrayBuffer);
    const flushedFrames = bstream.flush();
    
    // Combine all frames
    const allFrames = [...frames, ...flushedFrames];
    let chunksQueued = 0;
    
    // Queue frames IMMEDIATELY without holding buffer
    for (let i = 0; i < allFrames.length; i++) {
      const frame = allFrames[i];
      const isLastFrame = i === allFrames.length - 1;
      
      const synthesizedAudio: tts.SynthesizedAudio = {
        requestId: segmentId,
        segmentId: segmentId,
        frame: frame,
        final: isLastFrame,
      };
      this.queue.put(synthesizedAudio);
      chunksQueued++;
    }
    
    // Silent - reduce noise
    // logger.info('Audio frames queued for segment (with caching)', { segmentId, chunksQueued });
    
    // Return frames for caching
    return allFrames;
  }
  
  /**
   * Decode MP3 audio to PCM using WASM decoder.
   * 
   * Performance: 10-20ms vs 100-200ms with FFmpeg spawn
   * This is a 5-10x speedup per audio chunk.
   */
  private async _decodeMp3ToPcm(mp3Buffer: Buffer): Promise<Buffer> {
    const startTime = performance.now();
    
    // Ensure WASM decoder is initialized
    await this.ttsInstance.ensureDecoderReady();
    const decoder = this.ttsInstance.getMp3Decoder();
    
    if (!decoder) {
      throw new Error('MP3 decoder not initialized');
    }
    
    try {
      // Convert Buffer to Uint8Array for WASM decoder
      const mp3Data = new Uint8Array(mp3Buffer);
      
      // Decode MP3 using WASM (synchronous decode, but WASM is fast)
      const decoded = decoder.decode(mp3Data);
      
      // Log sample rate mismatch warning if needed
      if (decoded.sampleRate !== SAMPLE_RATE) {
        logger.warning('Sample rate mismatch', {
          expected: SAMPLE_RATE,
          actual: decoded.sampleRate,
        });
      }
      
      // Get mono channel (Sarvam returns mono audio)
      // If stereo, take left channel
      const pcmFloat32 = decoded.channelData[0];
      
      // Convert Float32 [-1.0, 1.0] to Int16 [-32768, 32767]
      const pcmInt16 = new Int16Array(pcmFloat32.length);
      for (let i = 0; i < pcmFloat32.length; i++) {
        // Clamp to [-1.0, 1.0] range and scale to Int16
        const sample = Math.max(-1.0, Math.min(1.0, pcmFloat32[i]));
        pcmInt16[i] = Math.floor(sample * 32767);
      }
      
      const decodeTime = performance.now() - startTime;
      
      logger.debug('MP3 decoded with WASM', {
        inputBytes: mp3Buffer.length,
        outputSamples: pcmInt16.length,
        sampleRate: decoded.sampleRate,
        channels: decoded.channelData.length,
        decodeTimeMs: Math.round(decodeTime * 100) / 100,
      });
      
      // Return as Buffer for compatibility with existing code
      return Buffer.from(pcmInt16.buffer);
      
    } catch (error) {
      logger.error('WASM MP3 decoding failed', { error });
      throw error;
    }
  }
}
