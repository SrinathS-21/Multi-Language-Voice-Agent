# Local Models Integration Guide

> How to integrate local AI models into your LiveKit voice agent

## ✅ What Changed

Your plugin architecture is now **flexible and ready for local models**:

| Feature | Before | Now |
|---------|--------|-----|
| **Providers** | Only 'sarvam', 'openai' | Multiple: sarvam, deepgram, elevenlabs, whisper, ollama, custom |
| **API Keys** | Required | Optional (for local models) |
| **Endpoints** | Hardcoded | Configurable via `baseUrl` |
| **Extensibility** | Rigid | Easy to add new providers |

---

## Quick Examples

### Example 1: Use Ollama (Local LLM)

```typescript
// In your agent code
const plugins = createPlugins({
  sttProvider: 'sarvam',
  ttsProvider: 'sarvam', 
  llmProvider: 'ollama',  // 👈 Local model
  language: 'ta-IN',
  apiKeys: {
    sarvam: process.env.SARVAM_API_KEY,
  },
  overrides: {
    llm: {
      model: 'llama3.2:3b',           // 👈 Local model name
      baseUrl: 'http://localhost:11434/v1',  // 👈 Ollama endpoint
      temperature: 0.7,
    },
  },
});
```

**Environment:**
```bash
# Install Ollama: https://ollama.ai
ollama pull llama3.2:3b
ollama serve  # Runs on localhost:11434
```

---

### Example 2: Custom Local STT (Whisper)

```typescript
const plugins = createPlugins({
  sttProvider: 'custom',  // 👈 Custom provider
  ttsProvider: 'sarvam',
  llmProvider: 'openai',
  language: 'en-IN',
  overrides: {
    stt: {
      baseUrl: 'http://localhost:8000',  // 👈 Your Whisper API
      model: 'large-v3',
    },
  },
});
```

**Setup your Whisper server:**
```bash
# Example: faster-whisper API
pip install faster-whisper fastapi uvicorn
# Run your API server on port 8000
```

**Note:** You'll need to implement the custom STT wrapper in [factory.ts](src/plugins/factory.ts#L95)

---

### Example 3: Mix Local + Cloud

```typescript
const plugins = createPlugins({
  sttProvider: 'deepgram',    // Cloud STT (better quality)
  ttsProvider: 'custom',      // Local TTS (privacy)
  llmProvider: 'ollama',      // Local LLM (cost-free)
  language: 'hi-IN',
  apiKeys: {
    deepgram: process.env.DEEPGRAM_API_KEY,
  },
  overrides: {
    tts: {
      baseUrl: 'http://localhost:5000',  // Your TTS server
      speaker: 'hindi_female',
    },
    llm: {
      model: 'mistral:7b',
      baseUrl: 'http://localhost:11434/v1',
    },
  },
});
```

---

## Step-by-Step: Adding a New Provider

### 1. Update Types (Already Done ✅)

The types now support any provider via the flexible structure.

### 2. Add Provider Implementation

Edit `src/plugins/factory.ts`:

```typescript
// Example: Adding Deepgram STT
import * as deepgram from '@livekit/agents-plugin-deepgram';

function createSTT(provider: STTProvider, ...) {
  switch (provider) {
    case 'sarvam':
      // existing code
      
    case 'deepgram':  // 👈 Add this
      if (!sttConfig.apiKey) throw new Error('Deepgram API key required');
      return new deepgram.STT({
        apiKey: sttConfig.apiKey,
        model: sttConfig.model || 'nova-2',
        language: sttConfig.language,
      });
      
    // ... rest
  }
}
```

### 3. Install Provider Package

```bash
npm install @livekit/agents-plugin-deepgram
```

### 4. Use It

```typescript
const plugins = createPlugins({
  sttProvider: 'deepgram',  // 👈 Now available
  ttsProvider: 'sarvam',
  llmProvider: 'openai',
  language: 'en-IN',
  apiKeys: {
    deepgram: process.env.DEEPGRAM_API_KEY,
    sarvam: process.env.SARVAM_API_KEY,
    openai: process.env.OPENAI_API_KEY,
  },
});
```

---

## Environment Configuration

Update your `.env` for local models:

```bash
# Cloud providers (existing)
SARVAM_API_KEY=your_key
OPENAI_API_KEY=your_key

# Local model endpoints
OLLAMA_BASE_URL=http://localhost:11434/v1
LOCAL_STT_URL=http://localhost:8000
LOCAL_TTS_URL=http://localhost:5000

# Optional: Other cloud providers
DEEPGRAM_API_KEY=your_key
ELEVENLABS_API_KEY=your_key
```

---

## Popular Local Models

| Component | Model | Setup |
|-----------|-------|-------|
| **LLM** | Llama 3.2 (3B) | `ollama pull llama3.2:3b` |
| **LLM** | Mistral 7B | `ollama pull mistral:7b` |
| **STT** | Whisper Large v3 | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) |
| **TTS** | Coqui TTS | [coqui-ai/TTS](https://github.com/coqui-ai/TTS) |
| **TTS** | Piper | [rhasspy/piper](https://github.com/rhasspy/piper) |

---

## Custom Provider Template

If you want to add a completely custom provider:

```typescript
// In factory.ts - createSTT function
case 'custom':
  if (!sttConfig.baseUrl) throw new Error('baseUrl required');
  
  // Implement your custom STT class
  return new CustomSTT({
    endpoint: sttConfig.baseUrl,
    model: sttConfig.model,
    language: sttConfig.language,
    // ... your config
  });
```

Then create `src/plugins/custom_stt.ts`:

```typescript
import { stt } from '@livekit/agents';

export class CustomSTT extends stt.STT {
  private endpoint: string;
  
  constructor(options: { endpoint: string; model?: string }) {
    super();
    this.endpoint = options.endpoint;
  }
  
  async recognize(audio: Buffer): Promise<string> {
    // Call your local API
    const response = await fetch(`${this.endpoint}/transcribe`, {
      method: 'POST',
      body: audio,
    });
    return response.text();
  }
}
```

---

## Performance Tips

| Tip | Why |
|-----|-----|
| Use quantized models | Llama 3.2 3B faster than 70B |
| Keep LLM local | Reduces API costs |
| Use cloud STT | Better accuracy for Indian languages |
| Local TTS for privacy | Keep sensitive data on-premise |

---

## Troubleshooting

### "Unsupported provider" Error
→ Add implementation in `factory.ts` switch statement

### "baseUrl required" Error  
→ Add `baseUrl` in overrides config:
```typescript
overrides: {
  llm: { baseUrl: 'http://localhost:11434/v1' }
}
```

### Ollama Connection Failed
→ Check if running: `curl http://localhost:11434/v1/models`

---

## Next Steps

1. ✅ **Types updated** - Supports any provider
2. ✅ **Factory flexible** - Easy to extend
3. 🔨 **Add your provider** - Follow template above
4. 🚀 **Deploy** - Mix local + cloud as needed

Your pipeline is now **smooth and ready for local models**! 🎉
