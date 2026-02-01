# Documentation Index

**LiveKit Sarvam Voice Agent - Technical Documentation**

Last Updated: January 18, 2026

---

## 📁 Documentation Structure

```
docs/
├── architecture/     # System design and architecture docs
├── guides/          # How-to guides and tutorials
├── planning/        # Planning docs and proposals
└── reports/         # Analysis reports and findings
```

---

## 🏗️ Architecture

Core system architecture and design documentation.

| Document | Description | Status |
|----------|-------------|--------|
| [Analytics System](architecture/analytics-system.md) | Complete analytics architecture with API endpoints and metrics | ✅ Production |

### Service-Level Documentation

Service-specific documentation lives with the service code:

| Service | Documentation | Description |
|---------|---------------|-------------|
| **Document Parser** | [README](../src/services/document-parser/README.md) | Practical implementation guide for document parsing |
| | [ARCHITECTURE](../src/services/document-parser/ARCHITECTURE.md) | Complete architectural design and rationale |
| **Chunking** | [README](../src/services/chunking/README.md) | Text chunking strategies and implementation |

---

## 📚 Guides

Practical guides for development and integration.

| Document | Description | Audience |
|----------|-------------|----------|
| [API Reference](guides/api-reference.md) | Complete REST API documentation with examples | Developers |
| [Local Models](guides/local-models.md) | Integrate local AI models (Ollama, Whisper, etc.) | Developers |
| [Testing Strategy](guides/testing.md) | Comprehensive testing approach and test plans | QA/Developers |

---

## 📊 Reports

Analysis reports, audits, and performance evaluations.

| Report | Date | Summary |
|--------|------|---------|
| [RAG Performance](reports/2026-01-15-rag-performance.md) | Jan 15, 2026 | Knowledge base retrieval evaluation |
| [TTS Streaming Analysis](reports/2026-01-18-tts-streaming-analysis.md) | Jan 18, 2026 | Text-to-speech streaming performance |

---

## 🎯 Planning

Future features, integrations, and optimization plans.

| Document | Description | Status |
|----------|-------------|--------|
| [Orthopedic Agent Design](planning/orthopedic-agent-design.md) | Specialized medical voice agent design | 📋 Design |
| [Prompt Caching](planning/prompt-caching.md) | Hybrid caching strategy for performance | ✅ Implemented |
| [Sub-1s Latency Optimization](planning/sub-1s-latency-optimization.md) | Ultra-low latency optimization strategies | 🔬 Research |

---

## 🚀 Quick Links

### For New Developers
1. Start with [API Reference](guides/api-reference.md) for API overview
2. Read [Analytics System](architecture/analytics-system.md) to understand monitoring
3. Check [Testing Strategy](guides/testing.md) for test approach

### For DevOps/Deployment
1. Review [TTS Streaming Analysis](reports/2026-01-18-tts-streaming-analysis.md) for streaming performance
2. Check [RAG Performance](reports/2026-01-15-rag-performance.md) for knowledge base metrics
3. See [Sub-1s Latency Optimization](planning/sub-1s-latency-optimization.md) for performance tuning

### For Feature Development
1. Check [Orthopedic Agent Design](planning/orthopedic-agent-design.md) for specialized agent patterns
2. Review [Local Models](guides/local-models.md) for extensibility
3. See [Document Parser](../src/services/document-parser/README.md) for knowledge base architecture
4. See [Chunking Service](../src/services/chunking/README.md) for text processing

---

## 📖 Related Documentation

- [Main README](../README.md) - Project overview and quick start
- [DOCUMENTATION.md](../DOCUMENTATION.md) - Complete user documentation (if exists)
- [Convex Schema](../convex/schema.ts) - Database schema reference
- [Plugin Factory](../src/plugins/factory.ts) - Provider configuration

---

## 🔄 Document Status Legend

| Icon | Status | Description |
|------|--------|-------------|
| ✅ | Production | Implemented and deployed |
| 📝 | In Progress | Currently being worked on |
| 📋 | Planning | Planned for future implementation |
| 🔄 | Research | Research and analysis phase |
| ⚠️ | Deprecated | Outdated, refer to newer docs |

---

## 📝 Contributing to Documentation

When adding new documentation:

1. **Choose the right directory**:
   - `architecture/` - System design, data flow, architecture decisions
   - `guides/` - How-to guides, tutorials, integration instructions
   - `planning/` - Future features, proposals, planning docs
   - `reports/` - Analysis, audits, performance reports (include date in filename)

2. **Naming convention**:
   - Use lowercase with hyphens: `my-document.md`
   - Reports should include date: `report-name-YYYY-MM-DD.md`
   - Be descriptive: `twilio-integration.md` not `integration.md`

3. **Update this index**: Add your document to the appropriate table above

4. **Include metadata**: Add date, status, and author at the top of documents

---

**Last Review**: January 18, 2026  
**Maintained by**: Development Team
