/**
 * Sarvam AI Speech-to-Text Plugin for LiveKit Agents (TypeScript)
 * 
 * Based on official Python implementation from livekit/agents repository
 * Implements WebSocket streaming with PCM audio chunks
 * 
 * Optimization: ConnectionPool for WebSocket reuse and pre-warming
 */

import { stt, type APIConnectOptions, type AudioBuffer, ConnectionPool } from '@livekit/agents';
import type { AudioFrame } from '@livekit/rtc-node';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { getLogger } from '../core/logging.js';

const logger = getLogger('sarvam.stt');

const SARVAM_STT_WS_URL = 'wss://api.sarvam.ai/speech-to-text/ws';

export type SarvamSTTLanguage =
  | 'bn-IN' | 'en-IN' | 'gu-IN' | 'hi-IN' | 'kn-IN'
  | 'ml-IN' | 'mr-IN' | 'od-IN' | 'pa-IN' | 'ta-IN' | 'te-IN';

export type SarvamSTTModel = 'saarika:v2.5' | 'saarika:v2.0';

export interface SarvamSTTOptions {
  apiKey: string;
  languageCode: SarvamSTTLanguage | string;
  model?: SarvamSTTModel | string;
  sampleRate?: number;
  highVadSensitivity?: boolean;
  vadSignals?: boolean;
}

export class SarvamSTT extends stt.STT {
  label = 'SarvamSTT';
  
  private apiKey: string;
  private languageCode: string;
  private model: string;
  private _sampleRate: number;
  private highVadSensitivity: boolean;
  private vadSignals: boolean;
  
  // Connection pool for WebSocket reuse (reduces first-turn latency)
  private wsPool: ConnectionPool<WebSocket>;

  constructor(options: SarvamSTTOptions) {
    super({ streaming: true, interimResults: true });

    this.apiKey = options.apiKey;
    this.languageCode = options.languageCode;
    this.model = options.model || 'saarika:v2.5';
    this._sampleRate = options.sampleRate || 16000;
    this.highVadSensitivity = options.highVadSensitivity ?? false;
    this.vadSignals = options.vadSignals ?? true;
    
    // Initialize connection pool with connect/close callbacks
    this.wsPool = new ConnectionPool<WebSocket>({
      connectCb: async (timeout: number) => {
        return this._createWebSocket(timeout);
      },
      closeCb: async (ws: WebSocket) => {
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000, 'Pool cleanup');
          }
        } catch {}
      },
      maxSessionDuration: 300_000, // 5 minutes (STT sessions are shorter than TTS)
      connectTimeout: 10_000, // 10 seconds
    });

    logger.info(`SarvamSTT initialized: model=${this.model}, language=${this.languageCode}`);
  }
  
  /**
   * Create a new WebSocket connection to Sarvam STT API.
   * Called by ConnectionPool when a new connection is needed.
   */
  private async _createWebSocket(timeout: number): Promise<WebSocket> {
    const params = new URLSearchParams({
      'language-code': this.languageCode,
      'model': this.model,
      'vad_signals': this.vadSignals.toString(),
      'sample_rate': this._sampleRate.toString(),
      'high_vad_sensitivity': this.highVadSensitivity.toString(),
    });

    const wsUrl = `${SARVAM_STT_WS_URL}?${params}`;
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`WebSocket connection timeout after ${timeout}ms`));
      }, timeout);
      
      const ws = new WebSocket(wsUrl, {
        headers: {
          'api-subscription-key': this.apiKey,
        },
      });

      ws.on('open', () => {
        clearTimeout(timeoutId);
        logger.debug('STT WebSocket created for pool', { url: wsUrl });
        resolve(ws);
      });

      ws.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  stream(options?: { connOptions?: APIConnectOptions }): stt.SpeechStream {
    return new SarvamSpeechStream(this, this._sampleRate, this.wsPool, options?.connOptions);
  }

  protected async _recognize(_frame: AudioBuffer, _abortSignal?: AbortSignal): Promise<stt.SpeechEvent> {
    throw new Error('SarvamSTT only supports streaming recognition, use stream() instead');
  }
  
  /**
   * Pre-warm the connection pool by creating connections ahead of time.
   * Call this during agent initialization for faster first response.
   * @param count - Number of connections to pre-warm (default: 1)
   */
  prewarm(count: number = 1): void {
    logger.info('Pre-warming STT WebSocket connection pool', { count });
    for (let i = 0; i < count; i++) {
      this.wsPool.prewarm();
    }
  }
  
  /**
   * Close the connection pool and cleanup resources.
   */
  async close(): Promise<void> {
    logger.info('Closing SarvamSTT connection pool');
    await this.wsPool.close();
  }
  
  getApiKey(): string {
    return this.apiKey;
  }

  getLanguageCode(): string {
    return this.languageCode;
  }

  getModel(): string {
    return this.model;
  }

  getSampleRate(): number {
    return this._sampleRate;
  }

  getHighVadSensitivity(): boolean {
    return this.highVadSensitivity;
  }

  getVadSignals(): boolean {
    return this.vadSignals;
  }
}

