/**
 * Chunking Module - Backward Compatibility Re-export
 * 
 * This file re-exports from the modular chunking/ directory
 * to maintain backward compatibility with existing imports.
 * 
 * The chunking module includes:
 * - chunking/chunking-types.ts      - Type definitions
 * - chunking/text-utilities.ts      - Text utilities
 * - chunking/context-formatter.ts   - Context embedding
 * - chunking/field-extractor.ts     - Field extraction
 * - chunking/text-chunking.ts       - Plain text chunking strategies
 * - chunking/structured-chunking.ts - Structured document chunking
 * - chunking/tokenizer.ts           - Token counting
 * - chunking/recursive-splitter.ts  - Recursive text splitting
 * - chunking/deduplication.ts       - Content deduplication
 * - chunking/chunking-service.ts    - Main service class
 * - chunking/index.ts               - Module exports
 */

export * from './chunking/index.js';
export { default } from './chunking/index.js';
