/**
 * Centralized configuration management.
 * 
 * Single source of truth for all configuration values,
 * loaded from environment variables with sensible defaults.
 * 
 * Usage:
 *   import { config } from './core/config.js';
 *   const apiKey = config.sarvam.apiKey;
 */

import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = path.resolve(__dirname, '..', '..');
const envFile = path.join(projectRoot, '.env');

if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, override: true });
} else {
  dotenv.config({ override: true });
}

/**
 * Sarvam AI service configuration schema
 */
const sarvamConfigSchema = z.object({
  apiKey: z.string().min(1, 'SARVAM_API_KEY is required'),
  sttModel: z.string().default('saarika:v2.5'),
  ttsModel: z.string().default('bulbul:v2'),
  ttsSpeaker: z.string().default('anushka'),
  ttsPace: z.number().min(0.5).max(2.0).default(0.85), // Speech rate: lower = slower, 0.85 is slightly slower than default
  llmModel: z.string().default('sarvam-m'),
  llmTemperature: z.number().min(0).max(2).default(0.1),
  language: z.string().default('ta-IN'), // Default to Tamil for Indian language support
});

/**
 * LiveKit service configuration schema
 */
const livekitConfigSchema = z.object({
  url: z.string().url('LIVEKIT_URL must be a valid URL'),
  apiKey: z.string().min(1, 'LIVEKIT_API_KEY is required'),
  apiSecret: z.string().min(1, 'LIVEKIT_API_SECRET is required'),
});

/**
 * Convex backend configuration schema
 */
const convexConfigSchema = z.object({
  url: z.string().optional(), // Optional - Convex features disabled if not set
  openaiApiKey: z.string().optional(), // For RAG embeddings
});

/**
 * Session configuration schema
 */
const sessionConfigSchema = z.object({
  defaultTtlSeconds: z.number().default(3600), // 1 hour
  enablePersistence: z.boolean().default(true),
});

/**
 * Main application configuration schema
 */
const appConfigSchema = z.object({
  sarvam: sarvamConfigSchema,
  livekit: livekitConfigSchema,
  convex: convexConfigSchema,
  session: sessionConfigSchema,
  isDevelopment: z.boolean(),
  logLevel: z.enum(['DEBUG', 'INFO', 'WARNING', 'ERROR']).default('INFO'),
});

/**
 * Parse and validate configuration from environment variables
 */
function loadConfig() {
  try {
    const rawConfig = {
      sarvam: {
        apiKey: process.env.SARVAM_API_KEY || '',
        sttModel: process.env.SARVAM_STT_MODEL || 'saarika:v2.5',
        ttsModel: process.env.SARVAM_TTS_MODEL || 'bulbul:v2',
        ttsSpeaker: process.env.SARVAM_TTS_SPEAKER || 'anushka',
        llmModel: process.env.SARVAM_LLM_MODEL || 'sarvam-m',
        llmTemperature: parseFloat(process.env.SARVAM_LLM_TEMPERATURE || '0.3'), // Increased from 0.1 to improve tool calling
        ttsPace: parseFloat(process.env.SARVAM_TTS_PACE || '0.85'),  // Speech rate: 0.5-2.0, lower = slower
        language: process.env.SARVAM_LANGUAGE || 'ta-IN',  // Default to Tamil
      },
      livekit: {
        url: process.env.LIVEKIT_URL || '',
        apiKey: process.env.LIVEKIT_API_KEY || '',
        apiSecret: process.env.LIVEKIT_API_SECRET || '',
      },
      convex: {
        url: process.env.CONVEX_URL,
        openaiApiKey: process.env.OPENAI_API_KEY,
      },
      session: {
        defaultTtlSeconds: parseInt(process.env.SESSION_TTL_SECONDS || '3600', 10),
        enablePersistence: process.env.ENABLE_SESSION_PERSISTENCE !== 'false',
      },
      isDevelopment: process.env.NODE_ENV !== 'production',
      logLevel: (process.env.LOG_LEVEL || 'INFO').toUpperCase() as 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR',
    };

    return appConfigSchema.parse(rawConfig);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      console.error('\n' + '='.repeat(60));
      console.error('❌ Configuration validation failed!');
      console.error('='.repeat(60));
      error.errors.forEach((err: z.ZodIssue) => {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      });
      console.error('='.repeat(60) + '\n');
      throw new Error('Invalid configuration. Please check your environment variables.');
    }
    throw error;
  }
}

/**
 * Validated application configuration
 */
export const config = loadConfig();

/**
 * Type exports for configuration
 */
export type SarvamConfig = z.infer<typeof sarvamConfigSchema>;
export type LivekitConfig = z.infer<typeof livekitConfigSchema>;
export type ConvexConfig = z.infer<typeof convexConfigSchema>;
export type SessionConfig = z.infer<typeof sessionConfigSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