class SarvamSpeechStream extends stt.SpeechStream {
  label = 'SarvamSpeechStream';
  
  private sttInstance: SarvamSTT;
  private wsPool: ConnectionPool<WebSocket>;
  private ws: WebSocket | null = null;
  private speaking = false;
  private sessionId: string;
  private audioBuffer: Int16Array[] = [];
  private readonly CHUNK_DURATION_MS = 100;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY_MS = 1000;
  private isClosed = false;

  constructor(sttInstance: SarvamSTT, sampleRate: number, wsPool: ConnectionPool<WebSocket>, connOptions?: APIConnectOptions) {
    super(sttInstance, sampleRate, connOptions);
    this.sttInstance = sttInstance;
    this.wsPool = wsPool;
    this.sessionId = `stt_${Date.now()}_${randomUUID().slice(0, 9)}`;
  }

  protected async run(): Promise<void> {
    await this._connectWebSocket();
    await this._processAudioFrames();
  }

  private async _connectWebSocket(): Promise<void> {
    const startTime = performance.now();
    
    logger.info('Acquiring STT WebSocket from pool', { sessionId: this.sessionId });
    
    try {
      // Try to get a pre-warmed connection from the pool
      this.ws = await this.wsPool.get();
      const acquireTime = performance.now() - startTime;
      
      logger.info('STT WebSocket acquired from pool', { 
        sessionId: this.sessionId, 
        acquireTimeMs: Math.round(acquireTime),
        isReused: acquireTime < 100 // If < 100ms, likely a cached connection
      });
      
      // Set up message handlers for this stream
      this._setupWebSocketHandlers();
      
    } catch (error) {
      logger.error('Failed to acquire STT WebSocket from pool', { 
        sessionId: this.sessionId, 
        error 
      });
      throw error;
    }
  }
  
  /**
   * Set up message and event handlers for the WebSocket.
   * This is called after acquiring a connection from the pool.
   */
  private _setupWebSocketHandlers(): void {
    if (!this.ws) return;
    
    this.ws.on('message', (data: Buffer) => {
      this._handleMessage(data);
    });

    this.ws.on('close', (code, reason) => {
      logger.info('STT WebSocket closed', { 
        sessionId: this.sessionId, 
        code, 
        reason: reason.toString() 
      });
      
      // Remove from pool on close
      if (this.ws) {
        this.wsPool.remove(this.ws);
      }
      
      // Auto-reconnect on abnormal closure (1006) if not intentionally closed
      if (!this.isClosed && code === 1006 && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this._attemptReconnect();
      }
    });
    
    this.ws.on('error', (error) => {
      logger.error('STT WebSocket error', { sessionId: this.sessionId, error: (error as Error).message });
      // Remove from pool on error
      if (this.ws) {
        this.wsPool.remove(this.ws);
      }
    });
  }

