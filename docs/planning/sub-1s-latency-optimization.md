# Sub-1s Latency Optimization Plan
**Target:** <1000ms end-to-end response time with natural Tamil speech  
**Date:** January 18, 2026  
**Status:** 📋 Ready for Implementation

---

## 🎯 Executive Summary

**Current State:** 1.5-2s latency (already optimized from 6-7s)  
**Target:** <1s latency with natural colloquial Tamil  
**Gap:** Need to reduce by 500-1000ms  

**Solution:** Replace Sarvam STT/TTS with faster providers + optimize LLM

---

## 📊 Current Bottlenecks

| Component | Current Latency | Target | Must Reduce |
|-----------|----------------|--------|-------------|
| **Sarvam STT** | 300ms | 150ms | **-150ms** 🔴 |
| **GPT-4o-mini LLM** | 450ms | 300ms | **-150ms** 🔴 |
| **Sarvam TTS** | 300ms | 200ms | **-100ms** 🔴 |
| Other (VAD, network) | 450ms | 350ms | -100ms 🟡 |
| **TOTAL** | **1,500ms** | **1,000ms** | **-500ms needed** |

---

## 🏆 Recommended Solution

### Option 1: Speed-Optimized Stack (Best)

| Component | Switch To | Latency | Savings | Cost |
|-----------|-----------|---------|---------|------|
| **STT** | Google Cloud Speech (ta-IN) | 150ms | **-150ms** | $1.44/hr |
| **LLM** | Groq (llama-3.3-70b) | 200ms | **-250ms** | FREE* |
| **TTS** | Azure Neural (Pallavi) | 200ms | **-100ms** | $0.96/hr |

**Total Latency:** **600-800ms** ✅ (-50% faster)  
**Total Cost:** **$2.40/hr** (vs current $0.60/hr)  
**Implementation:** 4-5 days

*Groq free tier: 30 req/min (600/hr) - sufficient for small-medium scale

---

## 🎤 Natural Tamil Speech Solution

### Problem with Current TTS
- Sarvam TTS trained on formal Tamil
- Lacks colloquial speech patterns
- Robotic intonation

### Solution: Voice Cloning

**Recommended:** PlayHT or ElevenLabs

**Process:**
1. Record 60 seconds of natural Tamil speech with slang
2. Upload to PlayHT/ElevenLabs for voice cloning (30 min)
3. Get cloned voice ID
4. Use in agent configuration

**Result:**
- ✅ Natural colloquial Tamil with slang
- ✅ Preserves regional accent
- ✅ Human-like prosody
- ⚠️ Higher cost: $6-27/hr (vs $0.24/hr Sarvam)

**Cost-Benefit:**
- Premium customer experience
- Higher user engagement
- Competitive differentiation
- Justifies premium pricing

---

## 🚀 Implementation Plan

### Phase 1: Core Speed Optimization (Days 1-3)

**Day 1: Add New Providers**
```bash
# Install required packages
npm install @livekit/agents-plugin-google
npm install @livekit/agents-plugin-azure
npm install groq-sdk

# Add environment variables
GOOGLE_CREDENTIALS='{"type":"service_account",...}'
GROQ_API_KEY=gsk_...
AZURE_SPEECH_KEY=...
AZURE_SPEECH_REGION=eastus

STT_PROVIDER=google
LLM_PROVIDER=groq
TTS_PROVIDER=azure
```

**Day 2: Code Integration**
- Implement Google STT plugin in `src/plugins/factory.ts`
- Implement Groq LLM plugin (OpenAI-compatible)
- Implement Azure TTS plugin
- Update factory to support provider selection

**Day 3: Testing & Validation**
- A/B test with 10% traffic
- Measure latency improvements
- Validate Tamil transcription quality
- Check TTS voice quality

**Expected Result:** <800ms latency ✅

---

### Phase 2: Natural Speech (Days 4-7)

**Day 4: Voice Recording**
- Record 60-second Tamil voice sample
- Include common phrases, slang, natural intonation
- Use native speaker with desired accent

