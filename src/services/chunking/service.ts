/**
 * Chunking Service
 * 
 * Main chunking service class with multiple strategies for optimal
 * knowledge retrieval. Supports both character-based (legacy) and
 * token-based (production) sizing.
 * 
 * Based on PARSER_ARCHITECTURE.md - 4-Layer Pipeline:
 * Layer 1: Document Parsing (direct text for .txt, LlamaParse for PDF/DOCX)
 * Layer 2: Content Analysis (ContentType classification)
 * Layer 3: Parser Selection (strategy routing)
 * Layer 4: Context Embedding (pre-embedded in text)
 */

import { logger } from '../../core/logging.js';
import { StructuredElement } from '../document-parser.js';
import { getTokenizer } from './tokenizer.js';
import { 
    RecursiveTextSplitter, 
    ContentDensity, 
    detectContentDensity,
    createSplitterForContent,
} from './splitter.js';

import { 
    ChunkingStrategy, 
    ContentType, 
    Chunk, 
    ChunkingConfig,
    DEFAULT_CHUNKING_CONFIG,
    AutoChunkResult,
} from './types.js';
import { cleanText } from './utilities.js';

// Import strategy functions
import {
    detectOptimalStrategy,
    chunkFaq,
    chunkItems,
    chunkBySections,
    chunkSentences,
    chunkFixed,
    chunkParagraphs,
    chunkWithSplitter,
    createChunk,
    createSimpleChunk,
} from './text.js';

// Import structured document chunking
import {
    chunkStructuredDocument,
    chunkDocumentIntelligent,
} from './structured.js';

/**
 * Analyze parsed document elements to determine content type
 * 
 * Classification rules:
 * - STRUCTURED: >30% tables OR >5 unique heading levels
 * - NARRATIVE: >70% paragraphs
 * - MIXED: Everything else
 */
export function analyzeContentType(
    elements: StructuredElement[]
): ContentType {
    if (!elements || elements.length === 0) {
        return ContentType.NARRATIVE;
    }

    const totalElements = elements.length;

    // Count element types
    const tableCount = elements.filter(e => e.type === 'table').length;
    const paragraphCount = elements.filter(e => e.type === 'paragraph').length;
    const headingLevels = new Set(
        elements
            .filter(e => e.type === 'heading' && e.level)
            .map(e => e.level)
    );

    // Calculate percentages
    const tablePercentage = (tableCount / totalElements) * 100;
    const paragraphPercentage = (paragraphCount / totalElements) * 100;

    logger.debug(
        `Content analysis: ${totalElements} elements - ` +
        `tables: ${tablePercentage.toFixed(1)}%, ` +
        `paragraphs: ${paragraphPercentage.toFixed(1)}%, ` +
        `heading levels: ${headingLevels.size}`
    );

    // Apply classification rules
    if (tablePercentage > 30 || headingLevels.size > 5) {
        return ContentType.STRUCTURED;
    } else if (paragraphPercentage > 70) {
        return ContentType.NARRATIVE;
    } else {
        return ContentType.MIXED;
    }
}

/**
 * Text Chunking Service class
 * 
 * Now supports both character-based (legacy) and token-based (production) sizing.
 * Token-based sizing is enabled by default and recommended for optimal RAG performance.
 */
export class ChunkingService {
    private config: ChunkingConfig;
    private tokenSplitter: RecursiveTextSplitter | null = null;

    /**
     * Initialize chunking service
     */
    constructor(config?: Partial<ChunkingConfig>) {
        this.config = {
            ...DEFAULT_CHUNKING_CONFIG,
            ...config,
        };

        // Initialize token-based splitter if enabled
        if (this.config.useTokenSizing) {
            this.tokenSplitter = new RecursiveTextSplitter({
                targetTokens: this.config.targetTokens!,
                minTokens: this.config.minTokens!,
                maxTokens: this.config.maxTokens!,
                overlapTokens: this.config.overlapTokens!,
            });
            logger.info(
                `ChunkingService initialized with TOKEN-based sizing: ` +
                `target=${this.config.targetTokens}, min=${this.config.minTokens}, ` +
                `max=${this.config.maxTokens}, overlap=${this.config.overlapTokens}`
            );
        } else {
            logger.info(
                `ChunkingService initialized with CHAR-based sizing: ` +
                `chunkSize=${this.config.chunkSize}, overlap=${this.config.chunkOverlap}, ` +
                `minSize=${this.config.minChunkSize}`
            );
        }
    }

    /**
     * Get the token-based splitter, creating if needed
     */
    private getSplitter(): RecursiveTextSplitter {
        if (!this.tokenSplitter) {
            this.tokenSplitter = new RecursiveTextSplitter({
                targetTokens: this.config.targetTokens!,
                minTokens: this.config.minTokens!,
                maxTokens: this.config.maxTokens!,
                overlapTokens: this.config.overlapTokens!,
            });
        }
        return this.tokenSplitter;
    }

