/**
 * Document Parser Service
 * 
 * Main service class for document parsing.
 * Orchestrates parsing using LlamaParse or fallback parsers.
 * 
 * Features:
 * - Direct text parsing for .txt files (fast, accurate for FAQ)
 * - LlamaParse SDK markdown mode for PDF/DOCX (structure preserved)
 * - Retry logic with exponential backoff (3x max)
 * - Structured element preservation (headings, tables, text)
 * - Fallback parsers for when LlamaParse is unavailable
 * 
 * @module document-parser/service
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../core/logging.js';
import {
    SUPPORTED_EXTENSIONS,
    type ParserTier,
    type ParsedDocument,
} from './types.js';
import { parseTextFile, parseWithFallback } from './fallbacks.js';
import { initializeLlamaParse, parseWithRetry } from './client.js';

// Type definitions for LlamaParse
type LlamaParseClient = any;

/**
 * Document Parser Service class
 */
export class DocumentParserService {
    private tier: ParserTier;
    private parser: LlamaParseClient | 'REST_API' | null = null;
    private apiKey: string | null;
    private initPromise: Promise<void> | null = null;
    private useRestApi: boolean = false; // Disabled - REST API has form-data issues, use SDK

    /**
     * Initialize document parser
     * @param tier Parsing tier for quality/cost tradeoff
     */
    constructor(tier: ParserTier = 'cost_effective') {
        this.tier = tier;
        this.apiKey = process.env.LLAMA_CLOUD_API_KEY || null;

        if (this.apiKey) {
            logger.info('LlamaParse API key found, initializing...', {
                keyPrefix: this.apiKey.substring(0, 10) + '...',
                tier: this.tier,
            });
            // Store the promise so we can await it later
            this.initPromise = this.initializeLlamaParse();
        } else {
            logger.warning('LLAMA_CLOUD_API_KEY not set. Using fallback parsers only.');
        }
    }

    /**
     * Ensure LlamaParse is initialized before parsing
     */
    async ensureInitialized(): Promise<void> {
        if (this.initPromise) {
            await this.initPromise;
        }
    }

    /**
     * Initialize LlamaParse client
     */
    private async initializeLlamaParse(): Promise<void> {
        if (this.useRestApi && this.apiKey) {
            logger.info(`DocumentParserService initialized with REST API JSON mode (tier: ${this.tier})`);
            this.parser = 'REST_API'; // Marker for REST API mode
            return;
        }

        this.parser = await initializeLlamaParse(this.apiKey!, this.tier);
    }

    /**
     * Check if file type is supported
     */
    isSupported(filename: string): boolean {
        const ext = path.extname(filename).toLowerCase();
        return SUPPORTED_EXTENSIONS.has(ext);
    }

    /**
     * Parse a file and extract text content
     * Uses retry logic with exponential backoff (3x max)
     * No fallback on failure - ensures consistent quality
     */
    async parseFile(filePath: string): Promise<ParsedDocument> {
        // Ensure LlamaParse is initialized before parsing
        await this.ensureInitialized();

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const filename = path.basename(filePath);
        const ext = path.extname(filename).toLowerCase();

        if (!this.isSupported(filename)) {
            throw new Error(`Unsupported file type: ${ext}`);
        }

        const stats = fs.statSync(filePath);
        const result: ParsedDocument = {
            filename,
            fileType: ext,
            fileSize: stats.size,
            content: '',
            pages: 0,
            metadata: {},
        };

        try {
            // Skip LlamaParse for plain text files - direct parsing is faster and more accurate
            if (ext === '.txt') {
                logger.info(`Using direct text parsing for ${filename} (skipping LlamaParse)`);
                return await parseTextFile(filePath, result);
            }
            
            if (this.parser && this.apiKey) {
                // Use LlamaParse with retry logic for complex documents
                try {
                    return await parseWithRetry(filePath, result, this.parser, this.apiKey);
                } catch (llamaError) {
                    logger.warning(`LlamaParse failed for ${filename}, falling back to local parser`, {
                        error: (llamaError as Error).message,
                    });
                    // Fall back to local parser
                    return await parseWithFallback(filePath, result);
                }
            } else {
                // Use fallback parsers for local files without LlamaParse
                return await parseWithFallback(filePath, result);
            }
        } catch (error) {
            logger.error(`Failed to parse ${filename} after all retries`, {
                error: (error as Error).message,
            });
            throw error;
        }
    }

    /**
     * Parse file from buffer (for API uploads)
     */
    async parseBuffer(
        buffer: Buffer,
        filename: string
    ): Promise<ParsedDocument> {
        // Write to temp file and parse
        const tempPath = path.join(process.cwd(), '.tmp', filename);
        const tempDir = path.dirname(tempPath);

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        try {
            fs.writeFileSync(tempPath, buffer);
            const result = await this.parseFile(tempPath);
            return result;
        } finally {
            // Cleanup temp file
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        }
    }
}

// Singleton instance
let documentParserInstance: DocumentParserService | null = null;

/**
 * Get the document parser service singleton
 */
export function getDocumentParser(tier?: ParserTier): DocumentParserService {
    if (!documentParserInstance) {
        documentParserInstance = new DocumentParserService(tier);
    }
    return documentParserInstance;
}