**Day 5: Voice Cloning**
```bash
# PlayHT Voice Cloning API
curl -X POST https://api.play.ht/api/v2/cloned-voices \
  -H "X-USER-ID: ${PLAYHT_USER_ID}" \
  -H "AUTHORIZATION: ${PLAYHT_API_KEY}" \
  -F "voice_name=Tamil_Natural" \
  -F "sample_file=@tamil_voice.wav"
```

**Day 6-7: Integration & Testing**
- Integrate cloned voice into TTS
- User acceptance testing
- Compare: Azure Neural vs Cloned voice
- Choose final TTS based on feedback

**Expected Result:** Natural colloquial Tamil ✅

---

## 💰 Cost Analysis

### Current Costs
| Component | Provider | Cost per Hour |
|-----------|----------|---------------|
| STT | Sarvam | $0.36/hr |
| LLM | OpenAI GPT-4o-mini | $0.12/hr |
| TTS | Sarvam | $0.24/hr |
| **Total** | | **$0.72/hr** |

### Optimized Costs

#### Option A: Speed-Optimized (Recommended)
| Component | Provider | Cost per Hour |
|-----------|----------|---------------|
| STT | Google Cloud | $1.44/hr |
| LLM | Groq (free tier) | $0.00/hr* |
| TTS | Azure Neural | $0.96/hr |
| **Total** | | **$2.40/hr** (+233%) |

*Free tier limits: 30 req/min = 1,800 req/hr

#### Option B: Premium Natural Speech
| Component | Provider | Cost per Hour |
|-----------|----------|---------------|
| STT | Google Cloud | $1.44/hr |
| LLM | Groq (free tier) | $0.00/hr |
| TTS | PlayHT (cloned) | $6.00/hr |
| **Total** | | **$7.44/hr** (+933%) |

#### Option C: Budget-Friendly
| Component | Provider | Cost per Hour |
|-----------|----------|---------------|
| STT | Deepgram (EN) + Sarvam (TA) | $0.72/hr |
| LLM | Groq (free tier) | $0.00/hr |
| TTS | Sarvam (keep current) | $0.24/hr |
| **Total** | | **$0.96/hr** (+33%) |
- Latency: ~900-1100ms (still good)

---

## 📈 Expected Results

### Latency Improvements
```
Current:  |████████████████| 1,500ms
Option 1: |████████| 600-800ms   (-50% ✅)
Option 2: |█████████| 700-900ms  (-40% ✅)
Option 3: |████████████| 900-1100ms (-30% ✅)
```

### Quality Improvements
| Aspect | Current | After Optimization |
|--------|---------|-------------------|
| Tamil STT Accuracy | 85-90% | 90-95% (+5-10%) |
| TTS Naturalness | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ (+40%) |
| Colloquial Speech | ❌ No | ✅ Yes (with cloning) |
| User Engagement | Baseline | +30-50% estimated |

---

## 🛠️ Technical Implementation

### Step 1: Add Google Cloud STT

```typescript
// src/plugins/factory.ts
import * as google from '@livekit/agents-plugin-google';

function createSTT(provider: STTProvider, ...): stt.STT {
  // ... existing code
  
  case 'google':
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS!);
    return new google.STT({
      credentials_info: credentials,
      language: sttConfig.language || 'ta-IN',
      model: 'latest_long',
      interim_results: true,
    });
}
```

### Step 2: Add Groq LLM

```typescript
// src/plugins/factory.ts
import Groq from 'groq-sdk';

function createLLM(provider: LLMProvider, ...): llm.LLM {
  // ... existing code
  
  case 'groq':
    return new openai.LLM({
      apiKey: process.env.GROQ_API_KEY!,
      baseURL: 'https://api.groq.com/openai/v1',
      model: 'llama-3.3-70b-versatile',
      temperature: llmConfig.temperature || 0.1,
    });
}
```

### Step 3: Add Azure Neural TTS