    /**
     * Clean text by removing extra whitespace and decoding HTML entities
     */
    cleanText(text: string): string {
        return cleanText(text);
    }

    /**
     * Auto-detect content type and select optimal chunking strategy
     */
    autoChunkText(
        text: string,
        metadata: Record<string, any> = {}
    ): AutoChunkResult {
        if (!text || !text.trim()) {
            return { chunks: [], strategy: ChunkingStrategy.PARAGRAPH, density: ContentDensity.STANDARD };
        }

        const cleanedText = this.cleanText(text);
        
        // Detect content density
        const density = detectContentDensity(cleanedText);
        
        // Detect content patterns to select strategy
        const strategy = detectOptimalStrategy(cleanedText);
        
        // Create appropriate splitter based on density
        const splitter = createSplitterForContent(cleanedText);
        
        logger.info(`Auto-detected: strategy=${strategy}, density=${density}`);
        
        // Use detected strategy with density-tuned splitter
        let chunks: Chunk[];
        
        switch (strategy) {
            case ChunkingStrategy.FAQ:
                chunks = chunkFaq(cleanedText, metadata, this.config);
                break;
            case ChunkingStrategy.SECTION:
                chunks = chunkBySections(cleanedText, metadata, this.config);
                break;
            case ChunkingStrategy.ITEM:
                chunks = chunkItems(cleanedText, metadata, this.config);
                break;
            case ChunkingStrategy.SENTENCE:
                chunks = chunkSentences(cleanedText, metadata, this.config);
                break;
            default:
                // Use density-tuned splitter for paragraph chunking
                chunks = chunkWithSplitter(cleanedText, metadata, splitter);
        }
        
        return { chunks, strategy, density };
    }

    /**
     * Chunk text using specified strategy
     */
    chunkText(
        text: string,
        metadata: Record<string, any> = {},
        strategy: ChunkingStrategy = ChunkingStrategy.PARAGRAPH
    ): Chunk[] {
        if (!text || !text.trim()) {
            return [];
        }

        // Clean the text
        const cleanedText = this.cleanText(text);

        // Select strategy
        switch (strategy) {
            case ChunkingStrategy.FAQ:
                return chunkFaq(cleanedText, metadata, this.config);
            case ChunkingStrategy.ITEM:
                return chunkItems(cleanedText, metadata, this.config);
            case ChunkingStrategy.SECTION:
                return chunkBySections(cleanedText, metadata, this.config);
            case ChunkingStrategy.SENTENCE:
                return chunkSentences(cleanedText, metadata, this.config);
            case ChunkingStrategy.FIXED:
                return chunkFixed(cleanedText, metadata, this.config);
            default:
                return chunkParagraphs(cleanedText, metadata, this.config);
        }
    }

    /**
     * Helper to create a chunk object with proper metadata
     * Delegating to the extracted function for backward compatibility
     */
    private createChunk(
        text: string,
        index: number,
        sectionPath: string[],
        parentSummary: string,
        metadata: Record<string, any>
    ): Chunk {
        return createChunk(text, index, sectionPath, parentSummary, metadata);
    }

    /**
     * Helper to create a simple chunk object with token counting
     * Delegating to the extracted function for backward compatibility
     */
    private createSimpleChunk(
        text: string,
        index: number,
        metadata: Record<string, any>
    ): Chunk {
        return createSimpleChunk(text, index, metadata);
    }

    /**
     * Chunk structured document with pre-embedded hierarchical context
     */
    chunkStructuredDocument(
        elements: StructuredElement[],
        contentType: ContentType,
        sectionHierarchy: string[] = []
    ): Chunk[] {
        return chunkStructuredDocument(elements, contentType, sectionHierarchy, this.config);
    }

    /**
     * Chunk document using intelligent strategy selection
     */
    chunkDocumentIntelligent(
        elements: StructuredElement[],
        contentType: ContentType,
        sectionHierarchy: string[] = [],
        suggestedStrategy?: ChunkingStrategy
    ): Chunk[] {
        return chunkDocumentIntelligent(
            elements,
            contentType,
            sectionHierarchy,
            suggestedStrategy,
            this.config,
            this.chunkText.bind(this)
        );
    }
}

// Singleton instance
let chunkingServiceInstance: ChunkingService | null = null;

/**
 * Get the chunking service singleton
 */
export function getChunkingService(config?: Partial<ChunkingConfig>): ChunkingService {
    if (!chunkingServiceInstance) {
        chunkingServiceInstance = new ChunkingService(config);
    }
    return chunkingServiceInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetChunkingService(): void {
    chunkingServiceInstance = null;
}
