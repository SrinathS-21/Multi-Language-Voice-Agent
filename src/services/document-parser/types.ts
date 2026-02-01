/**
 * Document Parser Types
 * 
 * Type definitions for document parsing service.
 * 
 * @module document-parser/types
 */

/**
 * Custom error for LlamaParse failures
 */
export class LlamaParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LlamaParseError';
    }
}

/**
 * Supported file extensions
 */
export const SUPPORTED_EXTENSIONS = new Set([
    '.pdf', '.docx', '.doc', '.txt', '.rtf',
    '.csv', '.xlsx', '.xls',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
    '.html', '.htm', '.md'
]);

/**
 * Parser tier options
 */
export type ParserTier = 'cost_effective' | 'agentic' | 'agentic_plus';

/**
 * Structured element from document parsing
 */
export interface StructuredElement {
    type: 'heading' | 'paragraph' | 'table' | 'list' | 'image' | 'text';
    level?: number;          // For headings (1-6)
    text: string;            // Text content
    markdown?: string;       // Markdown representation
    page?: number;           // Page number (for PDFs)
    sectionPath?: string[];  // Hierarchical section path
    parentHeading?: string;  // Parent section heading
}

/**
 * JSON mode element from LlamaParse
 */
export interface LlamaParseJsonElement {
    type: string;
    lvl?: number;
    value?: string;
    md?: string;
    page?: number;
}

/**
 * Parsed document result
 */
export interface ParsedDocument {
    filename: string;
    fileType: string;
    fileSize: number;
    content: string;              // Combined text content
    pages: number;
    structuredElements?: StructuredElement[];
    metadata: Record<string, any>;
}

/**
 * LlamaParse REST API configuration
 */
export const LLAMAPARSE_API = {
    baseUrl: 'https://api.cloud.llamaindex.ai/api/v1/parsing',
    uploadEndpoint: '/upload',
    statusEndpoint: '/job',
    resultEndpoint: '/result',
    pollIntervalMs: 1000,
    maxPollAttempts: 120, // 2 minutes max wait
};

/**
 * Retry configuration for LlamaParse
 */
export const RETRY_CONFIG = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    multiplier: 2,
    retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'TimeoutError'],
};

/**
 * MIME type mapping
 */
export const MIME_TYPES: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.html': 'text/html',
    '.htm': 'text/html',
};