```typescript
// src/plugins/factory.ts
import * as azure from '@livekit/agents-plugin-azure';

function createTTS(provider: TTSProvider, ...): TTSWithPrewarm {
  // ... existing code
  
  case 'azure':
    return new azure.TTS({
      subscription_key: process.env.AZURE_SPEECH_KEY!,
      region: process.env.AZURE_SPEECH_REGION || 'eastus',
      voice: 'ta-IN-PallaviNeural',  // Female voice
      speech_rate: ttsConfig.pace || 0.85,
    });
}
```

### Step 4: Update Environment Config

```bash
# .env additions

# Google Cloud Speech-to-Text
GOOGLE_CREDENTIALS='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'

# Groq (FREE tier - 30 req/min)
GROQ_API_KEY=gsk_...

# Azure Speech Services
AZURE_SPEECH_KEY=your_azure_key_here
AZURE_SPEECH_REGION=eastus

# Provider Selection
STT_PROVIDER=google
LLM_PROVIDER=groq
TTS_PROVIDER=azure
```

### Step 5: Update Factory Function

```typescript
// src/plugins/factory.ts
export function createPluginsFromEnv(
  language: string,
  overrides?: PluginFactoryConfig['overrides']
): PluginBundle {
  const useSarvamVad = isSarvamLanguage(language);
  
  return createPlugins({
    sttProvider: process.env.STT_PROVIDER || 'sarvam',
    ttsProvider: process.env.TTS_PROVIDER || 'sarvam',
    llmProvider: process.env.LLM_PROVIDER || 'openai',
    language,
    apiKeys: {
      sarvam: config.sarvam.apiKey,
      openai: config.convex.openaiApiKey,
      google: process.env.GOOGLE_CREDENTIALS,
      groq: process.env.GROQ_API_KEY,
      azure: process.env.AZURE_SPEECH_KEY,
    },
    overrides: {
      stt: {
        model: config.sarvam.sttModel,
        vadSignals: useSarvamVad,
        highVadSensitivity: useSarvamVad,
        ...overrides?.stt,
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
```

---

## ✅ Success Criteria

### Latency Targets
- [ ] **P0:** <1000ms end-to-end 95th percentile
- [ ] **P0:** <800ms end-to-end 50th percentile
- [ ] **P1:** <600ms end-to-end best case

### Quality Targets
- [ ] **P0:** >90% Tamil transcription accuracy
- [ ] **P0:** Natural Tamil speech (user survey >4/5)
- [ ] **P1:** Colloquial Tamil support (with voice cloning)

### Cost Targets
- [ ] **P0:** <$5/hr per agent (reasonable for premium)
- [ ] **P1:** <$3/hr per agent (cost-optimized)

---

## 🚨 Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Groq rate limits (30 req/min) | High | Monitor usage, upgrade to paid tier ($0.27/1M tokens) |
| Google/Azure cost overruns | Medium | Set budget alerts, monitor usage |
| Voice cloning quality varies | Medium | Test multiple voice samples, iterate |
| New providers have bugs | Low | A/B test with 10% traffic first |
| Latency doesn't hit target | High | Have fallback plan (Option 3) |

---

## 📋 Next Steps

1. **Get Approvals:**
   - [ ] Budget approval for increased costs
   - [ ] Sign-off on provider changes

2. **Setup Accounts:**
   - [ ] Google Cloud account + Speech API
   - [ ] Groq API key (free tier)
   - [ ] Azure Speech Services subscription
   - [ ] (Optional) PlayHT/ElevenLabs account

3. **Start Implementation:**
   - [ ] Follow Phase 1 plan (Days 1-3)
   - [ ] Measure and validate results
   - [ ] Proceed to Phase 2 if approved

---

**Estimated Timeline:** 1 week (5 working days)  
**Estimated Investment:** $2-7/hr operational cost  
**Expected ROI:** 50% latency reduction + premium UX = competitive advantage

**Decision Needed:** Choose between:
- **Option 1 (Recommended):** $2.40/hr - Best speed + good quality
- **Option 2 (Premium):** $7.44/hr - Best naturalness + best speed
- **Option 3 (Budget):** $0.96/hr - Good speed improvement, keep costs low