  private async _attemptReconnect(): Promise<void> {
    if (this.isReconnecting || this.isClosed) return;
    
    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    logger.info('Attempting STT WebSocket reconnect', { 
      sessionId: this.sessionId, 
      attempt: this.reconnectAttempts,
      maxAttempts: this.MAX_RECONNECT_ATTEMPTS 
    });
    
    await new Promise(resolve => setTimeout(resolve, this.RECONNECT_DELAY_MS));
    
    try {
      await this._connectWebSocket();
      logger.info('STT WebSocket reconnected successfully', { sessionId: this.sessionId });
      this.isReconnecting = false;
      this.reconnectAttempts = 0; // Reset on success
    } catch (error) {
      logger.error('STT WebSocket reconnect failed', { 
        sessionId: this.sessionId, 
        attempt: this.reconnectAttempts,
        error 
      });
      this.isReconnecting = false;
      
      // Try again if under max attempts
      if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS && !this.isClosed) {
        this._attemptReconnect();
      }
    }
  }

  private async _processAudioFrames(): Promise<void> {
    const chunkSize = Math.floor((this.sttInstance.getSampleRate() * this.CHUNK_DURATION_MS) / 1000);
    
    try {
      for await (const frameOrSentinel of this.input) {
        // Wait briefly if reconnecting
        if (this.isReconnecting) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        
        // Skip if WebSocket not ready (but don't break - might reconnect)
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          if (this.isClosed) break;
          await new Promise(resolve => setTimeout(resolve, 50));
          continue;
        }

        // Check for flush sentinel
        if (frameOrSentinel === SarvamSpeechStream.FLUSH_SENTINEL) {
          continue;
        }

        const frame = frameOrSentinel as AudioFrame;

        // Convert AudioFrame to PCM Int16Array
        const pcmData = this._audioFrameToPCM(frame);
        this.audioBuffer.push(pcmData);

        // Send chunks when buffer is large enough
        while (this.audioBuffer.length > 0) {
          const totalSamples = this.audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
          
          if (totalSamples >= chunkSize) {
            const chunk = this._extractChunk(chunkSize);
            await this._sendAudioChunk(chunk);
          } else {
            break;
          }
        }
      }
    } catch (error) {
      logger.error('Error processing audio frames', { sessionId: this.sessionId, error });
      throw error;
    }
  }

  private _audioFrameToPCM(frame: AudioFrame): Int16Array {
    // LiveKit AudioFrame.data is already Int16Array, just return it
    return frame.data;
  }

  private _extractChunk(size: number): Int16Array {
    const chunk = new Int16Array(size);
    let offset = 0;

    while (offset < size && this.audioBuffer.length > 0) {
      const buffer = this.audioBuffer[0];
      const remaining = size - offset;
      const toCopy = Math.min(remaining, buffer.length);

      chunk.set(buffer.subarray(0, toCopy), offset);
      offset += toCopy;

      if (toCopy < buffer.length) {
        this.audioBuffer[0] = buffer.subarray(toCopy);
      } else {
        this.audioBuffer.shift();
      }
    }

    return chunk;
  }

  private async _sendAudioChunk(chunk: Int16Array): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Convert Int16Array to base64-encoded PCM
    const buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    const base64Audio = buffer.toString('base64');

    // Official Sarvam API format: NO "type" field for regular audio chunks!
    // Only end_of_stream messages have "type" field
    const audioMessage = {
      audio: {
        data: base64Audio,
        encoding: 'audio/wav',  // Official uses "audio/wav", not "pcm"
        sample_rate: this.sttInstance.getSampleRate(),
      },
    };

    logger.debug('Sending STT audio chunk', { 
      sessionId: this.sessionId, 
      chunkSize: chunk.length,
      base64Length: base64Audio.length 
    });
    this.ws.send(JSON.stringify(audioMessage));
  }

  private _handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      const msgType = message.type;

      logger.debug('STT message received', { sessionId: this.sessionId, msgType, data: message });

      // Sarvam API sends 'data' for transcripts and 'events' for VAD
      if (msgType === 'data') {
        this._handleTranscript(message.data);
      } else if (msgType === 'events') {
        this._handleVADEvent(message.data);
      } else if (msgType === 'error') {
        this._handleError(message.data);
      } else {
        logger.error('Unknown STT message type', { sessionId: this.sessionId, msgType, message });
      }
    } catch (error) {
      logger.error('Error parsing STT message', { sessionId: this.sessionId, error });
    }
  }

  private _handleTranscript(data: any): void {
    const transcript = data?.transcript || '';
    // Sarvam API doesn't send is_final flag, treat all as final
    const isFinal = true;
    
    if (!transcript) return;

    const event: stt.SpeechEvent = {
      type: isFinal
        ? stt.SpeechEventType.FINAL_TRANSCRIPT
        : stt.SpeechEventType.INTERIM_TRANSCRIPT,
      alternatives: [
        {
          language: this.sttInstance.getLanguageCode(),
          text: transcript,
          confidence: 1.0,
          startTime: data?.speech_start || 0,
          endTime: data?.speech_end || 0,
        },
      ],
    };

    this.queue.put(event);
    logger.info('Transcript received', { 
      sessionId: this.sessionId, 
      text: transcript, 
      isFinal 
    });
  }

  private _handleVADEvent(data: any): void {
    const signalType = data?.signal_type;

    if (signalType === 'START_SPEECH' && !this.speaking) {
      this.speaking = true;
      const event: stt.SpeechEvent = {
        type: stt.SpeechEventType.START_OF_SPEECH,
      };
      this.queue.put(event);
      logger.info('Speech started (VAD)', { sessionId: this.sessionId });
    } else if (signalType === 'END_SPEECH' && this.speaking) {
      this.speaking = false;
      const event: stt.SpeechEvent = {
        type: stt.SpeechEventType.END_OF_SPEECH,
      };
      this.queue.put(event);
      logger.info('Speech ended (VAD)', { sessionId: this.sessionId });
    }
  }

  private _handleError(data: any): void {
    const errorMsg = data?.message || 'Unknown error';
    logger.error('STT API error', { sessionId: this.sessionId, error: errorMsg });
  }

  // Override close to mark as intentionally closed (prevent reconnection)
  async close(wait: boolean = true): Promise<void> {
    this.isClosed = true;
    logger.info('STT stream closing intentionally', { sessionId: this.sessionId });
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Stream closed intentionally');
    }
    
    await super.close();
  }
}
