-# Document Lifecycle - Complete Flow

**Date:** January 28, 2026  
**System:** Voice Agent Knowledge Base  
**Purpose:** Understanding document storage, connections, and deletion mechanisms

---

## 📊 Complete System Architecture

### 🗄️ Database Tables (4 Main + 2 Metadata)

```
┌─────────────────────────────────────────────────────────────────┐
│                    KNOWLEDGE BASE TABLES                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. ingestionSessions (Temporary - Preview Workflow)             │
│     - Holds chunks BEFORE user confirms                          │
│     - Auto-expires after 24 hours                                │
│     - Deleted after confirmation                                 │
│                                                                   │
│  2. documents (Permanent - Active Documents)                     │
│     - Metadata only (no content)                                 │
│     - Links to chunks and RAG entries                            │
│     - Deleted during soft delete                                 │
│                                                                   │
│  3. chunks (Permanent - Chunk Metadata)                          │
│     - Full text + metadata                                       │
│     - Dual storage with RAG                                      │
│     - Kept during soft delete (for recovery)                     │
│     - Deleted during purge (30 days later)                       │
│                                                                   │
│  4. deletedFiles (Soft Delete - Audit Trail)                     │
│     - Backup of deleted document metadata                        │
│     - 30-day retention for recovery                              │
│     - Permanently purged after 30 days                           │
│                                                                   │
│  5. agentKnowledgeMetadata (Analytics)                           │
│     - Fast stats per agent                                       │
│     - Updated on ingestion/deletion                              │
│                                                                   │
│  6. RAG Vector Store (@convex-dev/rag)                           │
│     - Vector embeddings for semantic search                      │
│     - Connected via ragEntryId                                   │
│     - Kept during soft delete                                    │
│     - Deleted during purge                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Document Upload & Storage Flow

### Phase 1: Upload & Preview (TEMPORARY STORAGE)

```
┌──────────────────────────────────────────────────────────────────┐
│ USER UPLOADS FILE                                                 │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ CREATE INGESTION SESSION                                          │
│ convex/documentIngestion.ts: createIngestionSession()            │
├──────────────────────────────────────────────────────────────────┤
│ INSERT INTO ingestionSessions:                                    │
│   - sessionId: UUID                                               │
│   - agentId: agent123                                            │
│   - organizationId: org456                                        │
│   - fileName: "menu.pdf"                                          │
│   - stage: "uploading"                                            │
│   - previewEnabled: true                                          │
│   - expiresAt: NOW + 24 hours                                     │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ PARSE DOCUMENT                                                    │
│ Stage: "parsing"                                                  │
├──────────────────────────────────────────────────────────────────┤
│ - Extract text from PDF/DOCX/etc                                 │
│ - Stateless operation (no DB writes)                             │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ CHUNK CONTENT                                                     │
│ Stage: "chunking"                                                 │
├──────────────────────────────────────────────────────────────────┤
│ - Uses intelligent multi-strategy chunking system                 │
│ - Strategies: FAQ, SECTION, ITEM, PARAGRAPH, SENTENCE, FIXED     │
│ - Auto-detects optimal strategy based on content patterns         │
│ - Add metadata (page numbers, quality scores)                    │
│ - Deterministic & stateless                                       │
│ - Chunks stored IN MEMORY (not DB yet)                           │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ STORE CHUNKS IN SESSION (PREVIEW WORKFLOW)                        │
│ convex/documentIngestion.ts: storeChunkMetadata()                │
│ Stage: "preview_ready"                                            │
├──────────────────────────────────────────────────────────────────┤
│ UPDATE ingestionSessions:                                         │
│   - stage: "preview_ready"                                        │
│   - chunkCount: 45                                                │
│   - previewMetadata: JSON with chunks array                       │
│   - previewedAt: NOW                                              │
│                                                                   │
│ ⚠️ NOTE: Chunks are NOT in documents/chunks tables yet!          │
│          They're only in ingestionSessions.previewMetadata        │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ USER PREVIEWS CHUNKS (FRONTEND)                                   │
│ Frontend: ChunkPreviewModal.tsx                                   │
├──────────────────────────────────────────────────────────────────┤
│ - Shows all chunks from session                                   │
│ - User can review before committing                               │
│ - 2 OPTIONS:                                                      │
│   1. ✅ Confirm → Proceed to Phase 2                              │
│   2. ❌ Cancel → Delete session, discard chunks                   │
└──────────────────────────────────────────────────────────────────┘
```

### Phase 2: Confirmation & Persistence (PERMANENT STORAGE)

```
┌──────────────────────────────────────────────────────────────────┐
│ USER CONFIRMS INGESTION                                           │
│ convex/documentIngestion.ts: confirmIngestion()                  │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ PERSIST TO DOCUMENTS TABLE                                        │
│ Stage: "persisting"                                               │
├──────────────────────────────────────────────────────────────────┤
│ INSERT INTO documents:                                            │
│   - documentId: session.sessionId (UUID)                          │
│   - agentId: agent123                                            │
│   - organizationId: org456                                        │
│   - fileName: "menu.pdf"                                          │
│   - fileType: "pdf"                                               │
│   - fileSize: 2048000                                             │
│   - status: "processing"                                          │
│   - chunkCount: 45                                                │
│   - ragEntryIds: [] (filled later)                               │
│   - uploadedAt: NOW                                               │
│                                                                   │
│ ✅ Document is now PERMANENT (won't expire)                       │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ PERSIST TO CHUNKS TABLE                                           │
│ convex/documentIngestion.ts: storeChunkMetadata()                │
├──────────────────────────────────────────────────────────────────┤
│ FOR EACH chunk in session.previewMetadata:                        │
│   INSERT INTO chunks:                                             │
│     - chunkId: UUID                                               │
│     - documentId: doc.documentId                                  │
│     - agentId: agent123                                           │
│     - text: "Burger - $12.99..."                                  │
│     - tokenCount: 150                                             │
│     - chunkIndex: 0-44                                            │
│     - pageNumber: 1                                               │
│     - qualityScore: 0.85                                          │
│     - ragEntryId: (filled after embedding)                        │
│     - createdAt: NOW                                              │
│                                                                   │
│ ✅ All 45 chunks now in chunks table                              │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ CREATE VECTOR EMBEDDINGS                                          │
│ Stage: "embedding"                                                │
│ convex/rag.ts: ingestDocument()                                   │
├──────────────────────────────────────────────────────────────────┤
│ FOR EACH chunk:                                                   │
│   1. Generate embedding (OpenAI/Cohere)                           │
│   2. INSERT INTO RAG vector store:                                │
│      - namespace: agent123                                        │
│      - key: chunk.chunkId                                         │
│      - embedding: [0.123, -0.456, ...]                            │
│   3. Get ragEntryId from RAG                                      │
│   4. UPDATE chunks SET ragEntryId = ragEntryId                    │
│   5. Collect all ragEntryIds                                      │
│                                                                   │
│ ✅ All chunks embedded in vector store                            │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ UPDATE DOCUMENT WITH RAG IDS                                      │
├──────────────────────────────────────────────────────────────────┤
│ UPDATE documents:                                                 │
│   - ragEntryIds: [id1, id2, ..., id45]                           │
│   - status: "completed"                                           │
│   - processedAt: NOW                                              │
│                                                                   │
│ ✅ Document fully ingested and searchable                         │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ UPDATE AGENT METADATA                                             │
│ convex/ragManagement.ts: updateAgentMetadata()                   │
├──────────────────────────────────────────────────────────────────┤
│ UPDATE agentKnowledgeMetadata:                                    │
│   - totalChunks: +45                                              │
│   - documentCount: +1                                             │
│   - totalSizeBytes: +2048000                                      │
│   - lastIngestedAt: NOW                                           │
│                                                                   │
│ ✅ Agent stats updated for fast analytics                         │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ DELETE INGESTION SESSION                                          │
│ Stage: "completed"                                                │
├──────────────────────────────────────────────────────────────────┤
│ DELETE FROM ingestionSessions WHERE sessionId = session123        │
│                                                                   │
│ ✅ Preview data cleared (no longer needed)                        │
│ ✅ Document is now in permanent storage                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🗑️ Document Deletion - 3 Ways

### Method 1: SOFT DELETE (Recoverable for 30 Days) ⭐ RECOMMENDED

```
┌──────────────────────────────────────────────────────────────────┐
│ USER SOFT DELETES DOCUMENT                                        │
│ convex/ragManagement.ts: softDeleteDocument()                    │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ BACKUP TO DELETED FILES TABLE                                     │
├──────────────────────────────────────────────────────────────────┤
│ 1. Find document in documents table                               │
│ 2. INSERT INTO deletedFiles:                                      │
│      - documentId: doc123                                         │
│      - ALL document fields (backup)                               │
│      - deletedBy: "user@example.com"                              │
│      - deletionReason: "Outdated menu"                            │
│      - deletedAt: NOW                                             │
│      - purgeAt: NOW + 30 days                                     │
│      - isPurged: false                                            │
│      - ragEntryIds: [id1, id2, ..., id45]                        │
│                                                                   │
│ ✅ Document metadata backed up for recovery                       │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ REMOVE FROM DOCUMENTS TABLE                                       │
├──────────────────────────────────────────────────────────────────┤
│ DELETE FROM documents WHERE documentId = doc123                   │
│                                                                   │
│ ❗ Document no longer visible in active documents                 │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ KEEP CHUNKS & VECTORS (For Recovery)                              │
├──────────────────────────────────────────────────────────────────┤
│ ⚠️ IMPORTANT: Chunks and vectors NOT deleted yet!                 │
│                                                                   │
│ chunks table:      ✅ KEPT (45 chunks remain)                     │
│ RAG vector store:  ✅ KEPT (45 embeddings remain)                 │
│                                                                   │
│ WHY?                                                              │
│ - Allow recovery within 30 days                                   │
│ - User might change their mind                                    │
│ - Compliance/audit requirements                                   │
│                                                                   │
│ ⏰ Will be purged automatically after 30 days                     │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ UPDATE AGENT METADATA (Soft Update)                               │
├──────────────────────────────────────────────────────────────────┤
│ UPDATE agentKnowledgeMetadata:                                    │
│   - documentCount: -1                                             │
│   - Note: totalChunks NOT reduced (chunks still exist)            │
│                                                                   │
│ ✅ Document count reflects active documents only                  │
└──────────────────────────────────────────────────────────────────┘
```

### Method 2: RECOVERY (Within 30 Days)

```
┌──────────────────────────────────────────────────────────────────┐
│ USER RECOVERS DELETED DOCUMENT                                    │
│ convex/ragManagement.ts: recoverDeletedDocument()                │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ CHECK PURGE STATUS                                                │
├──────────────────────────────────────────────────────────────────┤
│ 1. Find in deletedFiles where isPurged = false                    │
│ 2. Verify purgeAt > NOW                                           │
│                                                                   │
│ ❌ If purged or expired: CANNOT RECOVER                           │
│ ✅ If within 30 days: PROCEED                                     │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ RESTORE TO DOCUMENTS TABLE                                        │
├──────────────────────────────────────────────────────────────────┤
│ INSERT INTO documents:                                            │
│   - Copy all fields from deletedFiles record                      │
│   - status: "completed"                                           │
│   - ragEntryIds: [id1, id2, ..., id45]                           │
│                                                                   │
│ ✅ Document back in active documents                              │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ DELETE FROM DELETED FILES                                         │
├──────────────────────────────────────────────────────────────────┤
│ DELETE FROM deletedFiles WHERE documentId = doc123                │
│                                                                   │
│ ✅ No longer in deleted files                                     │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ CHUNKS & VECTORS ALREADY EXIST                                    │
├──────────────────────────────────────────────────────────────────┤
│ chunks table:      ✅ All 45 chunks still there                   │
│ RAG vector store:  ✅ All 45 embeddings still there               │
│                                                                   │
│ ✅ Document immediately searchable again!                         │
│ ✅ No re-embedding needed (fast recovery)                         │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ UPDATE AGENT METADATA                                             │
├──────────────────────────────────────────────────────────────────┤
│ UPDATE agentKnowledgeMetadata:                                    │
│   - documentCount: +1                                             │
│                                                                   │
│ ✅ Agent stats restored                                           │
└──────────────────────────────────────────────────────────────────┘
```

### Method 3: PERMANENT PURGE (After 30 Days - Automatic)

```
┌──────────────────────────────────────────────────────────────────┐
│ CRON JOB RUNS HOURLY AT :30 MINUTES                               │
│ convex/crons.ts: "purge-expired-deletions"                       │
│ Schedule: Every hour at 30 minutes past (e.g., 1:30, 2:30, 3:30) │
│ convex/ragManagement.ts: purgeExpiredDeletions()                 │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ FIND EXPIRED DELETIONS                                            │
├──────────────────────────────────────────────────────────────────┤
│ SELECT * FROM deletedFiles                                        │
│ WHERE purgeAt < NOW                                               │
│   AND isPurged = false                                            │
│ LIMIT 50                                                          │
│                                                                   │
│ (Process 50 at a time to avoid timeouts)                          │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ DELETE CHUNKS FROM DATABASE                                       │
├──────────────────────────────────────────────────────────────────┤
│ FOR EACH expired document:                                        │
│   DELETE FROM chunks                                              │
│   WHERE documentId = doc123                                       │
│                                                                   │
│ ❌ All 45 chunks PERMANENTLY DELETED                              │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ DELETE VECTORS FROM RAG                                           │
│ convex/ragManagement.ts: deleteRagEntriesAsync()                 │
├──────────────────────────────────────────────────────────────────┤
│ FOR EACH ragEntryId in deletion.ragEntryIds:                      │
│   rag.delete({ entryId: ragEntryId })                            │
│                                                                   │
│ ❌ All 45 embeddings PERMANENTLY DELETED                          │
│ ❌ Document NO LONGER SEARCHABLE                                  │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ MARK AS PURGED                                                    │
├──────────────────────────────────────────────────────────────────┤
│ UPDATE deletedFiles:                                              │
│   - isPurged: true                                                │
│   - purgedAt: NOW                                                 │
│                                                                   │
│ ✅ Keep audit trail (for compliance)                              │
│ ✅ But data is gone (can't recover)                               │
└────────────────────┬─────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────────────┐
│ UPDATE AGENT METADATA                                             │
├──────────────────────────────────────────────────────────────────┤
│ UPDATE agentKnowledgeMetadata:                                    │
│   - totalChunks: -45                                              │
│   - totalSizeBytes: -2048000                                      │
│                                                                   │
│ ✅ Agent stats reflect actual chunk count                         │
└──────────────────────────────────────────────────────────────────┘
```

### Method 4: HARD DELETE (Legacy - Not Recommended)

```
┌──────────────────────────────────────────────────────────────────┐
│ HARD DELETE (IMMEDIATE, NO RECOVERY)                              │
│ convex/documentIngestion.ts: deleteDocumentCascade()             │
├──────────────────────────────────────────────────────────────────┤
│ ⚠️ NOT RECOMMENDED - Use soft delete instead!                     │
│                                                                   │
│ 1. DELETE FROM documents                                          │
│ 2. DELETE FROM chunks (all 45)                                    │
│ 3. DELETE FROM RAG vector store (all 45)                          │
│ 4. UPDATE agentKnowledgeMetadata                                  │
│                                                                   │
│ ❌ Immediate deletion                                             │
│ ❌ NO recovery possible                                           │
│ ❌ NO audit trail                                                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🔗 Entity Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                     RELATIONSHIP DIAGRAM                          │
└─────────────────────────────────────────────────────────────────┘

┌────────────────────┐
│    Organization    │
│   (org456)         │
└────────┬───────────┘
         │ has many
         ▼
┌────────────────────┐
│      Agent         │
│   (agent123)       │
└────────┬───────────┘
         │ has many
         ▼
┌────────────────────────────────────────┐
│         Document                        │◄─── Backed up in
│   (doc123 - menu.pdf)                  │     deletedFiles
│   - fileName: "menu.pdf"                │     (if soft deleted)
│   - status: "completed"                 │
│   - chunkCount: 45                      │
│   - ragEntryIds: [id1...id45]          │
└──────────┬─────────────────────────────┘
           │ has many (1:N)
           ▼
┌──────────────────────────────────────────┐
│           Chunk #1                        │
│   (chunk-uuid-1)                          │
│   - text: "Burger - $12.99..."           │
│   - chunkIndex: 0                         │
│   - documentId: doc123                    │
│   - ragEntryId: ragId1                    │◄── Links to
│   - pageNumber: 1                         │    RAG vector
└───────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────┐
│           Chunk #2                        │
│   (chunk-uuid-2)                          │
│   - text: "Pizza - $15.99..."            │
│   - chunkIndex: 1                         │
│   - ragEntryId: ragId2                    │◄── Links to
└───────────────────────────────────────────┘    RAG vector
           │
           │ ... (43 more chunks)
           ▼
┌──────────────────────────────────────────┐
│           Chunk #45                       │
│   (chunk-uuid-45)                         │
│   - text: "Desserts..."                  │
│   - chunkIndex: 44                        │
│   - ragEntryId: ragId45                   │◄── Links to
└───────────────────────────────────────────┘    RAG vector


┌──────────────────────────────────────────┐
│      RAG Vector Store                     │
│   (Separate table - @convex-dev/rag)     │
├──────────────────────────────────────────┤
│  Entry #1:                                │
│    - entryId: ragId1                      │
│    - namespace: agent123                  │
│    - key: chunk-uuid-1                    │
│    - embedding: [0.123, -0.456, ...]     │
│    - metadata: {...}                      │
│                                           │
│  Entry #2:                                │
│    - entryId: ragId2                      │
│    - namespace: agent123                  │
│    - embedding: [0.789, 0.234, ...]      │
│                                           │
│  ... (43 more entries)                    │
│                                           │
│  Entry #45:                               │
│    - entryId: ragId45                     │
│    - namespace: agent123                  │
│    - embedding: [-0.111, 0.888, ...]     │
└──────────────────────────────────────────┘
```

---

## ✅ What Gets Deleted When?

### Soft Delete (Day 0):
```
✅ Deleted:
   - documents table entry

❌ NOT Deleted (kept for recovery):
   - 45 chunks in chunks table
   - 45 vectors in RAG store
   - deletedFiles record (backup)

✅ Created:
   - deletedFiles entry with 30-day purgeAt
```

### Recovery (Within 30 days):
```
✅ Restored:
   - documents table entry

❌ Deleted:
   - deletedFiles entry

✅ Already exists (no action needed):
   - 45 chunks in chunks table
   - 45 vectors in RAG store
```

### Automatic Purge (After 30 days):
```
❌ PERMANENTLY Deleted:
   - 45 chunks from chunks table
   - 45 vectors from RAG store

✅ Updated:
   - deletedFiles.isPurged = true
   - deletedFiles.purgedAt = NOW

⚠️ CANNOT RECOVER after this point!
```

---

## 🎯 Key Takeaways

1. **Dual Storage:** 
   - chunks table = Full text + metadata
   - RAG vector store = Embeddings for search
   - Both must be kept in sync

2. **Soft Delete Safety:**
   - Document removed from active list
   - Chunks & vectors KEPT for 30 days
   - Can recover instantly (no re-embedding)

3. **Ingestion Session:**
   - Temporary preview workflow (24-hour expiry)
   - Deleted after confirmation
   - Cleanup cron runs daily at 2:00 AM UTC
   - Chunks moved to permanent storage

4. **Cascading Relationships:**
   ```
   Document
     ├── Has many Chunks (1:N)
     └── Each Chunk
           └── Has one RAG entry (1:1)
   ```

5. **Deletion is Multi-Step:**
   - Step 1: Soft delete → Move to deletedFiles
   - Step 2: Wait 30 days → Keep data for recovery
   - Step 3: Purge → Delete chunks + vectors forever

---

## 🚨 Important Notes

1. **Always use soft delete** unless you have a specific reason for hard delete
2. **Chunks and vectors stay together** - if one exists, both should exist
3. **Recovery is instant** because data never left the system
4. **Purge is irreversible** - happens automatically after 30 days (cron runs hourly at :30)
5. **Ingestion sessions expire** in 24 hours if not confirmed (cleanup cron runs daily at 2 AM UTC)
6. **Intelligent chunking** - Uses strategy detection (FAQ, Section, Item, Paragraph, Sentence, Fixed) based on content patterns

---

**Questions? Check these files:**
- `convex/schema.ts` - Table definitions
- `convex/documentIngestion.ts` - Upload & persistence (includes cleanupExpiredSessions cron)
- `convex/ragManagement.ts` - Soft delete & recovery (includes purgeExpiredDeletions cron)
- `convex/crons.ts` - Cron job schedules (cleanup-expired-sessions: daily 2AM, purge-expired-deletions: hourly :30)
- `src/services/chunking/` - Intelligent multi-strategy chunking system
- `src/services/document-parser/` - Document parsing (PDF/DOCX/TXT support)
