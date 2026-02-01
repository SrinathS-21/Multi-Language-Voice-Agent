# Multilingual Dynamic Language Switching - Implementation Plan

**Version:** 1.0  
**Date:** January 26, 2026  
**Status:** Draft - Ready for Implementation

---

## 🎯 Objective

Enable the voice agent to **dynamically detect and switch languages during a call** based on user's spoken language, rather than being locked to a pre-configured language from Convex at call initialization.

**Current Problem:** The agent's language is set once from Convex configuration when the call starts and never changes, even if the user speaks a different language.

**Desired Behavior:** Agent should detect what language the user is speaking in real-time and automatically switch STT (Speech-to-Text), TTS (Text-to-Speech), and LLM response language accordingly.

---

## 🏗️ Current Architecture Analysis

### Current Language Configuration Flow

```
┌──────────────────────────────────────────────────────────────┐
│  1. Call Initiated                                           │
│     ↓                                                         │
│  2. Agent loads config from Convex DB                        │
│     (agentConfig.language = 'en-IN' or 'ta-IN')             │
│     ↓                                                         │
│  3. Create plugins ONCE with fixed language:                 │
│     • STT Plugin (SarvamSTT) → languageCode='en-IN'         │
│     • TTS Plugin (SarvamTTS) → languageCode='en-IN'         │
│     • LLM Plugin (OpenAI GPT) → System prompt in English    │
│     ↓                                                         │
│  4. Start voice session with these plugins                   │
│     ↓                                                         │
│  5. ❌ PROBLEM: Language is LOCKED for entire call           │
│     • STT always expects one language                        │
│     • TTS always speaks in one language                      │
│     • No mechanism to detect/switch language mid-call        │
└──────────────────────────────────────────────────────────────┘
```

### Key Files Involved

| File | Current Role | Issue |
|------|--------------|-------|
| `convex/agents.ts` | Stores agent config with `language` field | Language is static, stored per-agent |
| `src/services/agent-config.ts` | Loads agent config including language | Returns fixed language at call start |
| `src/plugins/factory.ts` | Creates STT/TTS/LLM plugins with language | Plugins created once, language immutable |
| `src/plugins/sarvam_stt.ts` | STT WebSocket connection | `languageCode` set in constructor, never changes |
| `src/plugins/sarvam_tts.ts` | TTS WebSocket connection pool | `languageCode` set in constructor, never changes |
| `src/agent/index.ts` (line 1161-1184) | Main agent initialization | Reads `agentConfig.language` once, creates static plugins |

### The Override Problem

