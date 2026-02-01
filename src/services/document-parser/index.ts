/**
 * Document Parser Module
 * 
 * Handles document parsing and text extraction.
 * Supports PDF, DOCX, TXT, images (OCR), and more.
 * 
 * @module document-parser
 */

// Types
export {
    LlamaParseError,
    SUPPORTED_EXTENSIONS,
    LLAMAPARSE_API,
    RETRY_CONFIG,
    MIME_TYPES,
} from './types.js';

export type {
    ParserTier,
    StructuredElement,
    LlamaParseJsonElement,
    ParsedDocument,
} from './types.js';

// Markdown extraction
export {
    mapElementType,
    buildHierarchyFromElements,
    extractStructureFromMarkdown,
} from './extractor.js';

// Fallback parsers
export {
    parseTextFile,
    parsePdfFallback,
    parseDocxFallback,
    parseHtmlFile,
    parseWithFallback,
} from './fallbacks.js';

// LlamaParse client
export {
    getMimeType,
    initializeLlamaParse,
    uploadFileToLlamaParse,
    waitForJobCompletion,
    getJsonResult,
    getMarkdownResult,
    parseWithRestApiJson,
    parseWithSdkMarkdown,
    parseWithRetry,
} from './client.js';

// Main service
export {
    DocumentParserService,
    getDocumentParser,
} from './service.js';
