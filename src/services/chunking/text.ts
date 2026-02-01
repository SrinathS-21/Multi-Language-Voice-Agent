/**
 * Chunking Strategies
 * 
 * Plain text chunking strategy implementations for different content types.
 * Each strategy is optimized for specific patterns (FAQ, items, sections, etc.)
 */

import { logger } from '../../core/logging.js';
import { getTokenizer } from './tokenizer.js';
import { 
    RecursiveTextSplitter,
    ContentDensity,
    createSplitterForContent,
} from './splitter.js';

import { 
    ChunkingStrategy, 
    Chunk, 
    ChunkingConfig,
    DEFAULT_CHUNKING_CONFIG,
} from './types.js';
import { decodeHtmlEntities, cleanText } from './utilities.js';
import { formatChunkWithContext } from './context.js';

/**
 * Detect optimal chunking strategy based on content patterns
 */
export function detectOptimalStrategy(text: string): ChunkingStrategy {
    // Check for FAQ patterns (Q: A: format) - handle indentation
    const faqPattern = /^\s*(?:Q:|Question:)\s*.+[\n\r]+\s*(?:A:|Answer:)\s*.+/im;
    if (faqPattern.test(text)) {
        return ChunkingStrategy.FAQ;
    }
    
    // Check for markdown headers
    const headerCount = (text.match(/^#{1,6}\s+.+$/gm) || []).length;
    if (headerCount >= 3) {
        return ChunkingStrategy.SECTION;
    }
    
    // Check for list/item patterns
    const listPattern = /^[-•*]\s+.+$/gm;
    const listCount = (text.match(listPattern) || []).length;
    if (listCount >= 5) {
        return ChunkingStrategy.ITEM;
    }
    
    // Check for code blocks
    const codePattern = /```[\s\S]+?```/g;
    if (codePattern.test(text)) {
        return ChunkingStrategy.SENTENCE; // Smaller chunks for code-heavy content
    }
    
    // Default to paragraph
    return ChunkingStrategy.PARAGRAPH;
}

/**
 * Check if line is a category header (e.g., "# Category Name" or "CATEGORY NAME:")
 */
export function isCategoryHeader(line: string): boolean {
    const trimmed = line.trim();
    
    // Markdown header
    if (/^#{1,3}\s+.+$/.test(trimmed)) return true;
    
    // ALL CAPS heading with optional colon
    if (/^[A-Z][A-Z\s]{2,}:?$/.test(trimmed) && trimmed.length < 50) return true;
    
    // Title Case heading ending with colon
    if (/^[A-Z][a-zA-Z\s]+:$/.test(trimmed) && trimmed.length < 50) return true;
    
    return false;
}

/**
 * Check if line starts an item (bullet point or numbered)
 */
export function isItemStart(line: string): boolean {
    const trimmed = line.trim();
    
    // Bullet points: -, *, •
    if (/^[-•*]\s+.+/.test(trimmed)) return true;
    
    // Numbered: 1., 1), (1), a., a)
    if (/^(?:\d+[.)]\s+|\([a-z0-9]+\)\s+|[a-z][.)]\s+)/i.test(trimmed)) return true;
    
    return false;
}

/**
 * Create a chunk object with proper metadata and token counting
 */
export function createChunk(
    text: string,
    index: number,
    sectionPath: string[],
    parentSummary: string,
    metadata: Record<string, any>
): Chunk {
    // Clean the text (HTML entities, etc.)
    const cleanedText = decodeHtmlEntities(text.trim());
    
    // Always embed section context in the text
    const enrichedText = formatChunkWithContext(cleanedText, sectionPath, parentSummary);
    
    // Count tokens using production tokenizer
    const tokenizer = getTokenizer();
    const tokenCount = tokenizer.countTokens(enrichedText);
    
    return {
        text: enrichedText,
        chunkIndex: index,
        tokenCount,
        metadata: {
            ...metadata,
            chunkIndex: index,
            charCount: enrichedText.length,
            tokenCount,
        },
    };
}

/**
 * Create a simple chunk object with token counting (no context embedding)
 */
export function createSimpleChunk(
    text: string,
    index: number,
    metadata: Record<string, any>
): Chunk {
    const tokenizer = getTokenizer();
    const tokenCount = tokenizer.countTokens(text);
    
    return {
        text,
        chunkIndex: index,
        tokenCount,
        metadata: {
            ...metadata,
            chunkIndex: index,
            charCount: text.length,
            tokenCount,
        },
    };
}

/**
 * FAQ-style chunking (Q&A pairs)
 */
export function chunkFaq(
    text: string,
    metadata: Record<string, any>,
    config: ChunkingConfig
): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    // Pattern for Q&A pairs (flexible whitespace)
    const qaPairPattern = /(?:^|\n)\s*(?:Q:|Question:)\s*(.+?)(?:\n)\s*(?:A:|Answer:)\s*([\s\S]+?)(?=(?:\n\s*(?:Q:|Question:))|$)/gi;

    let match;
    while ((match = qaPairPattern.exec(text)) !== null) {
        const question = match[1].trim();
        const answer = match[2].trim();

        if (question && answer) {
            const chunkText = `Q: ${question}\nA: ${answer}`;
            const sectionPath = metadata.sectionPath || 
                (metadata.category ? [metadata.category.replace(/^#\s*/, '')] : []);
            const parentSummary = metadata.parentHeading || metadata.header || '';
            
            chunks.push(createChunk(
                chunkText,
                chunkIndex++,
                sectionPath,
                parentSummary,
                {
                    ...metadata,
                    type: 'faq',
                    question,
                    answerLength: answer.length,
                }
            ));
        }
    }

    // Fallback: If no Q&A pairs found, try paragraph-based chunking
    if (chunks.length === 0) {
        logger.debug('No FAQ patterns found, falling back to paragraph chunking');
        return chunkParagraphs(text, metadata, config);
    }

    logger.info(`FAQ chunking: ${chunks.length} Q&A pairs`);
    return chunks;
}

/**
 * Item-based chunking (list items, bullets, numbered items)
 */
export function chunkItems(
    text: string,
    metadata: Record<string, any>,
    config: ChunkingConfig
): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    const lines = text.split('\n');
    let currentCategory = '';
    let currentItem = '';
    let itemLines: string[] = [];

    const saveItem = () => {
        if (itemLines.length === 0) return;

        const itemText = itemLines.join('\n').trim();
        if (itemText.length < config.minChunkSize) {
            // Accumulate small items
            currentItem += (currentItem ? '\n' : '') + itemText;
            if (currentItem.length >= config.minChunkSize) {
                const sectionPath = currentCategory 
                    ? [currentCategory.replace(/^#\s*/, '')] 
                    : (metadata.sectionPath || []);
                const parentSummary = metadata.parentHeading || metadata.header || '';
                
                chunks.push(createChunk(
                    currentItem,
                    chunkIndex++,
                    sectionPath,
                    parentSummary,
                    {
                        ...metadata,
                        type: 'item',
                        category: currentCategory || undefined,
                    }
                ));
                currentItem = '';
            }
        } else {
            // Flush any accumulated small items first
            if (currentItem) {
                const sectionPath = currentCategory 
                    ? [currentCategory.replace(/^#\s*/, '')] 
                    : (metadata.sectionPath || []);
                const parentSummary = metadata.parentHeading || metadata.header || '';
                
                chunks.push(createChunk(
                    currentItem,
                    chunkIndex++,
                    sectionPath,
                    parentSummary,
                    {
                        ...metadata,
                        type: 'item',
                        category: currentCategory || undefined,
                    }
                ));
                currentItem = '';
            }

            const sectionPath = currentCategory 
                ? [currentCategory.replace(/^#\s*/, '')] 
                : (metadata.sectionPath || []);
            const parentSummary = metadata.parentHeading || metadata.header || '';
            
            chunks.push(createChunk(
                itemText,
                chunkIndex++,
                sectionPath,
                parentSummary,
                {
                    ...metadata,
                    type: 'item',
                    category: currentCategory || undefined,
                }
            ));
        }
        itemLines = [];
    };

    for (const line of lines) {
        // Check for category headers
        if (isCategoryHeader(line)) {
            saveItem();
            currentCategory = line.replace(/^#+\s*/, '').trim();
            continue;
        }

        // Check for item starts
        if (isItemStart(line)) {
            saveItem();
            itemLines.push(line);
        } else if (itemLines.length > 0) {
            // Continuation of current item
            itemLines.push(line);
        } else if (line.trim()) {
            // Non-item text, treat as paragraph
            itemLines.push(line);
        }
    }

    // Save last item
    saveItem();

    // Save any remaining accumulated items
    if (currentItem) {
        const sectionPath = currentCategory 
            ? [currentCategory.replace(/^#\s*/, '')] 
            : (metadata.sectionPath || []);
        const parentSummary = metadata.parentHeading || metadata.header || '';
        
        chunks.push(createChunk(
            currentItem,
            chunkIndex++,
            sectionPath,
            parentSummary,
            {
                ...metadata,
                type: 'item',
                category: currentCategory || undefined,
            }
        ));
    }

    logger.info(`Item chunking: ${chunks.length} items`);
    return chunks;
}

/**
 * Section-based chunking (by markdown headers)
 */
export function chunkBySections(
    text: string,
    metadata: Record<string, any>,
    config: ChunkingConfig
): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    // Split by markdown headers (H1-H3)
    const sectionPattern = /(?=^#{1,3}\s+.+$)/gm;
    const sections = text.split(sectionPattern);

    for (const section of sections) {
        const trimmed = section.trim();
        if (!trimmed) continue;

        // Extract header
        const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)$/m);
        const header = headerMatch ? headerMatch[2].trim() : '';
        const level = headerMatch ? headerMatch[1].length : 0;

        // Get content after header
        const content = headerMatch
            ? trimmed.substring(headerMatch[0].length).trim()
            : trimmed;

        if (content.length < config.minChunkSize) continue;

        const sectionPath = header ? [header] : (metadata.sectionPath || []);
        const parentSummary = metadata.parentHeading || metadata.header || '';

        chunks.push(createChunk(
            content,
            chunkIndex++,
            sectionPath,
            parentSummary,
            {
                ...metadata,
                type: 'section',
                sectionHeader: header,
                headerLevel: level,
            }
        ));
    }

    // Fallback to paragraph chunking if no sections found
    if (chunks.length === 0) {
        logger.debug('No section headers found, falling back to paragraph chunking');
        return chunkParagraphs(text, metadata, config);
    }

    logger.info(`Section chunking: ${chunks.length} sections`);
    return chunks;
}

/**
 * Sentence-based chunking with token control
 */
export function chunkSentences(
    text: string,
    metadata: Record<string, any>,
    config: ChunkingConfig
): Chunk[] {
    if (config.useTokenSizing) {
        return chunkSentencesTokenBased(text, metadata, config);
    }
    return chunkSentencesCharBased(text, metadata, config);
}

/**
 * Token-based sentence chunking using RecursiveTextSplitter
 */
function chunkSentencesTokenBased(
    text: string,
    metadata: Record<string, any>,
    config: ChunkingConfig
): Chunk[] {
    // Use aggressive splitting for sentence-level chunking
    const splitter = new RecursiveTextSplitter({
        targetTokens: Math.floor(config.targetTokens! * 0.6), // Smaller target
        minTokens: Math.floor(config.minTokens! * 0.5),
        maxTokens: config.targetTokens!, // Max is normal target
        overlapTokens: Math.floor(config.overlapTokens! * 0.5),
    });
    
    const splitterChunks = splitter.split(text);
    
    // Convert to Chunk objects
    const chunks: Chunk[] = splitterChunks.map((chunk, index) => {
        const sectionPath = metadata.sectionPath || 
            (metadata.category ? [metadata.category.replace(/^#\s*/, '')] : []);
        const parentSummary = metadata.parentHeading || metadata.header || '';
        
        return createChunk(
            chunk.text,
            index,
            sectionPath,
            parentSummary,
            {
                ...metadata,
                type: 'sentence',
                originalTokenCount: chunk.tokens,
                hasOverlap: chunk.hasOverlap,
            }
        );
    });

    logger.info(`Sentence chunking (token-based): ${chunks.length} chunks`);
    return chunks;
}

/**
 * Character-based sentence chunking
 */
function chunkSentencesCharBased(
    text: string,
    metadata: Record<string, any>,
    config: ChunkingConfig
): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    // Split by sentence endings
    const sentencePattern = /[.!?]+[\s\n]+/g;
    const sentences = text.split(sentencePattern);

    let currentChunk = '';
    const sectionPath = metadata.sectionPath || 
        (metadata.category ? [metadata.category.replace(/^#\s*/, '')] : []);
    const parentSummary = metadata.parentHeading || metadata.header || '';

    for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        // Restore sentence ending
        const sentenceWithPeriod = trimmed.endsWith('.') || trimmed.endsWith('!') || trimmed.endsWith('?')
            ? trimmed
            : trimmed + '.';

        if (currentChunk.length + sentenceWithPeriod.length > config.chunkSize) {
            if (currentChunk.length >= config.minChunkSize) {
                chunks.push(createChunk(
                    currentChunk,
                    chunkIndex++,
                    sectionPath,
                    parentSummary,
                    { ...metadata, type: 'sentence' }
                ));
            }
            currentChunk = sentenceWithPeriod;
        } else {
            currentChunk += (currentChunk ? ' ' : '') + sentenceWithPeriod;
        }
    }

    // Add remaining chunk
    if (currentChunk.length >= config.minChunkSize) {
        chunks.push(createChunk(
            currentChunk,
            chunkIndex++,
            sectionPath,
            parentSummary,
            { ...metadata, type: 'sentence' }
        ));
    }

    logger.info(`Sentence chunking (char-based): ${chunks.length} chunks`);
    return chunks;
}

/**
 * Fixed-size chunking with overlap
 */
export function chunkFixed(
    text: string,
    metadata: Record<string, any>,
    config: ChunkingConfig
): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    const chunkSize = config.chunkSize;
    const overlap = config.chunkOverlap;
    const step = chunkSize - overlap;

    const sectionPath = metadata.sectionPath || 
        (metadata.category ? [metadata.category.replace(/^#\s*/, '')] : []);
    const parentSummary = metadata.parentHeading || metadata.header || '';

    for (let i = 0; i < text.length; i += step) {
        const chunk = text.substring(i, i + chunkSize);
        if (chunk.length < config.minChunkSize) continue;

        chunks.push(createChunk(
            chunk,
            chunkIndex++,
            sectionPath,
            parentSummary,
            {
                ...metadata,
                type: 'fixed',
                startPos: i,
                endPos: i + chunk.length,
            }
        ));
    }

    logger.info(`Fixed chunking: ${chunks.length} chunks`);
    return chunks;
}

/**
 * Standard paragraph-based chunking
 */
export function chunkParagraphs(
    text: string,
    metadata: Record<string, any>,
    config: ChunkingConfig
): Chunk[] {
    if (config.useTokenSizing) {
        return chunkParagraphsTokenBased(text, metadata, config);
    }
    return chunkParagraphsCharBased(text, metadata, config);
}

/**
 * Token-based paragraph chunking using RecursiveTextSplitter
 */
function chunkParagraphsTokenBased(
    text: string,
    metadata: Record<string, any>,
    config: ChunkingConfig
): Chunk[] {
    // Detect content density and create appropriate splitter
    const splitter = createSplitterForContent(text);
    const splitterChunks = splitter.split(text);
    
    // Convert to Chunk objects
    const chunks: Chunk[] = splitterChunks.map((chunk, index) => {
        const sectionPath = metadata.sectionPath || 
            (metadata.category ? [metadata.category.replace(/^#\s*/, '')] : []);
        const parentSummary = metadata.parentHeading || metadata.header || '';
        
        return createChunk(
            chunk.text,
            index,
            sectionPath,
            parentSummary,
            {
                ...metadata,
                type: 'paragraph',
                originalTokenCount: chunk.tokens,
                hasOverlap: chunk.hasOverlap,
            }
        );
    });

    logger.info(`Paragraph chunking (token-based): ${chunks.length} chunks`);
    return chunks;
}

/**
 * Character-based paragraph chunking
 */
function chunkParagraphsCharBased(
    text: string,
    metadata: Record<string, any>,
    config: ChunkingConfig
): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = 0;

    // Split by double newlines (paragraphs)
    const paragraphs = text.split(/\n\n+/);

    let currentChunk = '';
    const sectionPath = metadata.sectionPath || 
        (metadata.category ? [metadata.category.replace(/^#\s*/, '')] : []);
    const parentSummary = metadata.parentHeading || metadata.header || '';

    for (const para of paragraphs) {
        const trimmed = para.trim();
        if (!trimmed) continue;

        // If adding this paragraph would exceed chunk size
        if (currentChunk.length + trimmed.length + 2 > config.chunkSize) {
            // Save current chunk if it's big enough
            if (currentChunk.length >= config.minChunkSize) {
                chunks.push(createChunk(
                    currentChunk,
                    chunkIndex++,
                    sectionPath,
                    parentSummary,
                    { ...metadata, type: 'paragraph' }
                ));
            }

            // Start new chunk
            if (trimmed.length > config.chunkSize) {
                // Paragraph is too long, split it
                let remaining = trimmed;
                while (remaining.length > 0) {
                    const chunk = remaining.substring(0, config.chunkSize);
                    const lastSpace = chunk.lastIndexOf(' ');
                    const splitPoint = lastSpace > config.chunkSize * 0.5 ? lastSpace : config.chunkSize;

                    const chunkText = remaining.substring(0, splitPoint);
                    remaining = remaining.substring(splitPoint).trim();

                    if (chunkText.length >= config.minChunkSize) {
                        chunks.push(createChunk(
                            chunkText,
                            chunkIndex++,
                            sectionPath,
                            parentSummary,
                            { ...metadata, type: 'paragraph' }
                        ));
                    }
                }
                currentChunk = '';
            } else {
                currentChunk = trimmed;
            }
        } else {
            // Add to current chunk
            currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
        }
    }

    // Add remaining chunk
    if (currentChunk.length >= config.minChunkSize) {
        chunks.push(createChunk(
            currentChunk,
            chunkIndex++,
            sectionPath,
            parentSummary,
            { ...metadata, type: 'paragraph' }
        ));
    }

    logger.info(`Paragraph chunking (char-based): ${chunks.length} chunks`);
    return chunks;
}

/**
 * Chunk text using a specific RecursiveTextSplitter instance
 */
export function chunkWithSplitter(
    text: string,
    metadata: Record<string, any>,
    splitter: RecursiveTextSplitter
): Chunk[] {
    const splitterChunks = splitter.split(text);
    
    // Convert splitter chunks to service chunks with full metadata
    const chunks: Chunk[] = splitterChunks.map((chunk, index) => {
        const sectionPath: string[] = metadata.sectionPath || 
            (metadata.category ? [metadata.category.replace(/^#\s*/, '')] : []);
        const parentSummary = metadata.parentHeading || metadata.header || '';
        const enrichedText = formatChunkWithContext(chunk.text, sectionPath, parentSummary);
        const tokenizer = getTokenizer();
        const tokenCount = tokenizer.countTokens(enrichedText);
        
        return {
            text: enrichedText,
            chunkIndex: index,
            tokenCount,
            metadata: {
                ...metadata,
                chunkIndex: index,
                charCount: enrichedText.length,
                tokenCount,
                originalTokenCount: chunk.tokens,
                hasOverlap: chunk.hasOverlap,
                strategy: 'auto-detected',
            },
        };
    });

    logger.info(`Splitter chunking: ${chunks.length} chunks`);
    return chunks;
}
