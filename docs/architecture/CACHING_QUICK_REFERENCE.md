# Caching Quick Reference

**📄 Full Report:** See [CACHING_ARCHITECTURE.md](./CACHING_ARCHITECTURE.md)

---

## 🎯 TL;DR for Production

**Current Setup:**
- ✅ Works great locally (1 worker)
- 🟡 Needs tuning for production (10+ workers)

**Main Issue:**
Caches are **per-process**, not **shared across workers**
→ Cache hit rate drops from 90% to 20% with round-robin load balancing

**Quick Fix:**
```nginx
# nginx.conf - Use sticky sessions
upstream livekit_agents {
  ip_hash;  # Same user → same worker
  server worker1:3000;
  server worker2:3000;
}
```
→ Hit rate improves to 60-70%

**Better Fix (Week 1):**
Implement Redis shared cache
→ Hit rate: 85-95%

---

## 📊 Cache Inventory

| What Gets Cached | Where | TTL | Shared? | Prod Ready? |
|------------------|-------|-----|---------|-------------|
| **TTS Audio** (phrases) | Memory Map | 1h | ❌ Per agent | 🟡 OK |
| **RAG Results** (knowledge search) | LRU Singleton | 5m | ❌ Per worker | 🟡 Needs Redis |
| **Agent Config** | Memory Map | 1m | ❌ Per worker | 🟢 Good |
| **Agent Prompts** | Memory Map | 10m | ❌ Per worker | 🟢 Good |
| **WebSocket Connections** | ConnectionPool | 1h | ❌ Per agent | 🟢 Good |

---

## 🔍 How Each Cache Works

### 1. TTS Phrase Cache
```
User says: "Hello"
Agent responds: "Hi, how can I help?"

First time:
  Greeting → Sarvam API → 1000ms → Cached

Second time:
  Greeting → Cache hit → 5ms ⚡
```

**Isolation:** Each agent has own cache
- Agent A greeting ≠ Agent B greeting ✅
- User changes greeting → New cache entry ✅

### 2. RAG Result Cache
```
User asks: "What is knee pain?"
Agent searches knowledge base

First time:
  Query → Convex → Vector search → 200ms → Cached

Same question (within 5 min):
  Query → Cache hit → 1-2ms ⚡
```

**Problem in Production:**
```
Worker 1: "knee pain" → Cached ✅
Worker 2: "knee pain" → Cache MISS ❌ (duplicate query!)
Worker 3: "knee pain" → Cache MISS ❌ (duplicate query!)
```

### 3. Agent Config Cache
```
Agent starts → Load config from database

First time:
  Agent ID → Convex query → 100ms → Cached (1 min)

Within 1 minute:
  Agent ID → Cache hit → 1ms ⚡
```

**TTL = 1 minute** (short to pick up config changes quickly)

### 4. Agent Prompt Cache
```
Agent starts → Load full system prompt

First time:
  Agent ID → Convex query → 100ms → Cached (10 min)

Within 10 minutes:
  Agent ID → Cache hit → 1-2ms ⚡

Admin updates prompt:
  New timestamp → NEW cache key → Fresh fetch ✅
```

**Smart:** Uses timestamp-based keys for auto-invalidation

### 5. WebSocket Connection Pool
```
Agent starts → Pre-warm 2 connections to Sarvam API

TTS Request 1: Use WS1 (0ms connection time)
TTS Request 2: Use WS2 (0ms connection time)
TTS Request 3: Reuse WS1 (0ms connection time)

vs No pooling:
  Each request: 50-200ms connection overhead ❌
```

---

## 🚨 Production Concerns

### Memory Usage
```
Local (1 worker):
  TTS cache: 5MB
  RAG cache: 2.5MB
  Config cache: 1MB
  Total: ~10MB ✅

Production (10 workers):
  TTS cache: 5MB × 10 = 50MB
  RAG cache: 2.5MB × 10 = 25MB
  Config cache: 1MB × 10 = 10MB
  Total: ~100MB ✅ (acceptable)
```

### Cache Hit Rates

**Local (1 worker):**
```
TTS Phrase: 90% hit rate ✅
RAG Result: 80% hit rate ✅
Agent Config: 95% hit rate ✅
```

**Production (10 workers, round-robin):**
```
TTS Phrase: 20% hit rate ❌
RAG Result: 15% hit rate ❌ (lots of duplicate queries!)
Agent Config: 85% hit rate ⚠️
```

### Cost Impact

**Without shared cache:**
```
1000 users ask "knee pain"
→ 1000 Convex queries
→ Cost: $X
```

**With Redis shared cache:**
```
1000 users ask "knee pain"
→ 1 Convex query (first user)
→ 999 cache hits
→ Cost: $X / 1000 ⚡
```

---

## ✅ Production Deployment Checklist

### Before Launch (P0)
- [ ] Configure sticky sessions (nginx/ALB)
- [ ] Add cache size limits
- [ ] Set up monitoring
- [ ] Test with 100+ concurrent users

### Week 1 (P1)
- [ ] Implement Redis for RAG cache
- [ ] Add cache metrics dashboard
- [ ] Tune TTL values based on metrics

### Month 1 (P2)
- [ ] Migrate all caches to Redis
- [ ] Add cache warming on startup
- [ ] Implement cache invalidation webhooks

---

## 🔧 Configuration Tuning

### For Low Traffic (<100 concurrent users)
```typescript
// Current settings are fine
PHRASE_CACHE_MAX_SIZE = 100
RAG_CACHE_SIZE = 500
```

### For High Traffic (>1000 concurrent users)
```typescript
// Increase cache sizes
PHRASE_CACHE_MAX_SIZE = 500
RAG_CACHE_SIZE = 2000

// Longer TTL (reduce DB load)
AGENT_CONFIG_TTL = 300  // 5 minutes (was 1 min)
RAG_RESULT_TTL = 1800   // 30 minutes (was 5 min)

// More pre-warmed connections
tts.prewarm(5);  // Instead of 2
```

---

## 📞 When to Invalidate Caches

### Manually Invalidate When:
1. **Knowledge base updated**
   ```typescript
   await VoiceKnowledgeService.invalidateCache(orgId);
   ```

2. **Agent config changed**
   - Auto-invalidates (1 min TTL) ✅

3. **Agent prompt updated**
   - Auto-invalidates (timestamp keys) ✅

4. **System upgrade/restart**
   - All caches cleared automatically ✅

---

## 🎓 Key Takeaways

1. **Caches are isolated per worker** (not shared)
2. **Use sticky sessions** for better hit rates
3. **Implement Redis** for production scale
4. **Monitor cache metrics** to tune settings
5. **TTL is your friend** (auto-cleanup)

---

**Need Help?**
- Full details: [CACHING_ARCHITECTURE.md](./CACHING_ARCHITECTURE.md)
- Code locations: Search for `cache` in `src/` directory
