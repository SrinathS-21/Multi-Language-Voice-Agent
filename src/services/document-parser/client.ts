/**
 * LlamaParse Client
 * 
 * Client for LlamaParse document parsing service.
 * Supports both REST API JSON mode and SDK markdown mode.
 * 
 * @module document-parser/llamaparse-client
 */

import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { logger } from '../../core/logging.js';
import {
    LlamaParseError,
    LLAMAPARSE_API,
    RETRY_CONFIG,
    MIME_TYPES,
    type ParsedDocument,
    type StructuredElement,
} from './types.js';
import {
    mapElementType,
    buildHierarchyFromElements,
    extractStructureFromMarkdown,
} from './extractor.js';

// Type definitions for LlamaParse
type LlamaParseClient = any;

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get MIME type for file
 */
export function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Initialize LlamaParse client
 * Uses llamaindex SDK with markdown mode - extracts structure from markdown
 */
export async function initializeLlamaParse(
    apiKey: string,
    tier: string
): Promise<LlamaParseClient | 'REST_API' | null> {
    try {
        // Use llamaindex SDK with markdown mode - we extract structure from markdown
        const { LlamaParseReader } = await import('llamaindex');
        
        // Use markdown result type - we'll extract structured elements from markdown
        // This provides good structure (headings, tables, lists) while being reliable
        const parser = new LlamaParseReader({
            apiKey: apiKey,
            resultType: 'markdown',
            verbose: false,
        });

        // Note: TypeScript SDK doesn't have aget_json like Python SDK
        // We extract structure from markdown which preserves headings, tables, lists
        logger.info(`DocumentParserService initialized with LlamaParse SDK markdown mode (tier: ${tier})`);
        logger.info('  → Structure extracted from markdown (headings, tables, lists preserved)');
        
        return parser;
    } catch (error) {
        logger.warning('LlamaParse not available. Using fallback parsers.', {
            error: (error as Error).message,
        });
        return null;
    }
}

/**
 * Upload file to LlamaParse REST API
 */
export async function uploadFileToLlamaParse(
    filePath: string,
    apiKey: string
): Promise<string> {
    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', fileBuffer, {
        filename,
        contentType: getMimeType(filePath),
    });
    
    const response = await fetch(`${LLAMAPARSE_API.baseUrl}${LLAMAPARSE_API.uploadEndpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            ...formData.getHeaders(),
        },
        body: formData as any,
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new LlamaParseError(`Upload failed: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json() as { id: string };
    return data.id;
}

/**
 * Wait for LlamaParse job to complete
 */
export async function waitForJobCompletion(
    jobId: string,
    apiKey: string
): Promise<void> {
    for (let attempt = 0; attempt < LLAMAPARSE_API.maxPollAttempts; attempt++) {
        const response = await fetch(
            `${LLAMAPARSE_API.baseUrl}${LLAMAPARSE_API.statusEndpoint}/${jobId}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'application/json',
                },
            }
        );
        
        if (!response.ok) {
            throw new LlamaParseError(`Status check failed: ${response.status}`);
        }
        
        const status = await response.json() as { status: string };
        
        if (status.status === 'SUCCESS') {
            return;
        }
        
        if (status.status === 'ERROR' || status.status === 'FAILED') {
            throw new LlamaParseError(`Job failed with status: ${status.status}`);
        }
        
        // Wait before polling again
        await sleep(LLAMAPARSE_API.pollIntervalMs);
    }
    
    throw new LlamaParseError('Job timed out waiting for completion');
}

/**
 * Get JSON result from completed job
 */
export async function getJsonResult(
    jobId: string,
    apiKey: string
): Promise<any> {
    const response = await fetch(
        `${LLAMAPARSE_API.baseUrl}${LLAMAPARSE_API.statusEndpoint}/${jobId}${LLAMAPARSE_API.resultEndpoint}/json`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
            },
        }
    );
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new LlamaParseError(`JSON result fetch failed: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
}

/**
 * Get markdown result from completed job (fallback)
 */
export async function getMarkdownResult(
    jobId: string,
    apiKey: string
): Promise<string> {
    const response = await fetch(
        `${LLAMAPARSE_API.baseUrl}${LLAMAPARSE_API.statusEndpoint}/${jobId}${LLAMAPARSE_API.resultEndpoint}/markdown`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
            },
        }
    );
    
    if (!response.ok) {
        return '';
    }
    
    const data = await response.json() as { markdown: string };
    return data.markdown || '';
}

/**
 * Parse using LlamaParse REST API with JSON output
 * This matches the Python aget_json() behavior exactly
 */
