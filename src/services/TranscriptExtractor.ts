/**
 * Transcript Extractor Service
 * 
 * Uses LLM to extract structured data from conversation transcripts.
 * This allows Google Sheets integration to work with ANY conversation
 * without requiring specific function calls.
 * 
 * @module services/TranscriptExtractor
 */

import OpenAI from 'openai';
import { config } from '../core/config.js';
import { logger } from '../core/logging.js';

/**
 * Column configuration for extraction
 */
export interface ExtractionColumn {
    name: string;
    path: string;
    description?: string;
}

/**
 * Extraction result
 */
export interface ExtractionResult {
    success: boolean;
    data: Record<string, unknown>;
    error?: string;
    tokensUsed?: number;
}

/**
 * Transcript Extractor Class
 * 
 * Extracts structured data from conversation transcripts using LLM.
 */
export class TranscriptExtractor {
    private openai: OpenAI | null = null;
    
    constructor() {
        // Initialize OpenAI client if API key is available
        // Check convex.openaiApiKey (from config) or OPENAI_API_KEY env var
        const apiKey = config.convex?.openaiApiKey || process.env.OPENAI_API_KEY;
        if (apiKey) {
            this.openai = new OpenAI({ apiKey });
        }
    }
    
    /**
     * Check if the extractor is available
     */
    isAvailable(): boolean {
        return this.openai !== null;
    }
    
    /**
     * Extract structured data from a transcript
     * 
     * @param transcript - The full conversation transcript
     * @param columns - The columns/fields to extract
     * @returns Extracted data as key-value pairs
     */
    async extract(
        transcript: string,
        columns: ExtractionColumn[]
    ): Promise<ExtractionResult> {
        if (!this.openai) {
            logger.warning('[TranscriptExtractor] OpenAI not configured, skipping LLM extraction');
            return {
                success: false,
                data: {},
                error: 'OpenAI API key not configured',
            };
        }
        
        if (!transcript || transcript.trim().length === 0) {
            return {
                success: false,
                data: {},
                error: 'Empty transcript',
            };
        }
        
        if (columns.length === 0) {
            return {
                success: true,
                data: {},
            };
        }
        
        try {
            // Build extraction prompt
            const prompt = this.buildExtractionPrompt(transcript, columns);
            
            logger.info('[TranscriptExtractor] Extracting data from transcript', {
                transcriptLength: transcript.length,
                columnsCount: columns.length,
                columnNames: columns.map(c => c.name),
            });
            
            // Call OpenAI
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o-mini', // Fast and cheap for extraction
                messages: [
                    {
                        role: 'system',
                        content: `You are a data extraction assistant. Extract specific information from conversation transcripts.
                        
Rules:
- Only extract information that is EXPLICITLY mentioned in the transcript
- If information is not mentioned, return null for that field
- Be precise - use exact values from the transcript when possible
- For dates/times, normalize to a consistent format when possible
- Return valid JSON only`,
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                response_format: { type: 'json_object' },
                temperature: 0.1, // Low temperature for consistent extraction
                max_tokens: 1000,
            });
            
            // Parse response
            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('Empty response from OpenAI');
            }
            
            const extracted = JSON.parse(content);
            
            logger.info('[TranscriptExtractor] Successfully extracted data', {
                extractedFields: Object.keys(extracted).filter(k => extracted[k] !== null),
                tokensUsed: response.usage?.total_tokens,
            });
            
            return {
                success: true,
                data: extracted,
                tokensUsed: response.usage?.total_tokens,
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('[TranscriptExtractor] Extraction failed', { error: errorMessage });
            
            return {
                success: false,
                data: {},
                error: errorMessage,
            };
        }
    }
    
    /**
     * Build the extraction prompt
     */
    private buildExtractionPrompt(transcript: string, columns: ExtractionColumn[]): string {
        // Build field descriptions
        const fieldDescriptions = columns.map(col => {
            const desc = col.description || this.inferDescription(col.path);
            return `- "${col.name}": ${desc}`;
        }).join('\n');
        
        // Build expected JSON schema
        const schemaExample: Record<string, string | null> = {};
        for (const col of columns) {
            schemaExample[col.name] = null;
        }
        
        return `Extract the following information from this conversation transcript:

FIELDS TO EXTRACT:
${fieldDescriptions}

TRANSCRIPT:
"""
${transcript}
"""

Return a JSON object with these exact keys: ${columns.map(c => `"${c.name}"`).join(', ')}

If a piece of information is not mentioned in the transcript, set its value to null.

Example response format:
${JSON.stringify(schemaExample, null, 2)}`;
    }
    
    /**
     * Infer a description from the field path
     */
    private inferDescription(path: string): string {
        // Convert camelCase/snake_case to readable description
        const readable = path
            .replace(/([A-Z])/g, ' $1')
            .replace(/_/g, ' ')
            .toLowerCase()
            .trim();
        
        // Return a generic description based on the field name
        return `The ${readable} mentioned in the conversation`;
    }
}

// Singleton instance
let extractorInstance: TranscriptExtractor | null = null;

/**
 * Get the TranscriptExtractor singleton
 */
export function getTranscriptExtractor(): TranscriptExtractor {
    if (!extractorInstance) {
        extractorInstance = new TranscriptExtractor();
    }
    return extractorInstance;
}
