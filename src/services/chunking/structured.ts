/**
 * Structured Document Chunking
 * 
 * Chunking strategies for structured documents (parsed by document-parser).
 * Handles pre-parsed StructuredElement arrays from LlamaParse, PDF extraction, etc.
 */

import { logger } from '../../core/logging.js';
import { StructuredElement } from '../document-parser.js';
import { getTokenizer } from './tokenizer.js';

import { 
    ChunkingStrategy, 
    ContentType, 
    Chunk, 
    ChunkingConfig,
} from './types.js';
import { decodeHtmlEntities, cleanTableText } from './utilities.js';
import { formatChunkWithContext } from './context.js';
import { extractStructuredFields } from './fields.js';
import { createSimpleChunk, chunkParagraphs } from './text.js';

/**
 * Detect FAQ pattern in structured elements
 */
export function detectFaqPattern(elements: StructuredElement[]): boolean {
    if (elements.length < 10) return false; // Need reasonable sample size
    
    let questionCount = 0;
    let answerCount = 0;
    let prevWasQuestion = false;
    
    for (const element of elements) {
        const text = element.text?.trim() || '';
        
        if (element.type === 'heading' && text.endsWith('?')) {
            questionCount++;
            prevWasQuestion = true;
        } else if (element.type === 'paragraph' && prevWasQuestion && text.length > 10) {
            answerCount++;
            prevWasQuestion = false;
        } else {
            prevWasQuestion = false;
        }
    }
    
    // FAQ if we have at least 10 Q&A pairs and good alternation
    const hasGoodPattern = questionCount >= 10 && answerCount >= questionCount * 0.5;
    logger.debug(`FAQ detection: ${questionCount} questions, ${answerCount} answers, pattern=${hasGoodPattern}`);
    return hasGoodPattern;
}

/**
 * Generic section header detection - NOT biased to any domain
 */