export async function parseWithRestApiJson(
    filePath: string,
    result: ParsedDocument,
    apiKey: string
): Promise<ParsedDocument> {
    const filename = result.filename;
    
    try {
        // Step 1: Upload file to LlamaParse
        const jobId = await uploadFileToLlamaParse(filePath, apiKey);
        logger.info(`Uploaded ${filename}, job ID: ${jobId}`);
        
        // Step 2: Poll for completion
        await waitForJobCompletion(jobId, apiKey);
        logger.info(`Job ${jobId} completed`);
        
        // Step 3: Get JSON result
        const jsonResult = await getJsonResult(jobId, apiKey);
        
        // Step 4: Process JSON result (matches Python aget_json structure)
        if (jsonResult && jsonResult.pages && jsonResult.pages.length > 0) {
            const structuredElements: StructuredElement[] = [];
            const contentParts: string[] = [];
            
            for (const page of jsonResult.pages) {
                // Get page markdown content
                const pageMd = page.md || '';
                if (pageMd) {
                    contentParts.push(pageMd);
                }
                
                // Extract structured items (headings, text, tables, etc.)
                const items = page.items || [];
                for (const item of items) {
                    structuredElements.push({
                        type: mapElementType(item.type || 'text'),
                        level: item.lvl || 0,
                        text: item.value || '',
                        markdown: item.md || '',
                        page: page.page || 1,
                    });
                }
            }
            
            // Build hierarchy from structured elements
            result.structuredElements = buildHierarchyFromElements(structuredElements);
            result.content = contentParts.join('\n\n');
            result.pages = jsonResult.pages.length;
            
            logger.info(
                `✅ Parsed ${filename} with JSON mode: ${result.pages} pages, ` +
                `${result.structuredElements.length} elements with hierarchy, ` +
                `${result.content.length} chars`
            );
        } else {
            // Fallback: extract from markdown if JSON structure is empty
            logger.warning(`JSON result empty for ${filename}, using markdown extraction`);
            const markdownResult = await getMarkdownResult(jobId, apiKey);
            result.content = markdownResult || '';
            result.structuredElements = extractStructureFromMarkdown(result.content, 1);
            result.pages = 1;
        }
    } catch (error) {
        logger.error(`REST API JSON parsing failed for ${filename}`, {
            error: (error as Error).message,
        });
        throw error;
    }
    
    return result;
}

/**
 * Parse using LlamaParse SDK with markdown mode
 */
export async function parseWithSdkMarkdown(
    filePath: string,
    result: ParsedDocument,
    parser: LlamaParseClient
): Promise<ParsedDocument> {
    const filename = result.filename;

    try {
        logger.info(`Parsing ${filename} with LlamaParse SDK markdown mode...`);
        
        // Load documents using LlamaParse
        const documents = await parser.loadData(filePath);

        if (documents && documents.length > 0) {
            const structuredElements: StructuredElement[] = [];
            const contentParts: string[] = [];

            for (let i = 0; i < documents.length; i++) {
                const doc = documents[i];
                const text = doc.text || doc.getText?.() || '';

                if (text) {
                    contentParts.push(text);

                    // Extract structure from markdown (headers, tables, lists)
                    const elements = extractStructureFromMarkdown(text, i + 1);
                    structuredElements.push(...elements);
                }
            }

            // Build hierarchy from structured elements
            result.structuredElements = buildHierarchyFromElements(structuredElements);
            result.content = contentParts.join('\n\n');
            result.pages = documents.length;

            logger.info(
                `✅ Parsed ${filename}: ${result.pages} pages, ` +
                `${result.structuredElements.length} elements with hierarchy, ` +
                `${result.content.length} chars`
            );
        } else {
            logger.warning(`LlamaParse returned no documents for ${filename}`);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        logger.error(`LlamaParse SDK failed for ${filename}`, {
            error: errorMessage,
            stack: errorStack,
            filePath,
        });
        
        // Log more details about the error
        if (errorMessage.includes('fetch failed')) {
            logger.error('Network error calling LlamaParse API. Check:', {
                apiKeySet: !!process.env.LLAMA_CLOUD_API_KEY,
                apiKeyPrefix: process.env.LLAMA_CLOUD_API_KEY?.substring(0, 10),
                networkAccess: 'Verify internet connection and LlamaParse API status',
            });
        }
        
        throw error;
    }

    return result;
}

/**
 * Parse with exponential backoff retry (3x max)
 * Per PARSER_ARCHITECTURE.md: No fallback, retry only
 */
export async function parseWithRetry(
    filePath: string,
    result: ParsedDocument,
    parser: LlamaParseClient | 'REST_API',
    apiKey: string
): Promise<ParsedDocument> {
    const filename = result.filename;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            logger.info(`Parsing ${filename} with LlamaParse (attempt ${attempt}/${RETRY_CONFIG.maxRetries})...`);
            
            // Use REST API for JSON mode (preferred - matches Python aget_json)
            if (parser === 'REST_API' && apiKey) {
                logger.info(`Parsing ${filename} with LlamaParse REST API JSON mode...`);
                return await parseWithRestApiJson(filePath, result, apiKey);
            }
            
            // Fallback to SDK markdown mode
            logger.info(`Parsing ${filename} with LlamaParse SDK markdown mode...`);
            return await parseWithSdkMarkdown(filePath, result, parser);
        } catch (error) {
            lastError = error as Error;
            const errorMsg = lastError.message || '';
            
            // Check if error is retryable
            const isRetryable = RETRY_CONFIG.retryableErrors.some(
                e => errorMsg.includes(e)
            ) || errorMsg.includes('timeout') || errorMsg.includes('network');

            if (!isRetryable || attempt === RETRY_CONFIG.maxRetries) {
                logger.error(`LlamaParse failed for ${filename} (attempt ${attempt}): ${errorMsg}`);
                throw new LlamaParseError(`Document parsing failed after ${attempt} attempts: ${errorMsg}`);
            }

            // Calculate exponential backoff delay
            const delay = Math.min(
                RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.multiplier, attempt - 1),
                RETRY_CONFIG.maxDelayMs
            );

            logger.warning(`LlamaParse attempt ${attempt} failed, retrying in ${delay}ms...`, {
                error: errorMsg,
            });

            await sleep(delay);
        }
    }

    throw lastError || new LlamaParseError('Unknown parsing error');
}
