# Telephony Module

> **Status**: 🟡 In Development  
> **Last Updated**: January 15, 2026

## Overview

This module provides Twilio-LiveKit telephony integration for the Spinabot voice agent. It enables real phone calls (inbound and outbound) while preserving LiveKit WebRTC for development and testing.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TELEPHONY MODULE STRUCTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  src/telephony/                                                  │
│  ├── config.ts          # Twilio/SIP configuration             │
│  ├── types.ts           # TypeScript interfaces                │
│  ├── latency-tracker.ts # Per-component latency measurement    │
│  ├── sip-handler.ts     # SIP participant detection/handling   │
│  ├── inbound-handler.ts # Inbound call handling                │
│  ├── outbound-handler.ts# Outbound call initiation             │
│  ├── call-manager.ts    # Unified call lifecycle management    │
│  ├── dtmf-handler.ts    # DTMF tone detection (future)         │
│  └── index.ts           # Module exports                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Latency Tracking

Every component measures latency for production monitoring:

| Component | Target | Measurement Point |
|-----------|--------|-------------------|
| SIP Connect | < 500ms | Trunk → Room join |
| STT First Token | < 300ms | Audio → First word |
| LLM First Token | < 500ms | Query → First token |
| TTS First Audio | < 200ms | Text → First audio |
| **Total E2E** | **< 1500ms** | User speaks → Agent speaks |

## Usage

```typescript
import { 
  TelephonyConfig,
  SIPHandler,
  InboundCallHandler,
  OutboundCallHandler,
  LatencyTracker 
} from './telephony';

// Initialize latency tracker
const latencyTracker = new LatencyTracker('session-123');

// Detect SIP participant
const sipHandler = new SIPHandler();
const sipInfo = sipHandler.extractSIPInfo(participant);

// Handle inbound call
const inboundHandler = new InboundCallHandler(latencyTracker);
await inboundHandler.handleCall(participant, agentContext);
```

## Integration with Main Agent

The telephony module integrates with `src/agent/index.ts` through:

1. **Participant Detection**: Check if participant is SIP-based
2. **Context Enrichment**: Add phone number, call direction to session
3. **Greeting Selection**: Different greetings for phone vs web
4. **Latency Tracking**: Measure every step of the call flow

## Files Description

| File | Purpose |
|------|---------|
| `config.ts` | Twilio credentials, SIP trunk IDs, validation |
| `types.ts` | TypeScript interfaces for all telephony concepts |
| `latency-tracker.ts` | High-precision latency measurement with histograms |
| `sip-handler.ts` | Extract SIP metadata from LiveKit participants |
| `inbound-handler.ts` | Process incoming phone calls |
| `outbound-handler.ts` | Initiate outbound phone calls |
| `call-manager.ts` | Unified interface for call lifecycle |
| `index.ts` | Clean module exports |
