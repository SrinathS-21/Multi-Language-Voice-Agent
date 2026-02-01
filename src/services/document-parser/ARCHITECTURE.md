# Document Parser Architecture Plan

> **Voice Agent Knowledge Base - Intelligent Document Processing Pipeline**

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Document Structure Taxonomy](#document-structure-taxonomy)
3. [Parser Selection Matrix](#parser-selection-matrix)
4. [Architecture Overview](#architecture-overview)
5. [Flow Diagrams](#flow-diagrams)
6. [Implementation Details](#implementation-details)
7. [File Modifications](#file-modifications)
8. [Configuration Options](#configuration-options)
9. [Retry Strategy](#retry-strategy)
10. [Retrieval Enhancements](#retrieval-enhancements)

---

## Executive Summary

### Problem Statement

The current implementation flattens structured document output, losing valuable hierarchy and context:

```python
# Current problematic code in document_parser_service.py (lines 102-107)
# Combines all document content into single string
content_parts = []
for doc in documents:
    content_parts.append(doc.text)
result["content"] = "\n\n".join(content_parts)  # ❌ Loses structure
```

### Solution

Implement a **4-layer intelligent parsing pipeline** that:
- Preserves document structure and hierarchy
- Auto-routes to optimal chunking strategy based on content analysis
- Uses retry logic with exponential backoff (no fallback to maintain quality)
- **Pre-embeds context at ingestion time** for zero-latency retrieval

> ⚠️ **CRITICAL DISCOVERY:** Convex RAG (`@convex-dev/rag`) does **NOT** support custom metadata fields!
> Context must be embedded directly INTO the chunk text using pipe-separated format.
> Fortunately, `voice_knowledge_service._parse_enriched_text()` already parses this format.

### Supported File Types

| Format | Extension | Handler |
|--------|-----------|---------|
| PDF | `.pdf` | LlamaParse API |
| Word | `.docx` | LlamaParse API |
| PowerPoint | `.pptx` | LlamaParse API |
| Images | `.jpg`, `.jpeg`, `.png` | LlamaParse API (OCR) |
| Text | `.txt` | Direct processing |
| Markdown | `.md` | MarkdownElementNodeParser |
| HTML | `.html` | HTMLNodeParser |
| JSON | `.json` | JSONNodeParser |

---

## Document Structure Taxonomy

### 7 Major Categories (96+ Structure Types)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DOCUMENT STRUCTURE TAXONOMY                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │   HIERARCHICAL  │  │     TABULAR     │  │   SEQUENTIAL    │     │
│  │   (15 types)    │  │   (12 types)    │  │   (14 types)    │     │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤     │
│  │ • Nested Heads  │  │ • Data Tables   │  │ • Numbered List │     │
│  │ • TOC Trees     │  │ • Pivot Tables  │  │ • Step-by-Step  │     │
│  │ • Org Charts    │  │ • Matrices      │  │ • Timelines     │     │
│  │ • Menu Sections │  │ • Spreadsheets  │  │ • Procedures    │     │
│  │ • Book Chapters │  │ • Comparison    │  │ • Recipes       │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │    RELATIONAL   │  │  FORM-BASED     │  │    COMPOSITE    │     │
│  │   (11 types)    │  │   (16 types)    │  │   (18 types)    │     │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤     │
│  │ • Entity Links  │  │ • Key-Value     │  │ • Mixed Media   │     │
│  │ • References    │  │ • Forms/Fields  │  │ • Annotated     │     │
│  │ • Cross-refs    │  │ • Q&A Pairs     │  │ • Multi-column  │     │
│  │ • Citations     │  │ • Invoices      │  │ • Dashboards    │     │
│  │ • Hyperlinks    │  │ • Receipts      │  │ • Reports       │     │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    NARRATIVE (10 types)                      │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ • Prose Paragraphs  • Articles  • Essays  • Stories         │   │
│  │ • Descriptions      • Reviews   • Blogs   • Transcripts     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Category Definitions

| Category | Description | Examples | Primary Parser |
|----------|-------------|----------|----------------|
| **Hierarchical** | Multi-level nested structures | Menus, TOC, Org charts | `HierarchicalNodeParser` |
| **Tabular** | Grid-based data layouts | Tables, matrices, spreadsheets | `LlamaParseJsonNodeParser` |
| **Sequential** | Ordered progression | Steps, timelines, procedures | `HierarchicalNodeParser` |
| **Relational** | Cross-referenced content | Citations, links, entity relations | `HierarchicalNodeParser` |
| **Form-Based** | Key-value pair structures | Forms, invoices, Q&A | `LlamaParseJsonNodeParser` |
| **Composite** | Mixed structure types | Reports, dashboards, presentations | Hybrid approach |
| **Narrative** | Continuous prose | Articles, descriptions, stories | `SemanticSplitterNodeParser` |

---

## Parser Selection Matrix

### LlamaIndex Node Parsers

| Parser | Best For | Preserves | Use When |
|--------|----------|-----------|----------|
| `LlamaParseJsonNodeParser` | Structured output from LlamaParse | Tables, forms, hierarchies | LlamaParse returns JSON |
| `HierarchicalNodeParser` | Multi-level documents | Parent-child relationships | Menus, manuals, reports |
| `SemanticSplitterNodeParser` | Narrative text | Semantic coherence | Articles, descriptions |
| `MarkdownElementNodeParser` | Markdown files | Headers, lists, code blocks | `.md` files |
| `HTMLNodeParser` | Web content | DOM structure | `.html` files |
| `JSONNodeParser` | JSON data | Object hierarchy | `.json` files |
| `UnstructuredElementNodeParser` | Fallback parsing | Basic structure | API failures |
| `SentenceSplitter` | Simple text | Sentence boundaries | Plain text, fallback |

### Parser-to-Category Mapping

```
┌────────────────────────┬────────────────────────────────────────────┐
│   Document Category    │            Recommended Parser              │
├────────────────────────┼────────────────────────────────────────────┤
│ HIERARCHICAL           │ HierarchicalNodeParser (3 levels)          │
│   └─ Menus             │   └─ chunk_sizes=[2048, 512, 128]          │
│   └─ Manuals           │   └─ preserves section context             │
│   └─ Org Charts        │                                            │
├────────────────────────┼────────────────────────────────────────────┤
│ TABULAR                │ LlamaParseJsonNodeParser                   │
│   └─ Tables            │   └─ preserves row/column structure        │
│   └─ Spreadsheets      │   └─ maintains cell relationships          │
│   └─ Matrices          │                                            │
├────────────────────────┼────────────────────────────────────────────┤
│ SEQUENTIAL             │ HierarchicalNodeParser                     │
│   └─ Procedures        │   └─ maintains step ordering               │
│   └─ Timelines         │   └─ preserves sequence context            │
│   └─ Instructions      │                                            │
├────────────────────────┼────────────────────────────────────────────┤
│ RELATIONAL             │ HierarchicalNodeParser + metadata          │
│   └─ Cross-references  │   └─ link preservation in metadata         │
│   └─ Citations         │   └─ reference tracking                    │
├────────────────────────┼────────────────────────────────────────────┤
│ FORM-BASED             │ LlamaParseJsonNodeParser                   │
│   └─ Invoices          │   └─ key-value pair preservation           │
│   └─ Forms             │   └─ field structure intact                │
│   └─ Q&A               │                                            │
├────────────────────────┼────────────────────────────────────────────┤
│ COMPOSITE              │ HierarchicalNodeParser → SemanticSplitter  │
│   └─ Reports           │   └─ two-pass processing                   │
│   └─ Presentations     │   └─ structure first, then semantics       │
├────────────────────────┼────────────────────────────────────────────┤
│ NARRATIVE              │ SemanticSplitterNodeParser                 │
│   └─ Articles          │   └─ embed_model for semantic boundaries   │
│   └─ Descriptions      │   └─ buffer_size=1 for topic coherence     │
│   └─ Stories           │                                            │
└────────────────────────┴────────────────────────────────────────────┘
```

---

## Architecture Overview

### 4-Layer Pipeline Architecture

The pipeline processes documents through four distinct layers, each with a specific responsibility:

#### Layer 1: Document Parsing (JSON Mode)
**Responsibility:** Extract structured content from raw files

```
Raw PDF/DOCX → LlamaParse JSON Mode → Structured Elements
```

**What Happens:**
1. File is uploaded (PDF, DOCX, PPTX, TXT, images, etc.)
2. LlamaParse extracts content in **JSON mode** (not markdown)
3. Structured elements are identified with types:
   - **Headings** (H1-H6 with hierarchy levels)
   - **Paragraphs** (body text content)
   - **Tables** (rows & columns preserved)
   - **Lists** (bullet points / numbered)
   - **Images** (with OCR text extraction)

**Output Format:**
```typescript
{
  type: 'heading' | 'paragraph' | 'table' | 'list',
  level: 1-6,                              // for headings
  text: "extracted content",
  page: 3,
  sectionPath: ["Chapter 1", "Section 1.1"],
  parentHeading: "Section 1.1"
}
```

**Key Features:**
- ✅ Retry logic (3 attempts with exponential backoff)
- ✅ Hierarchy tracking (section path preserved)
- ✅ Fallback to text-based parsing if LlamaParse unavailable

#### Layer 2: Content Analysis (ContentType Classification)
**Responsibility:** Determine document structure type

```
Structured Elements → Classification Rules → ContentType
```

**Classification Logic:**

| Content Type | Criteria | Best For | Example Docs |
|--------------|----------|----------|--------------|
| **STRUCTURED** | >30% tables OR >5 heading levels | Item-based chunking | Restaurant menus, product catalogs, price lists |
| **NARRATIVE** | >70% paragraphs | Paragraph chunking | Research papers, articles, blog posts |
| **MIXED** | Neither extreme | Section-based chunking | Technical manuals, reports with tables |

**Example Classification:**
```
📊 CONTENT TYPE ANALYSIS: NARRATIVE
   Total Elements: 0 (fallback to raw text)
   Tables: 0%
   Paragraphs: >70%
   Classification: NARRATIVE
   → Strategy: PARAGRAPH chunking
```

**Code Logic:**
```typescript
const tablePercentage = (tableCount / totalElements) * 100;
const paragraphPercentage = (paragraphCount / totalElements) * 100;

if (tablePercentage > 30 || headingLevels.size > 5) {
    return ContentType.STRUCTURED;  // Use ITEM strategy
} else if (paragraphPercentage > 70) {
    return ContentType.NARRATIVE;   // Use PARAGRAPH strategy
} else {
    return ContentType.MIXED;       // Use SECTION strategy
}
```

#### Layer 3: Strategy Selection (Parser Routing)
**Responsibility:** Choose optimal chunking approach

```
ContentType → Strategy Selection → ChunkingStrategy
```

**Available Strategies:**

| Strategy | When Used | Best For | Chunk Size |
|----------|-----------|----------|------------|
| **PARAGRAPH** | NARRATIVE content | Articles, blogs, documentation | 400-1000 chars |
| **ITEM** | STRUCTURED content | Product catalogs, menu items | One item per chunk |
| **FAQ** | Question-Answer pairs | FAQ documents, Q&A pages | One Q&A per chunk |
| **SECTION** | MIXED content | Books, reports with chapters | One section per chunk |
| **SENTENCE** | Dense content | Technical specifications | Sentence-based |
| **FIXED** | Fallback | Any content type | Fixed size (configurable) |

**Automatic Selection:**
```typescript
switch (contentType) {
    case ContentType.STRUCTURED:
        return ChunkingStrategy.ITEM;      // One menu item per chunk
    case ContentType.NARRATIVE:
        return ChunkingStrategy.PARAGRAPH;  // Standard paragraphs
    case ContentType.MIXED:
        return ChunkingStrategy.SECTION;    // Section-based
}
```

**Example Output:**
```
🎯 CHUNKING STRATEGY: PARAGRAPH
   Reason: Best suited for narrative content
   Config: chunkSize=1000, overlap=200
```

#### Layer 4: Context Embedding (Chunk Enrichment)
**Responsibility:** Add hierarchical context to each chunk

```
Chunks → Context Embedding → Enriched Chunks with Metadata
```

**What Gets Embedded:**
1. **Section Hierarchy**: `"Section: Chapter 1 > Section 1.1"`
2. **Parent Context**: `"Context: This section covers..."`
3. **Structured Fields**: `"Name: Butter Chicken | Price: $12.99"`
4. **Metadata**: Filename, page number, element type

**Format (Pipe-Separated):**
```
Section: Beverages > Cold Drinks | Name: Mango Lassi | Price: $4.99 | Description: A sweet mango yogurt drink flavored with cardamom.
```

**Why Pipe Format?**
- ✅ Convex RAG doesn't support custom metadata fields
- ✅ Context must be embedded **in the text itself**
- ✅ Allows semantic search on context + content
- ✅ Easier parsing during retrieval (existing `_parse_enriched_text()` handles it)

**Code Implementation:**
```typescript
export function formatChunkWithContext(
    chunkText: string,
    sectionHierarchy: string[],  // ["Beverages", "Cold Drinks"]
    parentSummary: string = ''
): string {
    const sectionPath = sectionHierarchy.join(' > ');
    const contextPrefix = `Section: ${sectionPath} | Context: ${parentSummary}`;
    return `${contextPrefix} | ${chunkText}`;
}
```

### Complete Pipeline Visualization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DOCUMENT INGESTION PIPELINE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    LAYER 1: DOCUMENT PARSING                         │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │   Input File (.pdf, .docx, .pptx, .jpg, .png, .txt)         │    │    │
│  │  │                          │                                   │    │    │
│  │  │                          ▼                                   │    │    │
│  │  │              ┌─────────────────────┐                         │    │    │
│  │  │              │   LlamaParse API    │ ◄── result_type='json'  │    │    │
│  │  │              │   (Primary Parser)  │                         │    │    │
│  │  │              └─────────┬───────────┘                         │    │    │
│  │  │                        │                                     │    │    │
│  │  │              ┌─────────┴───────────┐                         │    │    │
│  │  │              │   Success?          │                         │    │    │
│  │  │              └─────────┬───────────┘                         │    │    │
│  │  │                   Yes │     │ No                             │    │    │
│  │  │                       │     │                                │    │    │
│  │  │                       ▼     ▼                                │    │    │
│  │  │   Structured JSON    │   ┌────────────────────┐             │    │    │
│  │  │   with element_types │   │  Retry with        │             │    │    │
│  │  │                      │   │  Exponential       │             │    │    │
│  │  │                      │   │  Backoff (3x max)  │             │    │    │
│  │  │                      │   └────────────────────┘             │    │    │
│  │  │                      │              │                        │    │    │
│  │  │                      └──────┬───────┘                        │    │    │
│  │  │                             ▼                                │    │    │
│  │  │                    Parsed Document                           │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    LAYER 2: CONTENT ANALYSIS                         │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │   Analyze element_types from parsed output:                  │    │    │
│  │  │                                                              │    │    │
│  │  │   {                                                          │    │    │
│  │  │     "elements": [                                            │    │    │
│  │  │       {"type": "heading", "level": 1, ...},                  │    │    │
│  │  │       {"type": "table", "rows": [...], ...},                 │    │    │
│  │  │       {"type": "paragraph", "text": "...", ...}              │    │    │
│  │  │     ]                                                        │    │    │
│  │  │   }                                                          │    │    │
│  │  │                          │                                   │    │    │
│  │  │                          ▼                                   │    │    │
│  │  │              ┌─────────────────────┐                         │    │    │
│  │  │              │  Content Analyzer   │                         │    │    │
│  │  │              └─────────┬───────────┘                         │    │    │
│  │  │                        │                                     │    │    │
│  │  │    ┌───────────────────┼───────────────────┐                 │    │    │
│  │  │    │                   │                   │                 │    │    │
│  │  │    ▼                   ▼                   ▼                 │    │    │
│  │  │ STRUCTURED          MIXED            NARRATIVE               │    │    │
│  │  │ (>30% tables OR    (neither         (>70% paragraphs)        │    │    │
│  │  │  >5 heading        extreme)                                  │    │    │
│  │  │  levels)                                                     │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    LAYER 3: PARSER SELECTION                         │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │   Content Type Router:                                       │    │    │
│  │  │                                                              │    │    │
│  │  │   ┌──────────────┬──────────────┬──────────────┐            │    │    │
│  │  │   │  STRUCTURED  │    MIXED     │  NARRATIVE   │            │    │    │
│  │  │   ├──────────────┼──────────────┼──────────────┤            │    │    │
│  │  │   │              │              │              │            │    │    │
│  │  │   │ Hierarchical │ Hierarchical │   Semantic   │            │    │    │
│  │  │   │ NodeParser   │ NodeParser   │   Splitter   │            │    │    │
│  │  │   │              │     ↓        │              │            │    │    │
│  │  │   │ chunk_sizes: │   Semantic   │ buffer_size: │            │    │    │
│  │  │   │ [2048,512,   │   Splitter   │     1        │            │    │    │
│  │  │   │  128]        │   (2nd pass) │              │            │    │    │
│  │  │   │              │              │              │            │    │    │
│  │  │   └──────────────┴──────────────┴──────────────┘            │    │    │
│  │  │                        │                                     │    │    │
│  │  │                        ▼                                     │    │    │
│  │  │                  Chunked Nodes                               │    │    │
│  │  │                  with metadata                               │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │               LAYER 4: CONTEXTUAL ENRICHMENT (Optional)              │    │
│  │  ┌─────────────────────────────────────────────────────────────┐    │    │
│  │  │                                                              │    │    │
│  │  │   If enable_contextual_enrichment = True:                    │    │    │
│  │  │                                                              │    │    │
│  │  │   ┌─────────────────────────────────────────────────────┐   │    │    │
│  │  │   │  For each chunk:                                     │   │    │    │
│  │  │   │                                                      │   │    │    │
│  │  │   │  1. Get parent context (section heading)             │   │    │    │
│  │  │   │  2. Get sibling context (prev/next chunks)           │   │    │    │
│  │  │   │  3. Generate contextual summary via LLM              │   │    │    │
│  │  │   │  4. Prepend context to chunk text                    │   │    │    │
│  │  │   │                                                      │   │    │    │
│  │  │   │  Before: "Grilled Salmon - $24.99"                   │   │    │    │
│  │  │   │  After:  "This chunk is from the 'Dinner Entrees'    │   │    │    │
│  │  │   │          section of Bella Italia's menu.             │   │    │    │
│  │  │   │          Grilled Salmon - $24.99"                    │   │    │    │
│  │  │   │                                                      │   │    │    │
│  │  │   └─────────────────────────────────────────────────────┘   │    │    │
│  │  │                        │                                     │    │    │
│  │  │                        ▼                                     │    │    │
│  │  │              Enriched Chunks                                 │    │    │
│  │  │                                                              │    │    │
│  │  └─────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│                         ┌─────────────────────┐                              │
│                         │   Vector Store      │                              │
│                         │   (Convex)          │                              │
│                         └─────────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow Diagrams

### Main Processing Flow

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐     ┌─────────────┐
│   Upload    │────▶│   Parse      │────▶│   Analyze      │────▶│   Chunk     │
│   Document  │     │   Document   │     │   Content      │     │   Content   │
└─────────────┘     └──────────────┘     └────────────────┘     └─────────────┘
                           │                     │                     │
                           ▼                     ▼                     ▼
                    ┌──────────────┐     ┌────────────────┐     ┌─────────────┐
                    │ LlamaParse   │     │ STRUCTURED     │     │ Hierarchical│
                    │ (JSON mode)  │     │ NARRATIVE      │     │ or Semantic │
                    │ + Retry(3x)  │     │ MIXED          │     │ Parser      │
                    └──────────────┘     └────────────────┘     └─────────────┘
                                                                       │
                                                                       ▼
                    ┌──────────────┐     ┌────────────────┐     ┌─────────────┐
                    │   Store in   │◀────│  PRE-EMBED     │◀────│   Add       │
                    │   Convex     │     │  CONTEXT       │     │   Metadata  │
                    │              │     │  (section_path │     │             │
                    │              │     │  parent_text)  │     │             │
                    └──────────────┘     └────────────────┘     └─────────────┘
```

### Parser Selection Decision Tree

```
                              ┌─────────────────┐
                              │  Parsed Output  │
                              └────────┬────────┘
                                       │
                                       ▼
                         ┌─────────────────────────┐
                         │  Count element_types:   │
                         │  tables, headings,      │
                         │  paragraphs, lists      │
                         └────────────┬────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
            │ tables > 30%  │ │ paragraphs    │ │   Otherwise   │
            │     OR        │ │   > 70%       │ │               │
            │ heading_levels│ │               │ │               │
            │   > 5         │ │               │ │               │
            └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
            │  STRUCTURED   │ │   NARRATIVE   │ │     MIXED     │
            └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
                    │                 │                 │
                    ▼                 ▼                 ▼
            ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
            │ Hierarchical  │ │   Semantic    │ │ Hierarchical  │
            │ NodeParser    │ │   Splitter    │ │ NodeParser    │
            │               │ │               │ │      +        │
            │ chunk_sizes:  │ │ buffer_size:1 │ │   Semantic    │
            │ [2048,512,128]│ │               │ │   Splitter    │
            └───────────────┘ └───────────────┘ └───────────────┘
```

### Restaurant Menu Processing Example

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RESTAURANT MENU PROCESSING FLOW                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Input: menu.pdf                                                            │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  LAYER 1: LlamaParse (JSON mode)                                     │   │
│   │                                                                      │   │
│   │  Output:                                                             │   │
│   │  {                                                                   │   │
│   │    "elements": [                                                     │   │
│   │      {"type": "heading", "level": 1, "text": "Bella Italia"},       │   │
│   │      {"type": "heading", "level": 2, "text": "Appetizers"},         │   │
│   │      {"type": "table", "rows": [["Bruschetta", "$8.99"], ...]},     │   │
│   │      {"type": "heading", "level": 2, "text": "Entrees"},            │   │
│   │      {"type": "table", "rows": [["Chicken Parm", "$18.99"], ...]},  │   │
│   │      {"type": "paragraph", "text": "All entrees include..."}        │   │
│   │    ]                                                                 │   │
│   │  }                                                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  LAYER 2: Content Analysis                                           │   │
│   │                                                                      │   │
│   │  Element counts:                                                     │   │
│   │  - headings: 5 (levels 1-2)                                         │   │
│   │  - tables: 4 (40% of content)                                       │   │
│   │  - paragraphs: 2 (10% of content)                                   │   │
│   │                                                                      │   │
│   │  Result: STRUCTURED (tables > 30%)                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  LAYER 3: HierarchicalNodeParser                                     │   │
│   │                                                                      │   │
│   │  chunk_sizes = [2048, 512, 128]                                      │   │
│   │                                                                      │   │
│   │  Output nodes:                                                       │   │
│   │  ┌─────────────────────────────────────────────────────────────┐    │   │
│   │  │ Level 0: "Bella Italia - Full Menu"                         │    │   │
│   │  │   └─ Level 1: "Appetizers"                                  │    │   │
│   │  │       └─ Level 2: "Bruschetta - $8.99"                      │    │   │
│   │  │       └─ Level 2: "Calamari - $12.99"                       │    │   │
│   │  │   └─ Level 1: "Entrees"                                     │    │   │
│   │  │       └─ Level 2: "Chicken Parm - $18.99"                   │    │   │
│   │  │       └─ Level 2: "Grilled Salmon - $24.99"                 │    │   │
│   │  └─────────────────────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  LAYER 4: Contextual Enrichment (if enabled)                         │   │
│   │                                                                      │   │
│   │  Before: "Grilled Salmon - $24.99"                                   │   │
│   │                                                                      │   │
│   │  After:  "This item is from Bella Italia's Entrees section.         │   │
│   │           Grilled Salmon - $24.99"                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Storage: Convex                                                     │   │
│   │                                                                      │   │
│   │  Each node stored with metadata:                                     │   │
│   │  {                                                                   │   │
│   │    "text": "Grilled Salmon - $24.99",                               │   │
│   │    "element_type": "table_row",                                     │   │
│   │    "section_hierarchy": ["Bella Italia", "Entrees"],                │   │
│   │    "parent_id": "node_entrees_001",                                 │   │
│   │    "level": 2,                                                      │   │
│   │    "content_type": "STRUCTURED"                                     │   │
│   │  }                                                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### Step 1: Modify LlamaParse Integration

**File:** `app/services/document_parser_service.py`

**Current Code (Problem):**
```python
# Line 51-56 - LlamaParse initialization
self.parser = LlamaParse(
    api_key=api_key,
    result_type="markdown",  # ❌ Loses structure
    num_workers=4,
    verbose=False
)

# Lines 102-107 - Content joining
content_parts = []
for doc in documents:
    content_parts.append(doc.text)
result["content"] = "\n\n".join(content_parts)  # ❌ Flattens output
```

**New Code (Solution):**
```python
# Switch to JSON mode in __init__
self.parser = LlamaParse(
    api_key=api_key,
    result_type="json",  # ✅ Preserves structure with element_types
    num_workers=4,
    verbose=False
)

# In parse_file(), return structured JSON instead of joining
# Store raw documents for structured processing
result["structured_elements"] = documents  # ✅ Preserve structure
result["content"] = "\n\n".join(content_parts)  # Keep for backward compat
```

### Step 2: Create Content Analyzer

**File:** `app/services/chunking_service.py`

> **Note:** The file already has `ChunkingStrategy` enum. We add a new `ContentType` enum for content classification.

**New Function (add after existing `ChunkingStrategy` enum):**
```python
# Note: ChunkingStrategy enum already exists in the file
# Add ContentType enum for document structure classification
from enum import Enum
from typing import Dict, List, Any

class ContentType(str, Enum):
    """Document content type classification for parser routing"""
    STRUCTURED = "structured"  # Tables, hierarchies, menus
    NARRATIVE = "narrative"    # Prose, articles, descriptions
    MIXED = "mixed"            # Combination of both

def analyze_content_type(parsed_elements: List[Dict[str, Any]]) -> ContentType:
    """
    Analyze parsed document elements to determine content type.
    
    Classification rules:
    - STRUCTURED: >30% tables OR >5 unique heading levels
    - NARRATIVE: >70% paragraphs
    - MIXED: Everything else
    """
    if not parsed_elements:
        return ContentType.NARRATIVE
    
    total_elements = len(parsed_elements)
    
    # Count element types
    table_count = sum(1 for e in parsed_elements if e.get("type") == "table")
    paragraph_count = sum(1 for e in parsed_elements if e.get("type") == "paragraph")
    heading_levels = set(
        e.get("level", 0) for e in parsed_elements if e.get("type") == "heading"
    )
    
    # Calculate percentages
    table_percentage = (table_count / total_elements) * 100 if total_elements > 0 else 0
    paragraph_percentage = (paragraph_count / total_elements) * 100 if total_elements > 0 else 0
    
    # Apply classification rules
    if table_percentage > 30 or len(heading_levels) > 5:
        return ContentType.STRUCTURED
    elif paragraph_percentage > 70:
        return ContentType.NARRATIVE
    else:
        return ContentType.MIXED
```

### Step 3: Implement Parser Router

**File:** `app/services/chunking_service.py`

**New Function:**
```python
from llama_index.core.node_parser import (
    HierarchicalNodeParser,
    SemanticSplitterNodeParser,
    SentenceSplitter,
)
from llama_index.core import Document

def get_parser_for_content_type(content_type: ContentType, embed_model=None):
    """
    Return appropriate parser based on content type.
    """
    if content_type == ContentType.STRUCTURED:
        return HierarchicalNodeParser.from_defaults(
            chunk_sizes=[2048, 512, 128],
            chunk_overlap=20
        )
    elif content_type == ContentType.NARRATIVE:
        if embed_model:
            return SemanticSplitterNodeParser.from_defaults(
                embed_model=embed_model,
                buffer_size=1,
                breakpoint_percentile_threshold=95
            )
        else:
            # Fallback if no embedding model
            return SentenceSplitter(
                chunk_size=512,
                chunk_overlap=50
            )
    else:  # MIXED
        # Return hierarchical for first pass
        # Caller should apply semantic splitting to leaf nodes
        return HierarchicalNodeParser.from_defaults(
            chunk_sizes=[2048, 512],
            chunk_overlap=20
        )

def chunk_document(
    documents: List[Document],
    content_type: ContentType,
    embed_model=None
) -> List:
    """
    Chunk documents using appropriate parser based on content type.
    """
    parser = get_parser_for_content_type(content_type, embed_model)
    nodes = parser.get_nodes_from_documents(documents)
    
    # For MIXED content, apply semantic splitting to leaf nodes
    if content_type == ContentType.MIXED and embed_model:
        semantic_parser = SemanticSplitterNodeParser.from_defaults(
            embed_model=embed_model,
            buffer_size=1,
            breakpoint_percentile_threshold=95
        )
        # Process only leaf nodes (those without children)
        leaf_nodes = [n for n in nodes if not n.child_nodes]
        leaf_node_docs = [Document(text=n.text, metadata=n.metadata) for n in leaf_nodes]
        refined_nodes = semantic_parser.get_nodes_from_documents(leaf_node_docs)
        
        # Replace leaf nodes with refined nodes
        non_leaf_nodes = [n for n in nodes if n.child_nodes]
        nodes = non_leaf_nodes + refined_nodes
    
    return nodes
```

### Step 4: Add Retry Logic

**File:** `app/services/document_parser_service.py`

**New Code:**
```python
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from llama_index.core import Document

class LlamaParseError(Exception):
    """Custom exception for LlamaParse failures"""
    pass

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((TimeoutError, ConnectionError, LlamaParseError))
)
async def parse_document_with_retry(file_path: str, settings) -> List[Document]:
    """
    Parse document with LlamaParse using retry logic.
    No fallback - ensures consistent quality or fails explicitly.
    """
    try:
        parser = LlamaParse(
            api_key=settings.LLAMA_CLOUD_API_KEY,
            result_type="json",
            verbose=True
        )
        documents = await parser.aload_data(file_path)
        
        if not documents:
            raise LlamaParseError("No content extracted from document")
        
        logger.info(f"Successfully parsed document: {file_path}")
        return documents
        
    except TimeoutError:
        logger.warning(f"LlamaParse timeout for {file_path}, will retry...")
        raise
    except ConnectionError:
        logger.warning(f"LlamaParse connection error for {file_path}, will retry...")
        raise
    except Exception as e:
        logger.error(f"LlamaParse failed for {file_path}: {e}")
        raise LlamaParseError(f"Document parsing failed: {str(e)}")
```

### Step 5: Context Embedding Strategy (Pre-Embedded in Text)

**CRITICAL DISCOVERY:** The Convex RAG system does NOT support custom metadata fields!

```typescript
// From convex/rag.ts - RAG ingest only accepts:
export const ingest = action({
    args: {
        namespace: v.string(),      // Agent ID
        key: v.optional(v.string()), // Unique document key
        text: v.optional(v.string()), // Full document text
        chunks: v.optional(v.array(v.string())), // Pre-calculated chunks
        title: v.optional(v.string()),
        // ❌ NO metadata field!
    },
    // ...
});
```

**Solution: Embed Context IN the Text Itself**

Since RAG doesn't support metadata, we embed hierarchical context directly into the chunk text:

**File:** `app/services/chunking_service.py`

```python
def format_chunk_with_context(
    chunk_text: str,
    section_path: str,
    element_type: str = "item",
    parent_summary: str = ""
) -> str:
    """
    Pre-embed context INTO the chunk text for zero-latency retrieval.
    
    This context becomes part of the embedding, improving semantic search.
    The voice_knowledge_service already parses pipe-separated format!
    """
    # Use existing pipe-separated format that voice_knowledge_service understands
    context_prefix = f"Section: {section_path}"
    if parent_summary:
        context_prefix += f" | Context: {parent_summary}"
    
    return f"{context_prefix} | {chunk_text}"
```

**Example Transformation:**
```
BEFORE (loses context):
  "Grilled Salmon - $24.99 - Fresh Atlantic salmon with herbs"

AFTER (context embedded):
  "Section: Bella Italia > Entrees > Seafood | Grilled Salmon - $24.99 - Fresh Atlantic salmon with herbs"
```

**Why This Works:**
- `voice_knowledge_service.py` already parses pipe-separated format (see `_parse_enriched_text`)
- Context becomes part of the embedding vector → better semantic matching
- Zero extra DB queries at voice time
- No schema changes needed in Convex

### Step 6: Add Configuration Option

**File:** `convex/agents.ts`

**Add Field to Agent Schema:**
```typescript
// In the agents table schema, add:
enable_contextual_enrichment: v.optional(v.boolean()),  // Default: false
```

**File:** `app/schemas/agent_schemas.py`

**Add Field:**
```python
class AgentConfig(BaseModel):
    # ... existing fields ...
    
    enable_contextual_enrichment: bool = False  # New field
```

---

## File Modifications

### Summary of Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `app/services/document_parser_service.py` | Switch to JSON mode (line 54), add retry logic | HIGH |
| `app/services/chunking_service.py` | Add `ContentType` enum, content analyzer, LlamaIndex parsers, `format_chunk_with_context()` | HIGH |
| `app/services/knowledge_ingestion_service.py` | Use new structured chunking for documents with element_types | HIGH |
| `requirements.txt` | Add `llama-index-core>=0.10.0`, `tenacity>=8.0.0` | HIGH |
| `app/services/voice_knowledge_service.py` | No changes needed! Already parses pipe-separated format | NONE |
| `convex/rag.ts` | No changes needed - use existing ingest/search | NONE |
| `convex/agents.ts` | Optional: Add `enable_contextual_enrichment` config field | LOW |
| `app/schemas/agent_schemas.py` | Optional: Add config field | LOW |

---

## Configuration Options

### Agent-Level Configuration

```json
{
  "agent_id": "restaurant-voice-agent",
  "name": "Restaurant Assistant",
  "enable_contextual_enrichment": true,
  "chunking_config": {
    "default_content_type": "auto",
    "hierarchical_chunk_sizes": [2048, 512, 128],
    "semantic_buffer_size": 1,
    "chunk_overlap": 20
  }
}
```

### Environment Variables

```bash
# Required
LLAMA_CLOUD_API_KEY=your_api_key_here

# Optional (defaults shown)
LLAMAPARSE_RESULT_TYPE=json
ENABLE_CONTEXTUAL_ENRICHMENT=false
DEFAULT_CHUNK_SIZE=512
CHUNK_OVERLAP=50
```

---

## Retry Strategy

### Retry Logic (No Fallback)

**Why No Fallback?**
- Fallback parsers (Unstructured, Raw Text) produce **inconsistent quality**
- Better to fail and retry than serve degraded data
- LlamaParse is the **single source of truth** for structured parsing
- Retry logic ensures we get the **best quality** or inform the user

```
┌─────────────────────────────────────────────────────────────────────┐
│                         RETRY STRATEGY                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────────┐                                              │
│   │  LlamaParse API  │                                              │
│   │   (JSON mode)    │                                              │
│   └────────┬─────────┘                                              │
│            │                                                         │
│            ▼                                                         │
│   ┌──────────────────┐     ┌──────────────────┐                     │
│   │   Success?       │────▶│  Return Results  │                     │
│   └────────┬─────────┘ Yes └──────────────────┘                     │
│            │ No                                                      │
│            ▼                                                         │
│   ┌──────────────────┐                                              │
│   │ Attempt < 3?     │                                              │
│   └────────┬─────────┘                                              │
│       Yes  │     │ No                                                │
│            │     │                                                   │
│            ▼     ▼                                                   │
│   ┌──────────────────┐  ┌────────────────────┐                      │
│   │  Wait & Retry    │  │  Raise Error       │                      │
│   │  (exponential    │  │  (User notified)   │                      │
│   │   backoff)       │  │                    │                      │
│   └──────────────────┘  └────────────────────┘                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Retry Configuration

```python
RETRY_CONFIG = {
    "max_retries": 3,
    "initial_delay": 1.0,      # seconds
    "max_delay": 10.0,         # seconds  
    "exponential_base": 2,     # delay = initial * (base ^ attempt)
    "retryable_errors": [
        "timeout",
        "rate_limit",
        "server_error",
        "connection_error"
    ]
}
```

### Error Handling

| Error Type | Action | User Message |
|------------|--------|-------------|
| Timeout | Retry (up to 3x) | "Processing document, please wait..." |
| Rate Limit | Retry with backoff | "High demand, retrying shortly..." |
| Server Error | Retry (up to 3x) | "Service temporarily unavailable" |
| Invalid File | Fail immediately | "Unable to process this file format" |
| Max Retries | Fail with error | "Document processing failed. Please try again later." |

---

## Retrieval Enhancements (Latency-Optimized)

### ⚠️ CRITICAL: Voice Latency Requirement

**Target: < 1.5 seconds** from user speech to voice response

Any retrieval enhancement must NOT add latency during voice queries. This is a hard constraint.

### Latency Budget Analysis

```
┌─────────────────────────────────────────────────────────────────────┐
│                   VOICE RESPONSE LATENCY BUDGET                      │
│                        Target: < 1.5 seconds                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────────────────────────────────┐                      │
│   │ Component                    Time        │                      │
│   ├──────────────────────────────────────────┤                      │
│   │ Speech-to-Text (Deepgram)    100-150ms   │                      │
│   ├──────────────────────────────────────────┤                      │
│   │ RAG Search (Convex)          200-400ms   │ ← SINGLE QUERY       │
│   ├──────────────────────────────────────────┤                      │
│   │ LLM Response Generation      500-700ms   │                      │
│   ├──────────────────────────────────────────┤                      │
│   │ Text-to-Speech               200-300ms   │                      │
│   ├──────────────────────────────────────────┤                      │
│   │ Network Latency              100-150ms   │                      │
│   └──────────────────────────────────────────┘                      │
│                                                                      │
│   TOTAL:                        1100-1700ms                          │
│                                                                      │
│   ✅ At lower bound: 1100ms - Within budget                         │
│   ⚠️  At upper bound: 1700ms - EXCEEDS budget                        │
│                                                                      │
│   🚨 CONCLUSION: NO ROOM for extra DB queries during voice!         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### ✅ APPROVED: Pre-Embed Context at Ingestion

**Strategy:** Store all context directly in chunk text during document ingestion. Zero extra queries at voice time.

Context is embedded directly INTO the chunk text using pipe-separated format that the existing `voice_knowledge_service._parse_enriched_text()` already parses.

**Storage Impact:**
~500 bytes extra per chunk → **Zero latency impact** ✅

---

## Summary

This architecture provides:

1. **Structure Preservation** - JSON mode from LlamaParse maintains document hierarchy with element_types
2. **Intelligent Routing** - Content analyzer directs documents to optimal LlamaIndex parser
3. **Robustness** - Retry logic with exponential backoff ensures consistent quality (no fallback)
4. **Context-in-Text** - Context embedded in chunk text (Convex RAG doesn't support metadata fields)
5. **Zero-Latency Retrieval** - Pre-embedded context eliminates extra DB queries at voice time
6. **Voice-Optimized** - Meets <1.5s total response time requirement
7. **Extensibility** - Easy to add new parsers or modify routing rules
8. **Backward Compatible** - Existing `voice_knowledge_service._parse_enriched_text()` already parses pipe format

The implementation prioritizes **restaurant menus** and other structured documents while remaining flexible enough to handle any document type the voice agent might encounter.

---

## Implementation Checklist

- [ ] Update `document_parser_service.py`: Change `result_type` to "json", add retry logic
- [ ] Update `chunking_service.py`: Add `ContentType` enum, content analyzer, LlamaIndex parsers, `format_chunk_with_context()`
- [ ] Update `knowledge_ingestion_service.py`: Use new structured chunking pipeline
- [ ] Add `llama-index-core>=0.10.0` and `tenacity>=8.0.0` to requirements.txt
- [ ] Test with restaurant menu PDF to verify hierarchy preservation
- [ ] Verify voice latency stays under 1.5s with enriched context
