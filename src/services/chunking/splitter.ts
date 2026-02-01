/**
 * Recursive Text Splitter
 * 
 * Production-grade text splitter that uses token-based sizing and
 * semantic boundary detection for optimal RAG retrieval.
 * 
 * Features:
 * - Token-based sizing (not character-based)
 * - Recursive separator hierarchy
 * - Smart overlap between chunks
 * - Semantic boundary detection
 * - Special content preservation (code, tables, FAQ pairs)
 * 
 * @module chunking/recursive-splitter
 * @version 1.0.0
 */

import { logger } from '../../core/logging.js';
import { ProductionTokenizer, getTokenizer } from './tokenizer.js';

// ============================================================
// TYPES & INTERFACES
// ============================================================

/**
 * Content density classification for adaptive sizing
 */
export enum ContentDensity {
    HIGH = 'high',       // Technical docs, API refs, code
    STANDARD = 'standard', // General prose, FAQs
    LOW = 'low',         // Narrative, blog posts, stories
}

/**
 * Configuration for adaptive chunk sizing
 */
export interface AdaptiveSizingConfig {
    density: ContentDensity;
    targetTokens: number;
    minTokens: number;
    maxTokens: number;
    overlapTokens: number;
}

/**
 * Separator definition with semantic information
 */
interface Separator {
    separator: string;
    name: string;
    semantic: 'section' | 'paragraph' | 'line' | 'sentence' | 'clause' | 'word' | 'char';
}

/**
 * Special content region that should not be split
 */
export interface SpecialContent {
    type: 'code_block' | 'table' | 'faq_pair' | 'list';
    start: number;
    end: number;
    content: string;
    mustKeepTogether: boolean;
}

/**
 * Chunk result with metadata
 */
export interface SplitterChunk {
    text: string;
    index: number;
    tokens: number;
    hasOverlap: boolean;
    metadata: {
        separatorUsed?: string;
        semanticLevel?: string;
        isSpecialContent?: boolean;
        specialContentType?: string;
    };
}

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Sizing presets for different content densities
 */
export const SIZING_PRESETS: Record<ContentDensity, AdaptiveSizingConfig> = {
    [ContentDensity.HIGH]: {
        density: ContentDensity.HIGH,
        targetTokens: 256,    // Smaller for precision
        minTokens: 128,
        maxTokens: 384,
        overlapTokens: 48,    // ~18% overlap
    },
    [ContentDensity.STANDARD]: {
        density: ContentDensity.STANDARD,
        targetTokens: 384,    // Balanced
        minTokens: 192,
        maxTokens: 512,
        overlapTokens: 64,    // ~16% overlap
    },
    [ContentDensity.LOW]: {
        density: ContentDensity.LOW,
        targetTokens: 512,    // More context for narrative
        minTokens: 256,
        maxTokens: 768,
        overlapTokens: 96,    // ~18% overlap
    },
};

/**
 * Separator hierarchy for recursive splitting
 * Ordered from strongest semantic boundary to weakest
 */
const SEPARATOR_HIERARCHY: Separator[] = [
    // Level 1: Document structure (prefer these)
    { separator: '\n\n\n', name: 'triple-newline', semantic: 'section' },
    { separator: '---\n', name: 'hr-markdown', semantic: 'section' },
    { separator: '***\n', name: 'hr-alt', semantic: 'section' },
    
    // Level 2: Paragraphs (strong semantic boundary)
    { separator: '\n\n', name: 'paragraph', semantic: 'paragraph' },
    
    // Level 3: Lines (moderate boundary)
    { separator: '\n', name: 'line', semantic: 'line' },
    
    // Level 4: Sentences (weak but meaningful)
    { separator: '. ', name: 'period', semantic: 'sentence' },
    { separator: '? ', name: 'question', semantic: 'sentence' },
    { separator: '! ', name: 'exclaim', semantic: 'sentence' },
    
    // Level 5: Clauses (minimal semantic value)
    { separator: '; ', name: 'semicolon', semantic: 'clause' },
    { separator: ', ', name: 'comma', semantic: 'clause' },
    
    // Level 6: Words (last resort before chars)
    { separator: ' ', name: 'space', semantic: 'word' },
    
    // Level 7: Characters (absolute fallback - empty string means char-by-char)
    { separator: '', name: 'char', semantic: 'char' },
];

