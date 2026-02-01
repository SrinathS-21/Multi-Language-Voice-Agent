/**
 * Ambient Audio Player
 * 
 * Publishes persistent ambient audio as a separate track that won't be ducked.
 * @module agent/ambient-audio
 */

import { AudioFrame } from '@livekit/rtc-node';
import { logger } from '../core/logging.js';
import type { AmbientAudioOptions, AmbientAudioResult } from './types.js';

/**
 * Start persistent ambient audio as separate audio track (won't be ducked)
 */
export async function startPersistentAmbience(
  room: any,
  audioFilePath: string,
  sessionId: string,
  options: AmbientAudioOptions = {}
): Promise<AmbientAudioResult> {
  const { volume = 0.08, loop = true, trackName = 'ambient' } = options;

  try {
    const { LocalAudioTrack, AudioSource, TrackPublishOptions, TrackSource } = await import('@livekit/rtc-node');
    const fs = await import('fs');
    const { spawn } = await import('child_process');

    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    const audioSource = new AudioSource(16000, 1);
    let isSourceActive = true;
    let audioTrack: any = null;

    const ffmpegArgs = [
      '-re',
      ...(loop ? ['-stream_loop', '-1'] : []),
      '-i', audioFilePath,
      '-f', 's16le',
      '-ar', '16000',
      '-ac', '1',
      '-filter:a', `volume=${volume}`,
      'pipe:1'
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    const SAMPLES_PER_CHUNK = 480;
    const bytesPerChunk = SAMPLES_PER_CHUNK * 2;
    
    let buffer = Buffer.alloc(0);
    let isProcessing = false;

    const cleanup = () => {
      if (isSourceActive) {
        isSourceActive = false;
        
        try {
          if (ffmpeg && !ffmpeg.killed) {
            ffmpeg.kill('SIGTERM');
          }
          
          if (audioTrack) {
            room.localParticipant.unpublishTrack(audioTrack).catch((err: any) => {
              logger.debug('Error unpublishing ambient track', { error: err.message });
            });
          }
        } catch (error: any) {
          logger.debug('Error during ambient cleanup', { error: error.message });
        }
      }
    };

    const processAudioData = async () => {
      if (isProcessing || !isSourceActive) return;
      isProcessing = true;

      try {
        while (buffer.length >= bytesPerChunk && isSourceActive) {
          const audioChunk = buffer.subarray(0, bytesPerChunk);
          buffer = buffer.subarray(bytesPerChunk);

          try {
            const samples = new Int16Array(
              audioChunk.buffer,
              audioChunk.byteOffset,
              audioChunk.byteLength / 2
            );

            const audioFrame = new AudioFrame(samples, 16000, 1, SAMPLES_PER_CHUNK);
            audioSource.captureFrame(audioFrame);
            
            await new Promise(resolve => setTimeout(resolve, 30));
          } catch (error: any) {
            if (error.message?.includes('InvalidState') || error.message?.includes('failed to capture frame')) {
              cleanup();
              break;
            }
          }
        }
      } finally {
        isProcessing = false;
      }
    };

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      if (!isSourceActive) return;
      buffer = Buffer.concat([buffer, chunk]);
      processAudioData().catch(() => {});
    });

    ffmpeg.stderr.on('data', (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('Invalid')) {
        logger.error('FFmpeg error for ambient audio', { error: msg });
      }
    });

    ffmpeg.on('error', (error: Error) => {
      logger.error('Failed to spawn FFmpeg', { error: error.message });
    });

    audioTrack = LocalAudioTrack.createAudioTrack(trackName, audioSource);

    const publishOptions = new TrackPublishOptions();
    publishOptions.source = TrackSource.SOURCE_MICROPHONE;

    await room.localParticipant.publishTrack(audioTrack, publishOptions);

    return { cleanup };

  } catch (error: any) {
    logger.warning('Failed to start ambient audio (non-critical)', {
      sessionId,
      error: error.message,
    });
    return { cleanup: () => {} };
  }
}
