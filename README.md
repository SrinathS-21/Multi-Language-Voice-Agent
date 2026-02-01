# LiveKit Sarvam Voice Agent

<div align="center">

**Enterprise-grade Real-time Voice AI Platform**

[![Production Ready](https://img.shields.io/badge/status-production%20ready-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)]()
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

*Powered by LiveKit WebRTC, Sarvam AI, and Convex*

[Features](#-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Deployment](#-deployment) • [Support](#-support)

</div>

---

## 📋 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Architecture](#%EF%B8%8F-architecture)
- [Configuration](#%EF%B8%8F-configuration)
- [Knowledge Base](#-knowledge-base)
- [Deployment](#-deployment)
- [Monitoring](#-monitoring)
- [API Reference](#-api-reference)
- [Troubleshooting](#-troubleshooting)
- [Performance](#-performance)
- [Security](#-security)

---

## ✨ Features

<table>
  <tr>
    <td><b>🎙️ Real-time Voice</b></td>
    <td>LiveKit WebRTC with sub-100ms latency</td>
  </tr>
  <tr>
    <td><b>🤖 Multi-lingual AI</b></td>
    <td>Support for 11 Indian languages via Sarvam AI</td>
  </tr>
  <tr>
    <td><b>📚 RAG Knowledge Base</b></td>
    <td>Vector search with semantic retrieval</td>
  </tr>
  <tr>
    <td><b>🔄 Dynamic Functions</b></td>
    <td>Intent-based function routing</td>
  </tr>
  <tr>
    <td><b>📊 Analytics & Metrics</b></td>
    <td>Real-time monitoring with detailed insights</td>
  </tr>
  <tr>
    <td><b>🏢 Multi-tenant</b></td>
    <td>Organization-based isolation</td>
  </tr>
  <tr>
    <td><b>🚀 Production Ready</b></td>
    <td>Error handling, retry logic, health checks</td>
  </tr>
  <tr>
    <td><b>🔒 Enterprise Security</b></td>
    <td>API authentication, rate limiting, audit logs</td>
  </tr>
</table>

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18.0.0
- **npm** or **yarn**
- **Convex** account ([convex.dev](https://convex.dev))
- **LiveKit** server ([livekit.io](https://livekit.io))
- **Sarvam AI** API key ([sarvam.ai](https://sarvam.ai))
- **OpenAI** API key ([openai.com](https://openai.com))

### ☁️ Cloud Deployment

**Ready to deploy to production?**

- **Render.com** (Easiest for beginners) - [Full Guide](docs/RENDER_DEPLOYMENT.md) | [Checklist](docs/RENDER_CHECKLIST.md)
- **Fly.io** (Best latency from India) - [Guide](docs/DEPLOYMENT.md)
- **AWS/Railway** - [Guide](docs/DEPLOYMENT.md)

### Installation

```bash
# Clone repository
git clone <repository-url>
cd livekit_sarvam_agent

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Deploy backend
npx convex dev

# Build project
npm run build
```

### Development

```bash
# Run in development mode
npm run dev

# Run with debug logging
LOG_LEVEL=DEBUG npm run dev
```

### Production

```bash
# Build for production
npm run build

# Deploy Convex backend
npx convex deploy --prod

# Start production server
npm start
```

---

## 🏗️ Architecture

### System Overview

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐      ┌──────────────┐
│   Client    │─────▶│   LiveKit    │─────▶│    Agent    │─────▶│    Convex    │
│  (WebRTC)   │◀─────│   (WebRTC)   │◀─────│  (Workers)  │◀─────│   (Backend)  │
└─────────────┘      └──────────────┘      └─────────────┘      └──────────────┘
       │                    │                      │                     │
       ▼                    ▼                      ▼                     ▼
    Audio              Processing              AI Models            Database
```

### Voice Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Voice Agent Pipeline                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Audio In ──▶ [VAD] ──▶ [STT] ──▶ [LLM] ──▶ [Functions] ──▶ [TTS] ──▶  │
│     ↓           ↓          ↓         ↓           ↓            ↓      ↓   │
│  WebRTC    Silero    Sarvam   OpenAI    Knowledge     Sarvam  Audio Out │
│                     saarika   GPT-4o      Search      bulbul            │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Voice** | LiveKit SDK | WebRTC infrastructure |
| **STT** | Sarvam AI (saarika:v2.5) | Speech-to-text (11 languages) |
| **TTS** | Sarvam AI (bulbul:v2) | Text-to-speech synthesis |
| **LLM** | OpenAI (gpt-4o-mini) | Conversational AI |
| **VAD** | Silero VAD | Voice activity detection |
| **Backend** | Convex | Real-time database & functions |
| **RAG** | Convex Vector Search | Knowledge base retrieval |
| **Runtime** | Node.js 18+ | JavaScript runtime |
| **Language** | TypeScript 5.5 | Type-safe development |

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
#═══════════════════════════════════════════════════════════
# LiveKit Configuration
#═══════════════════════════════════════════════════════════
LIVEKIT_URL=wss://your-livekit-server.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

#═══════════════════════════════════════════════════════════
# Sarvam AI Configuration
#═══════════════════════════════════════════════════════════
SARVAM_API_KEY=your_sarvam_api_key
SARVAM_STT_MODEL=saarika:v2.5        # Speech-to-Text model
SARVAM_TTS_MODEL=bulbul:v2           # Text-to-Speech model
SARVAM_TTS_SPEAKER=anushka           # Voice (anushka, meera, arvind, etc.)
SARVAM_TTS_PACE=0.85                 # Speech rate (0.5-2.0, default: 1.0)
SARVAM_LANGUAGE=ta-IN                # Default language

#═══════════════════════════════════════════════════════════
# OpenAI Configuration
#═══════════════════════════════════════════════════════════
OPENAI_API_KEY=your_openai_api_key
SARVAM_LLM_MODEL=gpt-4o-mini         # LLM model
SARVAM_LLM_TEMPERATURE=0.1           # Response randomness (0.0-2.0)

#═══════════════════════════════════════════════════════════
# Convex Backend
#═══════════════════════════════════════════════════════════
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOY_KEY=your_deploy_key    # For CI/CD

#═══════════════════════════════════════════════════════════
# Server Configuration
#═══════════════════════════════════════════════════════════
HEALTH_PORT=8080
LOG_LEVEL=INFO                       # DEBUG, INFO, WARN, ERROR
NODE_ENV=production
```

### Supported Languages

Sarvam AI provides native support for **11 Indian languages**:

| Code | Language | Native Name |
|------|----------|-------------|
| `bn-IN` | Bengali | বাংলা |
| `en-IN` | English (India) | English |
| `gu-IN` | Gujarati | ગુજરાતી |
| `hi-IN` | Hindi | हिन्दी |
| `kn-IN` | Kannada | ಕನ್ನಡ |
| `ml-IN` | Malayalam | മലയാളം |
| `mr-IN` | Marathi | मराठी |
| `od-IN` | Odia | ଓଡ଼ିଆ |
| `pa-IN` | Punjabi | ਪੰਜਾਬੀ |
| `ta-IN` | Tamil | தமிழ் |
| `te-IN` | Telugu | తెలుగు |

### Plugin Configuration

#### Current Setup (January 2026)

| Component | Provider | Configuration | Notes |
|-----------|----------|---------------|-------|
| **STT** | Sarvam AI | `saarika:v2.5` | 11 Indian languages |
| **TTS** | Sarvam AI | `bulbul:v2`, speaker: `anushka` | Streaming disabled for reliability |
| **LLM** | OpenAI | `gpt-4o-mini`, temp: `0.1` | Low temperature for consistency |
| **VAD** | Silero | Forced (all languages) | More reliable than Sarvam VAD |

#### TTS Configuration

**Streaming Mode: DISABLED** (Production Optimization)

```typescript
// src/plugins/sarvam_tts.ts
const MIN_SENTENCE_LENGTH_FOR_STREAMING = 9999;
```

**Rationale**: Prevents mid-sentence audio cuts by sending complete responses as single segments. Trade-off: Slightly higher latency (~200ms) for guaranteed delivery.

#### VAD Configuration

**Mode: Silero (Forced)**

```typescript
// src/agent/index.ts
const useSarvamVad = false;  // Force Silero VAD
const selectedVad = sileroVad;

const VAD_CONFIG = {
  minSilenceDuration: 0.5,      // 500ms silence = speech end
  minSpeechDuration: 0.2,       // 200ms minimum to detect
  activationThreshold: 0.5,     // 50% confidence threshold
  prefixPaddingDuration: 0.05,  // 50ms audio buffer
};
```

**Why Silero?** More reliable voice activity detection and better interruption handling compared to Sarvam's built-in VAD.

---

## 📚 Knowledge Base

### Setup Workflow

**Best Practice**: Validate chunks before ingestion to ensure quality.

```bash
# Step 1: Parse source document into chunks
npx tsx scripts/prepare-knowledge-chunks.ts

# Step 2: Review generated preview
cat knowledge_data/parsed_chunks_preview.txt

# Step 3: (Optional) Edit chunks manually
# Edit: knowledge_data/parsed_chunks.json

# Step 4: Ingest validated chunks to Convex
npx tsx scripts/ingest-validated-chunks.ts
```

### RAG Architecture

```
┌──────────────────┐
│  User Question   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Text Embedding  │  OpenAI text-embedding-3-small (1536 dims)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Vector Search   │  Convex vectorSearch (cosine similarity)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Top K Chunks    │  Default: top 3, score threshold: 0.7
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  LLM Context     │  Injected into GPT-4o-mini prompt
└──────────────────┘
```

---

## 🚀 Cloud Deployment

### Production Deployment Options

| Platform | Setup Time | Cost/Month | Best For | Guide |
|----------|------------|------------|----------|-------|
| **Render.com** | 5 min | $7 | Beginners, Quick setup | [📘 Complete Guide](docs/RENDER_DEPLOYMENT.md) |
| **Fly.io** | 10 min | $15 | Best latency (Mumbai) | [📘 Guide](docs/DEPLOYMENT.md) |
| **AWS Lambda** | 30 min | $30+ | Enterprise, AWS users | [📘 Guide](docs/DEPLOYMENT.md) |
| **Railway** | 5 min | $20 | Simple, Auto-deploy | [📘 Guide](docs/DEPLOYMENT.md) |

### 🎯 Quick Deploy to Render.com (Recommended for Beginners)

**Easiest deployment in 3 steps:**

1. **Prepare your code:**
   ```bash
   npm run prepare:render
   ```

2. **Deploy on Render:**
   - Go to [render.com](https://render.com)
   - New + → Blueprint → Select repository
   - Click "Apply"

3. **Add API keys in Render Dashboard**

**Done!** Your agent is live 24/7 for $7/month.

📚 **Full Guides:**
- [Render.com Complete Guide](docs/RENDER_DEPLOYMENT.md) (Beginners)
- [Render Quick Start](docs/RENDER_QUICK_START.md) (3-min reference)
- [Deployment Checklist](docs/RENDER_CHECKLIST.md)
- [Platform Comparison](docs/PLATFORM_COMPARISON.md)

---

## 🚀 Local Development

### Docker

```bash
# Build image
docker build -t livekit-sarvam-agent:latest .

# Run container
docker run -d \
  --name voice-agent \
  --restart unless-stopped \
  -p 8080:8080 \
  --env-file .env \
  livekit-sarvam-agent:latest

# Check logs
docker logs -f voice-agent
```

### Docker Compose

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f voice-agent

# Stop all
docker-compose down
```

### PM2 (Production Process Manager)

```bash
# Build
npm run build

# Deploy Convex backend
npx convex deploy --prod

# Start with PM2
pm2 start dist/agent/index.js --name voice-agent
pm2 start dist/api/server.js --name api-server

# View logs
pm2 logs voice-agent

# Save configuration
pm2 save

# Setup auto-restart on boot
pm2 startup
```

### Health Checks

```bash
# Basic health check
curl http://localhost:8080/health
# Response: {"status":"healthy","timestamp":"2026-01-19T14:30:00.000Z"}
```

---

## 📊 Monitoring

### Key Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **STT Latency** | < 500ms | > 1000ms |
| **LLM Latency** | < 2000ms | > 5000ms |
| **TTS Latency** | < 800ms | > 2000ms |
| **E2E Latency** | < 3500ms | > 7000ms |
| **Error Rate** | < 1% | > 5% |

### Logging

```bash
# View logs (Docker)
docker logs -f voice-agent

# View logs (PM2)
pm2 logs voice-agent

# Filter by level
docker logs voice-agent 2>&1 | grep '"level":"ERROR"'
```

### Debug Mode

```bash
LOG_LEVEL=DEBUG npm run dev
```

---

## 📡 API Reference

### REST API Endpoints

**Base URL**: `http://localhost:8080/api/v1`

```bash
# Get all agents
GET /api/v1/agents

# Create call session
POST /api/v1/calls

# Search knowledge
POST /api/v1/knowledge/search

# Get analytics
GET /api/v1/analytics
```

---

## 🔍 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Agent not responding | Check `LIVEKIT_URL` and API keys |
| Poor transcription | Use `saarika:v2.5` model, check audio quality |
| TTS cutting sentences | Streaming disabled (`MIN_SENTENCE_LENGTH=9999`) ✅ |
| Slow response | Check network latency, reduce `LLM_TEMPERATURE` |
| Function calls failing | Verify `OPENAI_API_KEY` is set |
| VAD issues | Using Silero VAD (forced) ✅ |

### Debug Commands

```bash
# Check agent status
pm2 status voice-agent

# View recent errors
pm2 logs voice-agent --err --lines 50

# Monitor resource usage
pm2 monit

# Test health endpoint
curl http://localhost:8080/health
```

---

## ⚡ Performance

### Latency Benchmarks

| Operation | Target | Actual | Status |
|-----------|--------|--------|--------|
| STT (Sarvam) | < 500ms | ~350ms | ✅ |
| LLM (OpenAI) | < 2000ms | ~1200ms | ✅ |
| TTS (Sarvam) | < 800ms | ~650ms | ✅ |
| RAG Search | < 200ms | ~150ms | ✅ |
| **End-to-End** | **< 3500ms** | **~2500ms** | ✅ |

### Throughput

- **Concurrent Sessions**: Up to 50 per agent instance (2 CPU, 2GB RAM)
- **Horizontal Scaling**: Linear (tested up to 10 instances)

---

## 🔒 Security

### Best Practices

- ✅ **Never commit `.env` files** to version control
- ✅ **Rotate API keys regularly** (every 90 days)
- ✅ **Use HTTPS in production**
- ✅ **Implement input validation**
- ✅ **Enable audit logging**
- ✅ **Restrict CORS origins**

---

## 📖 Documentation

### Complete Documentation Index

📁 **[docs/README.md](docs/README.md)** - Browse all organized technical documentation

### Architecture & Design

- 📐 **[Analytics System](docs/architecture/analytics-system.md)**
- 🔍 **[Caching Architecture](docs/architecture/CACHING_ARCHITECTURE.md)**
- 🧩 **[Parser System](docs/architecture/parser-system.md)**

### Developer Guides

- 🛠️ **[API Reference](docs/guides/api-reference.md)**
- 🖥️ **[Local Models Integration](docs/guides/local-models.md)**
- 🧪 **[Testing Strategy](docs/guides/testing.md)**

### Reports & Analysis

- 📊 **[Call Optimization (2026-01-15)](docs/reports/call-optimization-2026-01-15.md)**
- ✅ **[Code Audit (2026-01-16)](docs/reports/code-audit-2026-01-16.md)**
- 🔍 **[RAG Performance (2026-01-15)](docs/reports/2026-01-15-rag-performance.md)**
- 🎤 **[TTS Streaming Analysis (2026-01-18)](docs/reports/2026-01-18-tts-streaming-analysis.md)**

---

## 🧪 Testing

```bash
# All tests
npm test

# With coverage
npm test -- --coverage

# End-to-end tests
npm run test:e2e
```

---

## 🆘 Support

### Get Help

- 📧 **Email**: support@example.com
- 💬 **Issues**: [GitHub Issues](../../issues)
- 📚 **Docs**: [Full Documentation](docs/README.md)

### Resources

- 🌐 **LiveKit Docs**: https://docs.livekit.io/agents
- 🤖 **Sarvam AI Docs**: https://docs.sarvam.ai
- 🗄️ **Convex Docs**: https://docs.convex.dev

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

<div align="center">

**🚀 Built with ❤️ using LiveKit, Sarvam AI, and Convex**

[⭐ Star us on GitHub](../../stargazers) • [🐛 Report Bug](../../issues) • [💡 Request Feature](../../issues)

*Last Updated: January 19, 2026*

</div>
