/**
 * Comprehensive Optimization Validation Script
 * 
 * Validates all voice agent optimizations are properly configured.
 * Run with: npx ts-node scripts/validate-optimizations.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Colors for terminal output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

interface ValidationResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

const results: ValidationResult[] = [];

function pass(name: string, message: string, details?: string) {
  results.push({ name, status: 'pass', message, details });
}

function fail(name: string, message: string, details?: string) {
  results.push({ name, status: 'fail', message, details });
}

function warn(name: string, message: string, details?: string) {
  results.push({ name, status: 'warn', message, details });
}

// ============================================
// 1. VAD Configuration Validation
// ============================================
console.log(`\n${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
console.log(`${BLUE}  VOICE AGENT OPTIMIZATION VALIDATION SUITE${RESET}`);
console.log(`${BLUE}═══════════════════════════════════════════════════════════════${RESET}\n`);

console.log(`${YELLOW}1. VAD Configuration${RESET}`);
console.log('-'.repeat(40));

const configContent = readFileSync(join(process.cwd(), 'src/agent/config.ts'), 'utf-8');

// Check minSilenceDuration
const silenceMatch = configContent.match(/minSilenceDuration:\s*([\d.]+)/);
if (silenceMatch) {
  const value = parseFloat(silenceMatch[1]);
  if (value <= 0.5) {
    pass('VAD minSilenceDuration', `Set to ${value}s (≤0.5s)`, 'Faster turn detection');
  } else {
    fail('VAD minSilenceDuration', `Set to ${value}s (>0.5s)`, 'Should be ≤0.5s for fast response');
  }
}

// Check minEndpointingDelay
const endpointMatch = configContent.match(/minEndpointingDelay:\s*([\d.]+)/);
if (endpointMatch) {
  const value = parseFloat(endpointMatch[1]);
  if (value <= 0.5) {
    pass('VOICE minEndpointingDelay', `Set to ${value}s (≤0.5s)`, 'Fast endpointing');
  } else {
    fail('VOICE minEndpointingDelay', `Set to ${value}s (>0.5s)`, 'Should be ≤0.5s');
  }
}

// Check minInterruptionWords
const interruptMatch = configContent.match(/minInterruptionWords:\s*(\d+)/);
if (interruptMatch) {
  const value = parseInt(interruptMatch[1]);
  if (value === 1) {
    pass('VOICE minInterruptionWords', `Set to ${value}`, 'Single-word interruption enabled');
  } else {
    warn('VOICE minInterruptionWords', `Set to ${value}`, 'Consider setting to 1 for faster barge-in');
  }
}

// ============================================
// 2. Interrupt Handler Validation
// ============================================
console.log(`\n${YELLOW}2. Interrupt Handler${RESET}`);
console.log('-'.repeat(40));

const agentContent = readFileSync(join(process.cwd(), 'src/agent/index.ts'), 'utf-8');

if (agentContent.includes('UserStateChanged')) {
  pass('Interrupt Event Handler', 'UserStateChanged listener present', 'Detects user starting to speak');
} else {
  fail('Interrupt Event Handler', 'UserStateChanged listener NOT found', 'Cannot detect interrupts');
}

if (agentContent.includes('voiceSession.interrupt()')) {
  pass('Pipeline Interrupt', 'voiceSession.interrupt() called', 'Flushes TTS and LLM on interrupt');
} else {
  fail('Pipeline Interrupt', 'voiceSession.interrupt() NOT found', 'Agent will not respond to interrupts');
}

if (agentContent.includes('agentIsProducingOutput')) {
  pass('Agent State Tracking', 'agentIsProducingOutput flag present', 'Tracks when agent is speaking/thinking');
} else {
  warn('Agent State Tracking', 'Agent state tracking not found', 'May cause false interrupt triggers');
}

// ============================================
// 3. Sentence Detection Validation
// ============================================
console.log(`\n${YELLOW}3. TTS Sentence Streaming${RESET}`);
console.log('-'.repeat(40));

const ttsContent = readFileSync(join(process.cwd(), 'src/plugins/sarvam_tts.ts'), 'utf-8');

// Check language-specific thresholds
if (ttsContent.includes('LANGUAGE_SENTENCE_THRESHOLDS')) {
  pass('Language Thresholds', 'Per-language thresholds defined', 'Optimized for all 11 Indian languages');
  
  // Verify all languages are covered
  const languages = ['en-IN', 'hi-IN', 'ta-IN', 'te-IN', 'bn-IN', 'mr-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN', 'od-IN', 'ur-IN'];
  let covered = 0;
  for (const lang of languages) {
    if (ttsContent.includes(`'${lang}':`)) covered++;
  }
  if (covered === languages.length) {
    pass('Language Coverage', `All ${covered} languages configured`, 'Complete Indian language support');
  } else {
    warn('Language Coverage', `Only ${covered}/${languages.length} languages`, 'Some languages using default threshold');
  }
}

// Check sentence boundary detection
if (ttsContent.includes('detectSentenceBoundary')) {
  pass('Sentence Detection', 'detectSentenceBoundary function present', 'Enables sentence-level streaming');
} else {
  fail('Sentence Detection', 'detectSentenceBoundary NOT found', 'TTS will not stream sentences');
}

// Check Devanagari Danda support
if (ttsContent.includes('\\u0964') || ttsContent.includes('।')) {
  pass('Devanagari Danda', 'Hindi/Marathi punctuation supported', 'Danda (।) and Double Danda (॥)');
} else {
  warn('Devanagari Danda', 'Danda punctuation not found', 'May not detect Hindi/Marathi sentence ends');
}

// Check Urdu support
if (ttsContent.includes('\\u06d4') || ttsContent.includes('۔')) {
  pass('Urdu Full Stop', 'Arabic full stop (۔) supported', 'Urdu sentence detection enabled');
} else {
  warn('Urdu Full Stop', 'Arabic full stop not found', 'May not detect Urdu sentence ends');
}

// ============================================
// 4. Connection Pooling Validation
// ============================================
console.log(`\n${YELLOW}4. Connection Pooling${RESET}`);
console.log('-'.repeat(40));

// TTS Connection Pool
if (ttsContent.includes('ConnectionPool')) {
  pass('TTS ConnectionPool', 'ConnectionPool imported and used', 'WebSocket reuse enabled');
} else {
  fail('TTS ConnectionPool', 'ConnectionPool NOT found in TTS', 'No WebSocket reuse - higher latency');
}

// STT Connection Pool
const sttContent = readFileSync(join(process.cwd(), 'src/plugins/sarvam_stt.ts'), 'utf-8');
if (sttContent.includes('ConnectionPool')) {
  pass('STT ConnectionPool', 'ConnectionPool imported and used', 'WebSocket reuse enabled');
} else {
  fail('STT ConnectionPool', 'ConnectionPool NOT found in STT', 'No WebSocket reuse - higher latency');
}

// ============================================
// 5. Pre-warming Validation
// ============================================
console.log(`\n${YELLOW}5. Pre-warming${RESET}`);
console.log('-'.repeat(40));

// TTS prewarm
if (ttsContent.includes('prewarm(') || ttsContent.includes('prewarmPhraseCache')) {
  pass('TTS Prewarm', 'prewarm methods present', 'Connection and phrase pre-warming enabled');
} else {
  warn('TTS Prewarm', 'Prewarm not found', 'First TTS request may be slow');
}

// STT prewarm
if (sttContent.includes('prewarm(')) {
  pass('STT Prewarm', 'prewarm method present', 'STT connection pre-warming enabled');
} else {
  warn('STT Prewarm', 'Prewarm not found', 'First STT request may be slow');
}

// Agent prewarm calls
if (agentContent.includes('plugins.tts.prewarm') && agentContent.includes('plugins.stt.prewarm')) {
  pass('Agent Prewarm', 'Both TTS and STT pre-warmed on startup', 'Faster first response');
} else if (agentContent.includes('plugins.tts.prewarm')) {
  warn('Agent Prewarm', 'Only TTS pre-warmed', 'STT first response may be slow');
} else {
  fail('Agent Prewarm', 'No prewarm calls in agent', 'First response will be slow');
}

// ============================================
// 6. Dual VAD Architecture Validation
// ============================================
console.log(`\n${YELLOW}6. Dual VAD Architecture${RESET}`);
console.log('-'.repeat(40));

// Silero VAD
if (agentContent.includes('silero.VAD.load')) {
  pass('Silero VAD', 'Silero VAD loaded in prewarm', 'Pipeline control VAD enabled');
} else {
  fail('Silero VAD', 'Silero VAD NOT found', 'Pipeline will not detect turn boundaries');
}

if (agentContent.includes('vad: sileroVad')) {
  pass('Silero VAD Used', 'sileroVad passed to AgentSession', 'VAD integrated with pipeline');
} else {
  fail('Silero VAD Used', 'sileroVad NOT passed to session', 'VAD not integrated');
}

// Sarvam VAD signals
const factoryContent = readFileSync(join(process.cwd(), 'src/plugins/factory.ts'), 'utf-8');

if (factoryContent.includes('vadSignals:') && factoryContent.includes('isSarvamLanguage')) {
  pass('Sarvam VAD Signals', 'vadSignals enabled for Indian languages', 'Better transcript timing');
} else if (factoryContent.includes('vadSignals: false')) {
  warn('Sarvam VAD Signals', 'vadSignals disabled', 'Consider enabling for Indian languages');
} else {
  warn('Sarvam VAD Signals', 'vadSignals config not found', 'Check factory.ts configuration');
}

// Check for highVadSensitivity
if (factoryContent.includes('highVadSensitivity: false')) {
  pass('VAD Sensitivity', 'highVadSensitivity: false', 'No double-triggers between VADs');
} else {
  warn('VAD Sensitivity', 'highVadSensitivity not set to false', 'May cause double VAD triggers');
}

// ============================================
// 7. Metrics Collection Validation
// ============================================
console.log(`\n${YELLOW}7. Metrics Collection${RESET}`);
console.log('-'.repeat(40));

if (agentContent.includes('MetricsCollected')) {
  pass('Metrics Handler', 'MetricsCollected event handler present', 'SDK metrics captured');
} else {
  fail('Metrics Handler', 'MetricsCollected NOT found', 'No metrics collection');
}

if (agentContent.includes('llm_metrics') && agentContent.includes('ttftMs')) {
  pass('LLM TTFT Tracking', 'LLM TTFT (Time To First Token) tracked', 'Key latency metric');
} else {
  warn('LLM TTFT Tracking', 'LLM TTFT not tracked', 'Cannot measure LLM latency');
}

if (agentContent.includes('tts_metrics') && agentContent.includes('ttfbMs')) {
  pass('TTS TTFB Tracking', 'TTS TTFB (Time To First Byte) tracked', 'Key latency metric');
} else {
  warn('TTS TTFB Tracking', 'TTS TTFB not tracked', 'Cannot measure TTS latency');
}

// ============================================
// SUMMARY
// ============================================
console.log(`\n${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
console.log(`${BLUE}  VALIDATION SUMMARY${RESET}`);
console.log(`${BLUE}═══════════════════════════════════════════════════════════════${RESET}\n`);

const passed = results.filter(r => r.status === 'pass').length;
const failed = results.filter(r => r.status === 'fail').length;
const warned = results.filter(r => r.status === 'warn').length;

for (const result of results) {
  const icon = result.status === 'pass' ? `${GREEN}✅` : 
               result.status === 'fail' ? `${RED}❌` : `${YELLOW}⚠️`;
  console.log(`${icon} ${result.name}${RESET}`);
  console.log(`   ${result.message}`);
  if (result.details) {
    console.log(`   ${BLUE}→ ${result.details}${RESET}`);
  }
  console.log('');
}

console.log(`${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
console.log(`  ${GREEN}PASSED: ${passed}${RESET}  |  ${RED}FAILED: ${failed}${RESET}  |  ${YELLOW}WARNINGS: ${warned}${RESET}`);
console.log(`${BLUE}═══════════════════════════════════════════════════════════════${RESET}\n`);

if (failed > 0) {
  console.log(`${RED}⚠️  ${failed} critical issue(s) found. Please fix before deployment.${RESET}\n`);
  process.exit(1);
} else if (warned > 0) {
  console.log(`${YELLOW}ℹ️  ${warned} warning(s). System functional but may have suboptimal performance.${RESET}\n`);
  process.exit(0);
} else {
  console.log(`${GREEN}🎉 All optimizations validated! System ready for production.${RESET}\n`);
  process.exit(0);
}