**Location:** [`src/agent/index.ts:1170`](src/agent/index.ts#L1170)

```typescript
agentLanguage = agentConfig.language || agentLanguage;
```

This line sets the language from Convex and it **overrides** any dynamic detection because:

1. Plugins are created with this fixed language
2. STT and TTS WebSocket connections are initialized with fixed `languageCode`
3. LiveKit Agent SDK doesn't support hot-swapping plugins mid-session
4. Once `voiceSession` is created, its plugins are immutable

---

## 🎨 Proposed Solution Architecture

### Multi-Layered Approach

We'll implement **3 layers of language adaptation**:

#### **Layer 1: Real-time STT Language Detection** ⭐ (Primary Solution)
Use a **language-agnostic STT model** or multi-language STT that auto-detects language

#### **Layer 2: LLM-based Language Detection** 
Analyze transcribed text to determine language and adjust TTS accordingly

#### **Layer 3: Dynamic TTS Language Switching**
Reconnect TTS WebSocket with new language when switch detected

### New Architecture Flow

```
┌──────────────────────────────────────────────────────────────┐
│  MULTILINGUAL DYNAMIC SWITCHING ARCHITECTURE                 │
└──────────────────────────────────────────────────────────────┘

┌────────────────────┐
│  1. Call Initiated │
└────────┬───────────┘
         │
         ▼
┌────────────────────────────────────────────────────┐
│  2. Load Agent Config from Convex                  │
│     • defaultLanguage: 'en-IN' (fallback only)     │
│     • supportedLanguages: ['en-IN', 'hi-IN',       │
│                            'ta-IN', 'te-IN']       │
└────────┬───────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────┐
│  3. Initialize Multi-Language Capable Plugins      │
│     ┌──────────────────────────────────────┐      │
│     │ STT: Multi-Language Mode             │      │
│     │ • Sarvam with auto-detect OR         │      │
│     │ • Multiple STT instances in pool     │      │
│     └──────────────────────────────────────┘      │
│     ┌──────────────────────────────────────┐      │
│     │ TTS: Switchable Instance             │      │
│     │ • Current language tracked           │      │
│     │ • Can reconnect WebSocket            │      │
│     └──────────────────────────────────────┘      │
│     ┌──────────────────────────────────────┐      │
│     │ LLM: Language-Aware Prompt           │      │
│     │ • Multilingual system prompt         │      │
│     │ • Context: current detected language │      │
│     └──────────────────────────────────────┘      │
└────────┬───────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────┐
│  4. DURING CALL - Language Detection Loop          │
│                                                     │
│     User Speaks                                    │
│         ↓                                           │
│     STT Transcribes (with language hint)           │
│         ↓                                           │
│     ┌───────────────────────────────────────┐     │
│     │ Language Detector Service             │     │
│     │  • Analyzes transcript text           │     │
│     │  • Detects: English / Hindi /         │     │
│     │    Tamil / Telugu / etc.              │     │
│     │  • Confidence score > threshold       │     │
│     └───────┬───────────────────────────────┘     │
│             ↓                                       │
│     ┌───────────────────────────────────────┐     │
│     │ Language changed from last detected?  │     │
│     └───────┬───────────────────────────────┘     │
│             ↓ YES                                   │
│     ┌───────────────────────────────────────┐     │
│     │ Language Switch Handler               │     │
│     │  1. Update session language context   │     │
│     │  2. Switch TTS language (reconnect)   │     │
│     │  3. Update LLM context                │     │
│     │  4. Log language switch event         │     │
│     └───────┬───────────────────────────────┘     │
│             ↓                                       │
│     Agent responds in user's language              │
│         ↓                                           │
│     (Loop continues)                               │
└────────────────────────────────────────────────────┘
```

---

## 🔧 Implementation Steps

### **Phase 1: Core Language Detection Service** (Week 1)

#### Step 1.1: Create Language Detector Service

**File:** `src/services/language-detector.ts` (NEW)

```typescript
/**
 * Language Detection Service
 * 
 * Detects spoken language from transcribed text using multiple strategies:
 * - Script detection (Unicode ranges)
 * - Common word patterns
 * - Character frequency analysis
 * - External API (optional)
 */

export type SupportedLanguage = 'en-IN' | 'hi-IN' | 'ta-IN' | 'te-IN' | 'kn-IN' | 'ml-IN';

export interface LanguageDetectionResult {
  language: SupportedLanguage;
  confidence: number; // 0.0 to 1.0
  script?: string; // 'Latin', 'Devanagari', 'Tamil', etc.
  alternativeLanguages?: { language: SupportedLanguage; confidence: number }[];
}

export class LanguageDetectorService {
  private detectionHistory: LanguageDetectionResult[] = [];
  private currentLanguage: SupportedLanguage | null = null;
  
  /**
   * Detect language from text using script analysis + patterns
   * This is fast and works offline
   */
  detectFromText(text: string): LanguageDetectionResult {
    // Implementation details...
  }
  
  /**
   * Get stable language detection with hysteresis
   * Prevents rapid switching on single utterances
   */
  getStableLanguage(): SupportedLanguage | null {
    // Require 2-3 consecutive detections before switching
  }
  
  /**
   * Reset detection state (e.g., on new call)
   */
  reset(): void {
    // Clear history
  }
}
```

**Key Features:**
- **Script Detection**: Tamil (U+0B80-U+0BFF), Hindi/Devanagari (U+0900-U+097F), English (U+0000-U+007F)
- **Pattern Matching**: Common words in each language
- **Hysteresis**: Require 2-3 consecutive detections before switching (prevents false switches)
- **Confidence Scoring**: Higher confidence for longer utterances

#### Step 1.2: Integrate with Agent Session

**File:** `src/agent/index.ts` (MODIFY)

Add language detector to agent context:

```typescript
// Around line 1250
import { LanguageDetectorService } from '../services/language-detector.js';

const agentContext: AgentContext = {
  // ... existing fields ...
  languageDetector: new LanguageDetectorService(), // NEW
  currentLanguage: agentLanguage, // Track current language
};
```

### **Phase 2: Dynamic TTS Switching** (Week 1-2)

#### Step 2.1: Make TTS Language Switchable

**File:** `src/plugins/sarvam_tts.ts` (MODIFY)

Add method to switch language dynamically:

```typescript
export class SarvamTTS extends tts.TTS {
  // ... existing code ...
  
  private currentLanguage: string;
  
  /**
   * Switch TTS language dynamically
   * This will recreate WebSocket connections with new language
   */
  async switchLanguage(newLanguage: SarvamTTSLanguage): Promise<void> {
    if (this.currentLanguage === newLanguage) {
      return; // No change needed
    }
    
    logger.info('Switching TTS language', {
      from: this.currentLanguage,
      to: newLanguage,
    });
    
    // Update language
    this.currentLanguage = newLanguage;
    this.languageCode = newLanguage;
    
    // Close existing connections in pool
    await this.connectionPool.closeAll();
    
    // Connections will auto-recreate with new language on next synthesis
    
    logger.info('TTS language switched successfully', { newLanguage });
  }
  
  getCurrentLanguage(): string {
    return this.currentLanguage;
  }
}
```

#### Step 2.2: Add Language Switch Handler

**File:** `src/agent/language-switch-handler.ts` (NEW)

```typescript
/**
 * Language Switch Handler
 * 
 * Handles language switching during active call
 */

export interface LanguageSwitchContext {
  sessionId: string;
  ttsPlugin: SarvamTTS;
  currentLanguage: string;
  languageDetector: LanguageDetectorService;
}

export class LanguageSwitchHandler {
  private switchInProgress = false;
  
  async handleTranscript(
    transcript: string,
    context: LanguageSwitchContext
  ): Promise<boolean> {
    // 1. Detect language from transcript
    const detection = context.languageDetector.detectFromText(transcript);
    
    // 2. Get stable language (with hysteresis)
    const stableLanguage = context.languageDetector.getStableLanguage();
    
    // 3. Check if language changed
    if (stableLanguage && stableLanguage !== context.currentLanguage) {
      if (this.switchInProgress) {
        logger.warning('Language switch already in progress, skipping');
        return false;
      }
      
      // 4. Perform language switch
      return await this.performLanguageSwitch(stableLanguage, context);
    }
    
    return false; // No switch needed
  }
  
  private async performLanguageSwitch(
    newLanguage: string,
    context: LanguageSwitchContext
  ): Promise<boolean> {
    try {
      this.switchInProgress = true;
      
      logger.info('🌐 Performing language switch', {
        from: context.currentLanguage,
        to: newLanguage,
        sessionId: context.sessionId,
      });
      
      // Switch TTS language
      await context.ttsPlugin.switchLanguage(newLanguage as any);
      
      // Update context
      context.currentLanguage = newLanguage;
      
      // Log event
      // await sessionService.logLanguageSwitch(context.sessionId, newLanguage);
      
      logger.info('✅ Language switch completed', { newLanguage });
      
      return true;
    } catch (error) {
      logger.error('❌ Language switch failed', {
        error: (error as Error).message,
        newLanguage,
      });
      return false;
    } finally {
      this.switchInProgress = false;
    }
  }
}
```

### **Phase 3: STT Multi-Language Support** (Week 2)

#### Option A: Single STT with Language Hints (RECOMMENDED)

**File:** `src/plugins/sarvam_stt.ts` (MODIFY)

Check if Sarvam STT supports language hints or auto-detection. If yes:

```typescript
export class SarvamSTT extends stt.STT {
  // ... existing code ...
  
  /**
   * Update language hint for STT
   * Some STT providers support language hints without reconnecting
   */
  setLanguageHint(language: SarvamSTTLanguage): void {
    this.languageHint = language;
    // Send language hint to active stream if supported
  }
}
```

#### Option B: STT Pool with Multiple Languages

Create multiple STT instances, one per language, and route audio to appropriate instance:

```typescript
// src/services/multi-language-stt-pool.ts (NEW)
export class MultiLanguageSTTPool {
  private sttInstances: Map<SupportedLanguage, SarvamSTT> = new Map();
  private activeLanguage: SupportedLanguage;
  
  constructor(supportedLanguages: SupportedLanguage[]) {
    // Create STT instance for each language
  }
  
  getSTTForLanguage(language: SupportedLanguage): SarvamSTT {
    return this.sttInstances.get(language)!;
  }
  
  switchActiveLanguage(language: SupportedLanguage): void {
    // Switch which STT is actively processing audio
  }
}
```

### **Phase 4: LLM Context Updates** (Week 2-3)

#### Step 4.1: Dynamic System Prompt Updates

**File:** `src/agent/index.ts` (MODIFY)

Instead of static system prompt, generate dynamic prompts:

```typescript
// Around line 1220
function buildMultilingualSystemPrompt(
  basePrompt: string,
  currentLanguage: string
): string {
  const languageInstruction = {
    'en-IN': 'Respond in English.',
    'hi-IN': 'उत्तर हिंदी में दें। (Respond in Hindi)',
    'ta-IN': 'தமிழில் பதிலளிக்கவும். (Respond in Tamil)',
    'te-IN': 'తెలుగులో స్పందించండి. (Respond in Telugu)',
  }[currentLanguage] || 'Respond in English.';
  
  return `${basePrompt}

CURRENT LANGUAGE: ${currentLanguage}
${languageInstruction}

IMPORTANT: The user is currently speaking in ${currentLanguage}. 
Respond ONLY in ${currentLanguage}. Do not switch languages unless 
the user explicitly asks you to.`;
}
```

#### Step 4.2: Update LLM Context on Language Switch

Hook into the language switch handler to update LLM:

```typescript
// In language-switch-handler.ts
private async performLanguageSwitch(
  newLanguage: string,
  context: LanguageSwitchContext
): Promise<boolean> {
  // ... existing TTS switch ...
  
  // Update LLM system message
  const updatedPrompt = buildMultilingualSystemPrompt(
    context.basePrompt,
    newLanguage
  );
  
  // Note: LiveKit Agents doesn't support hot-swapping system prompts
  // Workaround: Inject language instruction as a system message
  await context.llmSession.injectSystemMessage({
    content: `Language switched to ${newLanguage}. Respond only in ${newLanguage}.`,
  });
}
```

### **Phase 5: Agent Configuration Updates** (Week 3)

#### Step 5.1: Update Convex Schema

**File:** `convex/schema.ts` (MODIFY)

```typescript
export default defineSchema({
  agents: defineTable({
    // ... existing fields ...
    
    // CHANGE: Make language optional, use as default only
    language: v.optional(v.string()), // Default language (fallback)
    
    // NEW: Support multiple languages
    supportedLanguages: v.optional(
      v.array(v.string()) // e.g., ['en-IN', 'hi-IN', 'ta-IN']
    ),
    
    // NEW: Enable/disable dynamic language switching
    enableDynamicLanguageSwitching: v.optional(v.boolean()),
    
    // NEW: Language detection sensitivity
    languageSwitchSensitivity: v.optional(
      v.union(
        v.literal('high'),    // Switch after 1 detection
        v.literal('medium'),  // Switch after 2 consecutive detections (default)
        v.literal('low')      // Switch after 3 consecutive detections
      )
    ),
  }),
});
```

#### Step 5.2: Update Agent Config Service

**File:** `src/services/agent-config.ts` (MODIFY)

```typescript
export interface AgentConfigData {
  // ... existing fields ...
  
  // Language configuration
  defaultLanguage?: string; // Renamed from 'language'
  supportedLanguages?: string[]; // NEW
  enableDynamicLanguageSwitching?: boolean; // NEW
  languageSwitchSensitivity?: 'high' | 'medium' | 'low'; // NEW
}
```

#### Step 5.3: Update Agent Initialization

**File:** `src/agent/index.ts` (MODIFY - around line 1160-1184)

```typescript
// BEFORE (Static Language):
let agentLanguage = config.sarvam.language;
if (agentConfig) {
  agentLanguage = agentConfig.language || agentLanguage;
}

// AFTER (Dynamic Language Support):
let defaultLanguage = config.sarvam.language; // Fallback
let supportedLanguages = ['en-IN', 'hi-IN', 'ta-IN']; // Default
let enableDynamicSwitching = true; // Default ON

if (agentConfig) {
  defaultLanguage = agentConfig.defaultLanguage || defaultLanguage;
  supportedLanguages = agentConfig.supportedLanguages || supportedLanguages;
  enableDynamicSwitching = agentConfig.enableDynamicLanguageSwitching ?? true;
}

// Initialize plugins with DEFAULT language only
// They will be switched dynamically during call
const agentPluginConfig: AgentPluginConfig = {
  language: defaultLanguage,
  supportedLanguages, // NEW
  voice: agentVoice,
  pace: agentPace,
};

// Create language switch handler if enabled
let languageSwitchHandler: LanguageSwitchHandler | null = null;
if (enableDynamicSwitching) {
  languageSwitchHandler = new LanguageSwitchHandler();
  logger.info('🌐 Dynamic language switching ENABLED', {
    default: defaultLanguage,
    supported: supportedLanguages,
  });
}
```

### **Phase 6: Event Listening & Language Detection Loop** (Week 3)

#### Step 6.1: Hook into User Transcripts

**File:** `src/agent/index.ts` (MODIFY - around line 1500)

Add listener for user transcripts:

```typescript
// After voiceSession creation (around line 1470)

// Listen for user speech transcripts
voiceSession.on(voice.AgentSessionEventTypes.UserTranscriptReceived, async (ev) => {
  const transcript = ev.transcript?.text;
  
  if (!transcript || !languageSwitchHandler) {
    return; // Dynamic switching disabled
  }
  
  // Detect and switch language if needed
  const switched = await languageSwitchHandler.handleTranscript(transcript, {
    sessionId: session.sessionId,
    ttsPlugin: plugins.tts,
    currentLanguage: agentContext.currentLanguage,
    languageDetector: agentContext.languageDetector,
  });
  
  if (switched) {
    // Update agent context
    agentContext.currentLanguage = languageSwitchHandler.getCurrentLanguage();
    
    // Log language switch in metrics
    metricsCollector.recordLanguageSwitch(
      agentContext.currentLanguage
    );
  }
});
```

---

## 🧪 Testing Strategy

### Test Scenarios

#### Test 1: Single Language Call (Baseline)
```
User speaks: English throughout call
Expected: Agent responds in English (no language switches)
```

#### Test 2: Mid-Call Language Switch
```
1. User starts: "Hello, I need information" (English)
2. Agent responds: "Hello! How can I help you?" (English)
3. User switches: "नमस्ते, मुझे जानकारी चाहिए" (Hindi)
4. Agent detects language change
5. Agent responds: "नमस्कार! मैं आपकी कैसे मदद कर सकता हूं?" (Hindi)
```

#### Test 3: Rapid Language Switching (Stress Test)
```
User alternates every sentence: English -> Tamil -> English -> Tamil
Expected: Agent follows after 2-3 detections (hysteresis prevents rapid switching)
```

#### Test 4: Mixed Language Utterance
```
User says: "Hello, என் பெயர் ராஜ்" (English + Tamil)
Expected: Agent detects dominant language or asks for clarification
```

#### Test 5: Language Switch During Streaming
```
User interrupts mid-response and switches language
Expected: Agent stops, detects new language, continues in new language
```

### Validation Criteria

- ✅ Language detection accuracy > 95% for utterances > 10 words
- ✅ Language switch latency < 500ms
- ✅ No audio glitches during TTS language switch
- ✅ LLM responses match detected language
- ✅ Hysteresis prevents false switches (< 2% false positive rate)
- ✅ Works across all supported languages: English, Hindi, Tamil, Telugu, Kannada

---

## 🚀 Deployment & Rollout

### Phase 1: Internal Testing (Week 4)
- Deploy to staging environment
- Manual testing with all language pairs
- Monitor logs for false language switches

### Phase 2: Beta Rollout (Week 5)
- Enable for 10% of calls
- Feature flag: `ENABLE_DYNAMIC_LANGUAGE_SWITCHING=true`
- Monitor metrics:
  - Language switch frequency
  - Switch accuracy
  - User satisfaction (call completion rate)

### Phase 3: Full Rollout (Week 6)
- Enable for all agents by default
- Add admin UI to configure per-agent:
  - `enableDynamicLanguageSwitching` (toggle)
  - `supportedLanguages` (multi-select)
  - `languageSwitchSensitivity` (slider)

---

## 📊 Configuration Examples

### Example 1: Hindi + English Agent (Customer Service)
```json
{
  "agentId": "agent_customer_service",
  "name": "Customer Service Agent",
  "defaultLanguage": "en-IN",
  "supportedLanguages": ["en-IN", "hi-IN"],
  "enableDynamicLanguageSwitching": true,
  "languageSwitchSensitivity": "medium"
}
```

### Example 2: Tamil-Only Agent (Regional Hospital)
```json
{
  "agentId": "agent_arrow_hospital",
  "name": "Arrow Hospital Agent",
  "defaultLanguage": "ta-IN",
  "supportedLanguages": ["ta-IN"],
  "enableDynamicLanguageSwitching": false
}
```

### Example 3: Multi-Language Agent (National Service)
```json
{
  "agentId": "agent_national_helpline",
  "name": "National Helpline",
  "defaultLanguage": "en-IN",
  "supportedLanguages": ["en-IN", "hi-IN", "ta-IN", "te-IN", "kn-IN"],
  "enableDynamicLanguageSwitching": true,
  "languageSwitchSensitivity": "high"
}
```

---

## ⚠️ Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **False Language Detection** | Agent switches language incorrectly | • Use hysteresis (require 2-3 consecutive detections)<br>• Higher confidence threshold for switches<br>• Allow user to explicitly set language |
| **TTS Reconnection Latency** | Brief pause during language switch | • Pre-warm TTS connections for all supported languages<br>• Use connection pooling<br>• Implement seamless handoff |
| **LLM Context Loss** | Agent "forgets" conversation context after switch | • Maintain conversation history<br>• Include language context in chat history<br>• Test with long conversations |
| **STT Accuracy Degradation** | Multi-language mode less accurate than single-language | • Benchmark STT accuracy in multi-lang mode<br>• Fall back to single-language if accuracy drops<br>• Use language-specific STT pools |
| **Increased Latency** | Language detection adds processing time | • Optimize detection algorithm (< 50ms)<br>• Run detection in parallel with STT<br>• Cache detection results |

---

## 🔄 Rollback Plan

If issues arise in production:

### Immediate Rollback (< 5 minutes)
1. Set environment variable: `ENABLE_DYNAMIC_LANGUAGE_SWITCHING=false`
2. Restart agent workers
3. All agents revert to static language from Convex config

### Agent-Specific Rollback
Update agent config in Convex:
```typescript
await convex.mutation(api.agents.update, {
  agentId: 'problematic_agent',
  enableDynamicLanguageSwitching: false,
});
```

### Emergency Hotfix
Revert code changes:
```bash
git revert <commit_hash>
git push origin main
# Trigger redeployment
```

---

## 📈 Success Metrics

### Key Performance Indicators (KPIs)

1. **Language Detection Accuracy**
   - Target: > 95% for utterances > 10 words
   - Measure: Compare auto-detected language vs. ground truth labels

2. **Language Switch Latency**
   - Target: < 500ms from detection to TTS response
   - Measure: Time between language detection event and TTS reconnection

3. **False Switch Rate**
   - Target: < 2% of all language detections
   - Measure: Switches that were reverted within 30 seconds

4. **User Satisfaction**
   - Target: No decrease in call completion rate
   - Measure: % of calls that reach successful resolution

5. **System Performance**
   - Target: No increase in latency or CPU usage
   - Measure: P50/P95/P99 latency, CPU utilization

---

## 🛠️ Development Environment Setup

### Prerequisites
```bash
# Install dependencies
npm install

# Set environment variables
export ENABLE_DYNAMIC_LANGUAGE_SWITCHING=true
export LANGUAGE_DETECTION_DEBUG=true
```

### Testing Locally
```bash
# Start agent with multilingual support
npm run dev

# Test with specific language
INITIAL_LANGUAGE=hi-IN npm run dev

# Enable verbose logging
DEBUG=language-detector,language-switch npm run dev
```

### Mock Testing
```typescript
// tests/language-detection.test.ts
import { LanguageDetectorService } from '../src/services/language-detector';

test('detects Tamil from Tamil script', () => {
  const detector = new LanguageDetectorService();
  const result = detector.detectFromText('வணக்கம், எப்படி இருக்கீங்க?');
  
  expect(result.language).toBe('ta-IN');
  expect(result.confidence).toBeGreaterThan(0.9);
});
```

---

## 📚 Additional Resources

### Documentation to Create/Update

1. **`docs/architecture/LANGUAGE_DETECTION_ARCHITECTURE.md`**
   - Technical deep-dive into language detection algorithms
   - Performance benchmarks
   - Comparison with external APIs (Google Cloud Language Detection, Azure, etc.)

2. **`docs/guides/CONFIGURING_MULTILINGUAL_AGENTS.md`**
   - User guide for setting up multilingual agents
   - Best practices
   - Troubleshooting common issues

3. **`README.md`** (Update)
   - Add "Multilingual Support" section
   - Configuration examples
   - Link to detailed docs

### API References

- **Sarvam AI Documentation**: Check if STT/TTS supports language hints
- **LiveKit Agents SDK**: Review if plugins can be hot-swapped
- **Language Detection APIs**:
  - [franc](https://github.com/wooorm/franc) - Offline language detection
  - [Google Cloud Translation API](https://cloud.google.com/translate/docs/detecting-language)
  - [Azure Text Analytics](https://azure.microsoft.com/en-us/services/cognitive-services/text-analytics/)

---

## ✅ Implementation Checklist

### Week 1: Foundation
- [ ] Create `LanguageDetectorService` (`src/services/language-detector.ts`)
- [ ] Implement script detection (Unicode ranges)
- [ ] Add pattern matching for common words
- [ ] Add confidence scoring algorithm
- [ ] Write unit tests for language detection
- [ ] Integrate language detector into agent context

### Week 2: TTS & STT
- [ ] Add `switchLanguage()` method to `SarvamTTS`
- [ ] Implement TTS WebSocket reconnection logic
- [ ] Create `LanguageSwitchHandler` service
- [ ] Test TTS language switching without audio glitches
- [ ] Research Sarvam STT language hint support
- [ ] Implement STT language switching (Option A or B)

### Week 3: Integration & Testing
- [ ] Update Convex schema with new language fields
- [ ] Modify `AgentConfigService` to support multi-language
- [ ] Update agent initialization logic (`src/agent/index.ts`)
- [ ] Add event listener for user transcripts
- [ ] Implement language detection loop
- [ ] Create test scenarios for all language pairs
- [ ] Manual testing with real phone calls

### Week 4: Polish & Deploy
- [ ] Add admin UI for configuring language settings
- [ ] Implement feature flag for gradual rollout
- [ ] Add monitoring/alerting for language switches
- [ ] Update documentation (README, architecture docs)
- [ ] Deploy to staging environment
- [ ] Load testing with concurrent calls

### Week 5-6: Rollout
- [ ] Beta rollout (10% of calls)
- [ ] Monitor metrics (accuracy, latency, false switches)
- [ ] Fix any issues found in beta
- [ ] Full rollout (100% of calls)
- [ ] Post-launch monitoring and optimization

---

## 🎓 Learning Resources

For the development team:

1. **Language Detection Techniques**
   - [N-gram based language identification](https://arxiv.org/abs/1708.08052)
   - [Unicode script detection](https://unicode.org/reports/tr24/)

2. **Real-time Audio Processing**
   - [WebSocket streaming best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
   - [LiveKit Agents Plugin Development](https://docs.livekit.io/agents/)

3. **Indian Languages Support**
   - [Indian Language Computing](https://www.tdil-dc.in/)
   - [Tamil Script Unicode](https://unicode.org/charts/PDF/U0B80.pdf)
   - [Devanagari Script Unicode](https://unicode.org/charts/PDF/U0900.pdf)

---

## 📝 Notes & Decisions

### Key Design Decisions

1. **Why not use external language detection API?**
   - **Decision:** Use local script-based detection first
   - **Reason:** Lower latency (< 50ms vs 200-500ms for API call), no API costs, works offline
   - **Trade-off:** May be less accurate for ambiguous cases, but sufficient for Indian languages (distinct scripts)

2. **Why hysteresis (require 2-3 consecutive detections)?**
   - **Decision:** Implement detection buffer with hysteresis
   - **Reason:** Prevents rapid switching on single-word utterances or mixed-language sentences
   - **Trade-off:** Slightly delayed language switch, but more stable user experience

3. **Why switch TTS but not STT language?**
   - **Decision:** TTS language switching is critical, STT can stay in multi-language mode
   - **Reason:** Users notice incorrect TTS language immediately (agent speaks wrong language), but STT errors are less noticeable
   - **Trade-off:** STT accuracy may be slightly lower in multi-language mode

4. **Why not create new voice session on language switch?**
   - **Decision:** Keep same voice session, only switch TTS language
   - **Reason:** Creating new session would reset conversation context, cause audio disruptions
   - **Trade-off:** More complex implementation, but seamless user experience

---

## 🤝 Contributing

When implementing this feature:

1. **Follow the plan sequentially** - Each phase builds on previous phases
2. **Write tests first** - Language detection is critical, needs high test coverage
3. **Document edge cases** - What happens with mixed-language input?
4. **Monitor in production** - Add detailed logging for language switches
5. **Get feedback early** - Test with real users in beta phase

---

## 📞 Support & Questions

For questions about this implementation plan:

- **Technical Lead:** [Your Name]
- **Architecture Review:** [Team Lead]
- **Testing Strategy:** [QA Lead]

---

**End of Implementation Plan**

---

## 🔖 Quick Reference

### Key Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `src/services/language-detector.ts` | CREATE - Core language detection logic | 🔴 HIGH |
| `src/agent/language-switch-handler.ts` | CREATE - Orchestrates language switching | 🔴 HIGH |
| `src/plugins/sarvam_tts.ts` | MODIFY - Add `switchLanguage()` method | 🔴 HIGH |
| `src/agent/index.ts` | MODIFY - Integrate language detection loop | 🔴 HIGH |
| `convex/schema.ts` | MODIFY - Add multi-language fields | 🟡 MEDIUM |
| `src/services/agent-config.ts` | MODIFY - Parse multi-language config | 🟡 MEDIUM |
| `src/plugins/sarvam_stt.ts` | MODIFY - Add language hint support | 🟢 LOW |

### Environment Variables

```bash
# Feature flag
ENABLE_DYNAMIC_LANGUAGE_SWITCHING=true  # Default: false

# Debug logging
LANGUAGE_DETECTION_DEBUG=true  # Default: false
LANGUAGE_SWITCH_VERBOSE=true   # Default: false

# Detection sensitivity
LANGUAGE_SWITCH_SENSITIVITY=medium  # Options: high, medium, low
LANGUAGE_DETECTION_CONFIDENCE_THRESHOLD=0.7  # 0.0 to 1.0
```

### Testing Commands

```bash
# Run language detection tests
npm test -- --grep "language detection"

# Test specific language pair
LANGUAGES=en-IN,ta-IN npm test -- --grep "language switching"

# Integration test with mock calls
npm run test:integration
```

---

**Document Version:** 1.0  
**Last Updated:** January 26, 2026  
**Status:** ✅ Ready for Implementation  
**Estimated Effort:** 4-6 weeks (1 developer)