export function isSectionHeader(text: string): boolean {
    const trimmed = text.trim();
    
    // 1. Never skip if it ends with ? (it's a question)
    if (trimmed.endsWith('?')) return false;
    
    // 2. Never skip if it starts with question words
    if (/^(What|How|Why|When|Where|Who|Which|Can|Is|Are|Do|Does|Should|Would|Could|Will)/i.test(trimmed)) {
        return false;
    }
    
    // 3. ALL CAPS text (3+ chars, no lowercase) = section header
    if (trimmed.length >= 3 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
        return true;
    }
    
    // 4. Generic document structure patterns (universal)
    const structuralPatterns = [
        /^(SECTION|CHAPTER|PART|APPENDIX)\s*\d*/i,
        /^(FAQ|FAQS)$/i,
        /^FREQUENTLY\s+ASKED\s+QUESTIONS?$/i,
        /^(DISCLAIMER|NOTICE|WARNING)S?$/i,
        /^TABLE\s+OF\s+CONTENTS?$/i,
        /^(INTRODUCTION|CONCLUSION|SUMMARY)$/i,
    ];
    
    if (structuralPatterns.some(p => p.test(trimmed))) {
        return true;
    }
    
    // 5. Title Case multi-word phrases (likely section headers)
    const words = trimmed.split(/\s+/);
    if (words.length >= 3 && words.length <= 6) {
        const lowercaseAllowed = ['and', 'or', 'of', 'the', 'in', 'on', 'at', 'to', 'for', 'with'];
        
        const allCapitalized = words.every(w => 
            /^[A-Z]/.test(w) || lowercaseAllowed.includes(w.toLowerCase())
        );
        
        if (allCapitalized) {
            const hasVerbConjugation = words.some(w => 
                /ing$|ed$/.test(w.toLowerCase()) && w.length > 5
            );
            
            if (!hasVerbConjugation) {
                return true;
            }
        }
    }
    
    // 6. Very short text (1-2 words) - ONLY if ALL CAPS
    if (words.length <= 2 && trimmed.length < 30 && !/\?/.test(trimmed)) {
        if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Chunk FAQ structured elements as Q&A pairs
 */
export function chunkFaqStructured(
    elements: StructuredElement[],
    contentType: ContentType,
    sectionHierarchy: string[] = [],
    config: ChunkingConfig
): Chunk[] {
    const chunks: Chunk[] = [];
    let chunkIndex = 0;
    let currentSection: string[] = [...sectionHierarchy];
    
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        
        if (element.type !== 'heading' || !element.text) continue;
        
        const headingText = element.text.trim();
        
        // Skip section headers
        if (isSectionHeader(headingText)) {
            const level = element.level ?? 1;
            currentSection = [
                ...sectionHierarchy.slice(0, Math.max(0, level - 1)),
                headingText.replace(/^#+\s*/, '').trim()
            ];
            continue;
        }
        
        // Look for answer paragraph
        for (let j = i + 1; j < elements.length; j++) {
            const nextElement = elements[j];
            
            // Skip section headers
            if (nextElement.type === 'heading' && isSectionHeader(nextElement.text?.trim() || '')) {
                continue;
            }
            
            if (nextElement.type === 'paragraph' && nextElement.text?.trim()) {
                const question = decodeHtmlEntities(headingText);
                const answer = decodeHtmlEntities(nextElement.text.trim());
                
                // Format question - add "?" if missing
                let formattedQuestion = question;
                if (!formattedQuestion.endsWith('?')) {
                    const looksLikeQuestion = /^(What|How|Why|When|Where|Who|Which|Can|Is|Are|Do|Does|Should|Would|Could)/i.test(question);
                    if (!looksLikeQuestion) {
                        formattedQuestion = `What is ${question.toLowerCase()}?`;
                    } else {
                        formattedQuestion = question + '?';
                    }
                }
                
                const chunkText = `Q: ${formattedQuestion}\nA: ${answer}`;
                const enrichedText = formatChunkWithContext(
                    chunkText,
                    currentSection,
                    ''
                );
                
                chunks.push(createSimpleChunk(
                    enrichedText,
                    chunkIndex++,
                    {
                        type: 'faq',
                        page: element.page || nextElement.page,
                        section: currentSection.join(' > '),
                        sectionPath: currentSection,
                        question: formattedQuestion,
                        originalHeading: headingText,
                        contentType,
                    }
                ));
                break;
            }
            
            // Stop if we hit another heading
            if (nextElement.type === 'heading') {
                break;
            }
        }
    }
    
    logger.info(`FAQ structured chunking: ${chunks.length} Q&A pairs`);
    return chunks;
}

/**
 * Chunk structured document with pre-embedded hierarchical context
 */
export function chunkStructuredDocument(
    elements: StructuredElement[],
    contentType: ContentType,
    sectionHierarchy: string[] = [],
    config: ChunkingConfig
): Chunk[] {
    if (!elements || elements.length === 0) {
        return [];
    }

    // SPECIAL CASE: Detect FAQ pattern
    const isFaqPattern = detectFaqPattern(elements);
    if (isFaqPattern) {
        logger.info('FAQ pattern detected: chunking as Q&A pairs');
        return chunkFaqStructured(elements, contentType, sectionHierarchy, config);
    }

    const chunks: Chunk[] = [];
    let chunkIndex = 0;
    let currentSection: string[] = [...sectionHierarchy];
    
    // Buffer for accumulating small elements
    let smallElementsBuffer: StructuredElement[] = [];
    let bufferSection: string[] = [];

    const flushSmallElements = () => {
        if (smallElementsBuffer.length === 0) return;
        
        // Combine small elements into one chunk
        const combinedText = smallElementsBuffer
            .map(el => decodeHtmlEntities(el.text || ''))
            .filter(text => text.trim())
            .join('. ');
        
        if (combinedText.length >= config.minChunkSize || smallElementsBuffer.length >= 3) {
            const enrichedText = formatChunkWithContext(
                combinedText,
                bufferSection.length > 0 ? bufferSection : currentSection,
                smallElementsBuffer[0].parentHeading || ''
            );
            
            chunks.push(createSimpleChunk(
                enrichedText,
                chunkIndex++,
                {
                    type: 'combined',
                    page: smallElementsBuffer[0].page,
                    section: bufferSection.join(' > '),
                    sectionPath: bufferSection,
                    parentHeading: smallElementsBuffer[0].parentHeading,
                    contentType,
                    combinedElements: smallElementsBuffer.length,
                }
            ));
        }
        
        smallElementsBuffer = [];
        bufferSection = [];
    };

    for (const element of elements) {
        // Update section hierarchy for headings
        if (element.type === 'heading' && element.text) {
            // Flush any buffered small elements before changing section
            flushSmallElements();
            
            const level = element.level ?? 1;
            currentSection = [
                ...sectionHierarchy.slice(0, Math.max(0, level - 1)),
                element.text.replace(/^#+\s*/, '').trim()
            ];
            continue;
        }

        // Use pre-computed section path if available
        const elementSection = element.sectionPath && element.sectionPath.length > 0
            ? element.sectionPath
            : currentSection;

        // Skip completely empty elements
        if (!element.text || element.text.trim().length === 0) {
            continue;
        }

        // Clean HTML entities first
        let cleanedElementText = decodeHtmlEntities(element.text);
        
        // Convert table format to natural language sentences
        if (element.type === 'table' || cleanedElementText.includes('|')) {
            cleanedElementText = cleanTableText(cleanedElementText);
            if (!cleanedElementText || cleanedElementText.trim().length === 0) {
                continue;
            }
        }

        // Check if element is too small
        if (cleanedElementText.trim().length < config.minChunkSize) {
            smallElementsBuffer.push({
                ...element,
                text: cleanedElementText,
            });
            if (bufferSection.length === 0) {
                bufferSection = [...elementSection];
            }
            continue;
        }
        
        // Flush buffered elements if we have a large element
        flushSmallElements();

        // Extract structured fields from the cleaned text
        const structuredFields = extractStructuredFields(cleanedElementText, element.type);

        let chunkText = cleanedElementText;

        // Format chunk with embedded section context
        const parentSummary = element.parentHeading || '';
        const enrichedText = formatChunkWithContext(
            chunkText,
            elementSection,
            parentSummary
        );

        chunks.push(createSimpleChunk(
            enrichedText,
            chunkIndex++,
            {
                type: element.type,
                page: element.page,
                section: elementSection.join(' > '),
                sectionPath: elementSection,
                parentHeading: element.parentHeading,
                contentType,
                structuredFields,
            }
        ));
    }
    
    // Flush any remaining buffered small elements at the end
    flushSmallElements();

    logger.info(
        `Structured chunking: ${chunks.length} chunks with embedded context (type: ${contentType})`
    );
    return chunks;
}

/**
 * Chunk document using intelligent strategy selection
 */
export function chunkDocumentIntelligent(
    elements: StructuredElement[],
    contentType: ContentType,
    sectionHierarchy: string[] = [],
    suggestedStrategy: ChunkingStrategy | undefined,
    config: ChunkingConfig,
    chunkTextFn: (text: string, metadata: Record<string, any>, strategy: ChunkingStrategy) => Chunk[]
): Chunk[] {
    logger.info(`Intelligent chunking: ${elements.length} elements, type: ${contentType}`);

    // If external strategy is suggested, use it
    if (suggestedStrategy) {
        return chunkWithStrategy(
            elements, 
            contentType, 
            sectionHierarchy, 
            suggestedStrategy,
            config,
            chunkTextFn
        );
    }

    // Otherwise, auto-detect the best strategy
    switch (contentType) {
        case ContentType.STRUCTURED:
            return chunkStructuredDocument(elements, contentType, sectionHierarchy, config);

        case ContentType.NARRATIVE:
            const narrativeText = elements
                .map(e => e.text)
                .filter(t => t && t.trim())
                .join('\n\n');
            
            return chunkTextFn(
                narrativeText,
                { contentType },
                ChunkingStrategy.PARAGRAPH
            );

        case ContentType.MIXED:
        default:
            return chunkStructuredDocument(elements, contentType, sectionHierarchy, config);
    }
}

/**
 * Route to appropriate chunking method based on strategy
 */
function chunkWithStrategy(
    elements: StructuredElement[],
    contentType: ContentType,
    sectionHierarchy: string[],
    strategy: ChunkingStrategy,
    config: ChunkingConfig,
    chunkTextFn: (text: string, metadata: Record<string, any>, strategy: ChunkingStrategy) => Chunk[]
): Chunk[] {
    switch (strategy) {
        case ChunkingStrategy.FAQ:
            return chunkFaqStructured(elements, contentType, sectionHierarchy, config);
        
        case ChunkingStrategy.ITEM:
            return chunkStructuredDocument(elements, contentType, sectionHierarchy, config);
        
        case ChunkingStrategy.PARAGRAPH:
        case ChunkingStrategy.SENTENCE:
            const text = elements
                .map(e => e.text)
                .filter(t => t && t.trim())
                .join('\n\n');
            return chunkTextFn(text, { contentType }, strategy);
        
        default:
            return chunkStructuredDocument(elements, contentType, sectionHierarchy, config);
    }
}