// ============================================================
// CONTENT DENSITY DETECTION
// ============================================================

/**
 * Auto-detect content density from text sample
 * 
 * @param text - Text to analyze
 * @returns Detected content density
 */
export function detectContentDensity(text: string): ContentDensity {
    const sample = text.slice(0, 3000);
    
    // Technical indicators
    const technicalPatterns = [
        /\b(API|SDK|HTTP|JSON|XML|REST|SOAP|GraphQL)\b/gi,
        /\b(function|class|interface|const|let|var|def|async|await)\b/gi,
        /[{}\[\]<>]/g,
        /\b\d+\.\d+\.\d+\b/g,  // Version numbers
        /```[\s\S]*?```/g,     // Code blocks
        /`[^`]+`/g,            // Inline code
    ];
    
    let technicalScore = 0;
    for (const pattern of technicalPatterns) {
        technicalScore += (sample.match(pattern) || []).length;
    }
    
    // Narrative indicators - sentence length analysis
    const sentences = sample.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const avgSentenceLength = sentences.length > 0 
        ? sentences.reduce((a, s) => a + s.length, 0) / sentences.length 
        : 50;
    
    // Header density
    const headerCount = (sample.match(/^#{1,6}\s/gm) || []).length;
    const headerDensity = headerCount / (sample.length / 500); // Headers per 500 chars
    
    logger.debug('Content density analysis', {
        technicalScore,
        avgSentenceLength: Math.round(avgSentenceLength),
        headerDensity: headerDensity.toFixed(2),
    });
    
    // Classification logic
    if (technicalScore > 10 || avgSentenceLength < 50 || headerDensity > 0.8) {
        return ContentDensity.HIGH;
    } else if (avgSentenceLength > 100 && headerDensity < 0.3) {
        return ContentDensity.LOW;
    }
    
    return ContentDensity.STANDARD;
}

// ============================================================
// SPECIAL CONTENT DETECTION
// ============================================================

/**
 * Detect special content regions that should not be split
 * 
 * @param text - Text to analyze
 * @returns Array of special content regions
 */
export function detectSpecialContent(text: string): SpecialContent[] {
    const specials: SpecialContent[] = [];

    // Code blocks (markdown)
    const codeBlockRegex = /```[\s\S]*?```/g;
    let match;
    while ((match = codeBlockRegex.exec(text)) !== null) {
        specials.push({
            type: 'code_block',
            start: match.index,
            end: match.index + match[0].length,
            content: match[0],
            mustKeepTogether: true,
        });
    }

    // Tables (markdown) - look for pipe-formatted tables (more flexible)
    const tableRegex = /\|[^\n]+\|\s*\n\s*\|[-:\s|]+\|\s*\n(?:\s*\|[^\n]+\|\s*\n?)+/g;
    while ((match = tableRegex.exec(text)) !== null) {
        specials.push({
            type: 'table',
            start: match.index,
            end: match.index + match[0].length,
            content: match[0],
            mustKeepTogether: true,
        });
    }

    // FAQ pairs (Q: followed by A:) - more flexible pattern to handle indentation
    const faqRegex = /^\s*(?:Q:|Question:)\s*[^\n?]+\??\s*\n+\s*(?:A:|Answer:)\s*[^\n]+(?:\n(?!\s*(?:Q:|Question:|A:|Answer:))[^\n]+)*/gim;
    while ((match = faqRegex.exec(text)) !== null) {
        specials.push({
            type: 'faq_pair',
            start: match.index,
            end: match.index + match[0].length,
            content: match[0],
            mustKeepTogether: true,
        });
    }

    // Sort by start position
    return specials.sort((a, b) => a.start - b.start);
}

/**
 * Check if a position is inside special content
 * 
 * @param position - Position to check
 * @param specials - Array of special content regions
 * @returns The special content region if inside, null otherwise
 */
function findSpecialContentAt(position: number, specials: SpecialContent[]): SpecialContent | null {
    for (const special of specials) {
        if (position > special.start && position < special.end) {
            return special;
        }
    }
    return null;
}

// ============================================================
// RECURSIVE TEXT SPLITTER
// ============================================================

/**
 * Production Recursive Text Splitter
 * 
 * Splits text into token-bounded chunks while preserving semantic boundaries.
 */
export class RecursiveTextSplitter {
    private tokenizer: ProductionTokenizer;
    private config: AdaptiveSizingConfig;
    private specials: SpecialContent[] = [];

    constructor(config?: Partial<AdaptiveSizingConfig>) {
        this.tokenizer = getTokenizer();
        
        // Default to STANDARD preset, merge with provided config
        this.config = {
            ...SIZING_PRESETS[ContentDensity.STANDARD],
            ...config,
        };

        logger.debug('RecursiveTextSplitter initialized', {
            targetTokens: this.config.targetTokens,
            minTokens: this.config.minTokens,
            maxTokens: this.config.maxTokens,
            overlapTokens: this.config.overlapTokens,
        });
    }

    /**
     * Split text into token-bounded chunks
     * 
     * @param text - Text to split
     * @param detectSpecials - Whether to detect and preserve special content
     * @returns Array of chunks with metadata
     */
    split(text: string, detectSpecials: boolean = true): SplitterChunk[] {
        if (!text || text.trim().length === 0) {
            return [];
        }

        // Detect special content regions
        this.specials = detectSpecials ? detectSpecialContent(text) : [];
        
        if (this.specials.length > 0) {
            logger.debug(`Detected ${this.specials.length} special content regions`, {
                types: this.specials.map(s => s.type),
            });
        }

        // Perform recursive splitting
        const rawChunks: string[] = [];
        this.splitRecursive(text, 0, rawChunks);

        // Apply overlap and create final chunks
        const overlappedChunks = this.applyOverlap(rawChunks);

        // Build result with metadata
        return overlappedChunks.map((chunkText, index) => ({
            text: chunkText,
            index,
            tokens: this.tokenizer.countTokens(chunkText),
            hasOverlap: index > 0,
            metadata: {},
        }));
    }

    /**
     * Recursive splitting algorithm
     */
    private splitRecursive(
        text: string,
        separatorIndex: number,
        chunks: string[]
    ): void {
        // Base case: text fits in target
        const tokenCount = this.tokenizer.countTokens(text);
        
        if (tokenCount <= this.config.maxTokens) {
            // Accept chunk if meets min tokens OR if text has meaningful content (>20 chars)
            if (tokenCount >= this.config.minTokens || text.trim().length > 20) {
                chunks.push(text.trim());
            } else if (chunks.length > 0 && text.trim().length > 0) {
                // Try to merge small chunk with previous
                const lastChunk = chunks[chunks.length - 1];
                const merged = lastChunk + ' ' + text.trim();
                if (this.tokenizer.countTokens(merged) <= this.config.maxTokens) {
                    chunks[chunks.length - 1] = merged;
                } else {
                    // Can't merge, keep small chunk
                    chunks.push(text.trim());
                }
            }
            return;
        }

        // No more separators: force split at token boundary
        if (separatorIndex >= SEPARATOR_HIERARCHY.length) {
            this.forceSplit(text, chunks);
            return;
        }

        const { separator, name } = SEPARATOR_HIERARCHY[separatorIndex];
        const segments = this.splitBySeparator(text, separator);

        // If no splits possible or only one segment, try next separator
        if (segments.length <= 1) {
            this.splitRecursive(text, separatorIndex + 1, chunks);
            return;
        }

        // Process each segment
        let currentBuffer = '';
        
        for (const segment of segments) {
            const trimmedSegment = segment;
            if (!trimmedSegment) continue;

            const combined = currentBuffer 
                ? currentBuffer + (separator || '') + trimmedSegment 
                : trimmedSegment;
            const combinedTokens = this.tokenizer.countTokens(combined);

            if (combinedTokens <= this.config.targetTokens) {
                // Accumulate in buffer
                currentBuffer = combined;
            } else if (this.tokenizer.countTokens(currentBuffer) >= this.config.minTokens) {
                // Flush buffer and start new
                chunks.push(currentBuffer.trim());
                currentBuffer = trimmedSegment;
            } else {
                // Buffer too small
                if (combinedTokens <= this.config.maxTokens) {
                    // Combined still fits in max
                    currentBuffer = combined;
                } else {
                    // Need to split further
                    if (currentBuffer.trim()) {
                        // Flush buffer first
                        const bufferTokens = this.tokenizer.countTokens(currentBuffer);
                        if (bufferTokens >= this.config.minTokens) {
                            chunks.push(currentBuffer.trim());
                        } else {
                            // Recursively split small buffer
                            this.splitRecursive(currentBuffer, separatorIndex + 1, chunks);
                        }
                    }
                    
                    // Check if segment itself is too large
                    const segmentTokens = this.tokenizer.countTokens(trimmedSegment);
                    if (segmentTokens > this.config.maxTokens) {
                        // Recursively split the segment
                        this.splitRecursive(trimmedSegment, separatorIndex + 1, chunks);
                        currentBuffer = '';
                    } else {
                        currentBuffer = trimmedSegment;
                    }
                }
            }
        }

        // Flush remaining buffer
        if (currentBuffer.trim()) {
            const bufferTokens = this.tokenizer.countTokens(currentBuffer);
            if (bufferTokens >= this.config.minTokens) {
                chunks.push(currentBuffer.trim());
            } else if (chunks.length > 0) {
                // Try to merge with previous chunk
                const last = chunks[chunks.length - 1];
                const merged = last + ' ' + currentBuffer.trim();
                if (this.tokenizer.countTokens(merged) <= this.config.maxTokens) {
                    chunks[chunks.length - 1] = merged;
                } else {
                    // Can't merge, keep as separate (better than losing content)
                    chunks.push(currentBuffer.trim());
                }
            } else {
                // No previous chunk, keep even if small
                chunks.push(currentBuffer.trim());
            }
        }
    }

    /**
     * Split text by separator, keeping separator with following segment
     */
    private splitBySeparator(text: string, separator: string): string[] {
        if (!separator) {
            // Empty separator = split by character
            return text.split('');
        }
        
        const parts = text.split(separator);
        
        // Reconstruct with separator attached to following segment
        return parts.map((part, i) => {
            if (i === 0) return part;
            // Keep separator with following text for context
            return separator + part;
        }).filter(p => p.trim().length > 0);
    }

    /**
     * Force split at token boundaries (last resort)
     */
    private forceSplit(text: string, chunks: string[]): void {
        let remaining = text;
        
        while (remaining.trim().length > 0) {
            const [chunk, rest] = this.tokenizer.splitAtTokenBoundary(
                remaining,
                this.config.targetTokens
            );
            
            if (chunk.trim()) {
                chunks.push(chunk.trim());
            }
            
            if (rest === remaining || !rest) {
                // No progress made, avoid infinite loop
                if (remaining.trim() && remaining !== chunk) {
                    chunks.push(remaining.trim());
                }
                break;
            }
            
            remaining = rest;
        }
    }

    /**
     * Apply overlap between consecutive chunks
     */
    private applyOverlap(chunks: string[]): string[] {
        if (chunks.length <= 1 || this.config.overlapTokens <= 0) {
            return chunks;
        }

        const overlapped: string[] = [chunks[0]];

        for (let i = 1; i < chunks.length; i++) {
            const prevChunk = chunks[i - 1];
            const currentChunk = chunks[i];

            // Get overlap text from end of previous chunk
            const overlapText = this.getSemanticOverlap(prevChunk);
            
            if (overlapText && overlapText.trim().length > 0) {
                // Check if current chunk already starts with similar content
                const similarity = this.textSimilarity(
                    overlapText.slice(0, 50).toLowerCase(),
                    currentChunk.slice(0, 50).toLowerCase()
                );
                
                if (similarity < 0.7) {
                    // Not already overlapping, add prefix
                    overlapped.push(overlapText.trim() + ' ' + currentChunk);
                } else {
                    overlapped.push(currentChunk);
                }
            } else {
                overlapped.push(currentChunk);
            }
        }

        return overlapped;
    }

    /**
     * Get overlap text from end of chunk, preferring sentence boundaries
     */
    private getSemanticOverlap(text: string): string {
        const tokens = this.tokenizer.encode(text);
        
        if (tokens.length <= this.config.overlapTokens) {
            return ''; // Chunk too small for overlap
        }

        // Get last N tokens
        const overlapTokens = tokens.slice(-this.config.overlapTokens);
        let overlapText = this.tokenizer.decode(overlapTokens);

        // Find sentence start within overlap
        const sentenceStarts = [
            overlapText.lastIndexOf('. ') + 2,
            overlapText.lastIndexOf('? ') + 2,
            overlapText.lastIndexOf('! ') + 2,
            overlapText.lastIndexOf('\n') + 1,
        ].filter(i => i > 1 && i < overlapText.length * 0.7);

        if (sentenceStarts.length > 0) {
            const bestStart = Math.max(...sentenceStarts);
            overlapText = overlapText.slice(bestStart);
        }

        return overlapText.trim();
    }

    /**
     * Simple word-level text similarity using Jaccard index
     */
    private textSimilarity(a: string, b: string): number {
        const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
        const na = normalize(a);
        const nb = normalize(b);
        
        if (na === nb) return 1;
        if (!na || !nb) return 0;
        
        const wordsA = new Set(na.split(/\s+/));
        const wordsB = new Set(nb.split(/\s+/));
        
        const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
        const union = new Set([...wordsA, ...wordsB]);
        
        return intersection.size / union.size;
    }

    /**
     * Get the current configuration
     */
    getConfig(): AdaptiveSizingConfig {
        return { ...this.config };
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<AdaptiveSizingConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

// ============================================================
// FACTORY FUNCTIONS
// ============================================================

/**
 * Create a splitter with auto-detected density
 * 
 * @param text - Sample text to analyze for density
 * @returns Configured RecursiveTextSplitter
 */
export function createSplitterForContent(text: string): RecursiveTextSplitter {
    const density = detectContentDensity(text);
    const config = SIZING_PRESETS[density];
    
    logger.info(`Auto-detected content density: ${density}`, {
        targetTokens: config.targetTokens,
        overlapTokens: config.overlapTokens,
    });
    
    return new RecursiveTextSplitter(config);
}

/**
 * Create a splitter with specific density preset
 * 
 * @param density - Content density preset
 * @returns Configured RecursiveTextSplitter
 */
export function createSplitterWithDensity(density: ContentDensity): RecursiveTextSplitter {
    return new RecursiveTextSplitter(SIZING_PRESETS[density]);
}

// Singleton instance
let splitterInstance: RecursiveTextSplitter | null = null;

/**
 * Get default splitter singleton (STANDARD density)
 */
export function getDefaultSplitter(): RecursiveTextSplitter {
    if (!splitterInstance) {
        splitterInstance = new RecursiveTextSplitter();
    }
    return splitterInstance;
}

export default RecursiveTextSplitter;
