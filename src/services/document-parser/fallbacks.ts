/**
 * Fallback Parsers
 * 
 * Fallback parsers for when LlamaParse is unavailable.
 * Supports PDF, DOCX, HTML, and plain text files.
 * 
 * @module document-parser/fallback-parsers
 */

import * as fs from 'fs';
import { logger } from '../../core/logging.js';
import type { ParsedDocument, StructuredElement } from './types.js';
import { extractStructureFromMarkdown } from './extractor.js';

/**
 * Parse plain text file
 */
export async function parseTextFile(
    filePath: string,
    result: ParsedDocument
): Promise<ParsedDocument> {
    const content = fs.readFileSync(filePath, 'utf-8');
    result.content = content;
    result.pages = 1;
    result.structuredElements = extractStructureFromMarkdown(content, 1);

    logger.info(`Parsed text file: ${result.filename}`);
    return result;
}

/**
 * Parse PDF using pdf-parse fallback
 */
export async function parsePdfFallback(
    filePath: string,
    result: ParsedDocument
): Promise<ParsedDocument> {
    try {
        const pdfParse = await import('pdf-parse');
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse.default(buffer);

        result.content = data.text;
        result.pages = data.numpages;
        result.metadata = {
            title: data.info?.Title,
            author: data.info?.Author,
            subject: data.info?.Subject,
        };

        logger.info(`Parsed PDF with fallback: ${result.filename} (${result.pages} pages)`);
    } catch (error) {
        logger.error(`PDF fallback failed: ${(error as Error).message}`);
        result.content = '';
        result.pages = 0;
    }

    return result;
}

/**
 * Parse DOCX using mammoth fallback
 */
export async function parseDocxFallback(
    filePath: string,
    result: ParsedDocument
): Promise<ParsedDocument> {
    try {
        const mammoth = await import('mammoth');
        const buffer = fs.readFileSync(filePath);

        // Extract as plain text
        const textResult = await mammoth.extractRawText({ buffer });
        result.content = textResult.value;

        // Also extract as HTML for structure
        const htmlResult = await mammoth.convertToHtml({ buffer });
        result.metadata.html = htmlResult.value;

        result.pages = 1; // DOCX doesn't have real pages

        logger.info(`Parsed DOCX with mammoth: ${result.filename}`);
    } catch (error) {
        logger.error(`DOCX fallback failed: ${(error as Error).message}`);
        result.content = '';
    }

    return result;
}

/**
 * Parse HTML file
 */
export async function parseHtmlFile(
    filePath: string,
    result: ParsedDocument
): Promise<ParsedDocument> {
    const html = fs.readFileSync(filePath, 'utf-8');

    // Basic HTML to text conversion (strip tags)
    const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    result.content = text;
    result.pages = 1;
    result.metadata.html = html;

    logger.info(`Parsed HTML file: ${result.filename}`);
    return result;
}

/**
 * Parse using fallback methods based on file extension
 */
export async function parseWithFallback(
    filePath: string,
    result: ParsedDocument
): Promise<ParsedDocument> {
    const ext = result.fileType;

    switch (ext) {
        case '.txt':
        case '.md':
            return await parseTextFile(filePath, result);
        case '.pdf':
            return await parsePdfFallback(filePath, result);
        case '.docx':
            return await parseDocxFallback(filePath, result);
        case '.html':
        case '.htm':
            return await parseHtmlFile(filePath, result);
        default:
            // Try reading as text for unknown types
            return await parseTextFile(filePath, result);
    }
}
