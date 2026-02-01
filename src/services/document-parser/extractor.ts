/**
 * Markdown Extractor
 * 
 * Extract structure from markdown content and build hierarchical context.
 * 
 * @module document-parser/markdown-extractor
 */

import { logger } from '../../core/logging.js';
import type { StructuredElement } from './types.js';

/**
 * Map LlamaParse element types to our types
 */
export function mapElementType(
    llamaType: string
): 'heading' | 'paragraph' | 'table' | 'list' | 'image' | 'text' {
    const typeMap: Record<string, 'heading' | 'paragraph' | 'table' | 'list' | 'image' | 'text'> = {
        heading: 'heading',
        title: 'heading',
        section: 'heading',
        table: 'table',
        list: 'list',
        list_item: 'list',
        image: 'image',
        paragraph: 'paragraph',
        text: 'text',
    };
    
    return typeMap[llamaType?.toLowerCase()] || 'text';
}

/**
 * Build hierarchical context from structured elements
 * Per PARSER_ARCHITECTURE.md: Track heading hierarchy
 */
export function buildHierarchyFromElements(
    elements: StructuredElement[]
): StructuredElement[] {
    const hierarchyStack: { level: number; text: string }[] = [];
    const enrichedElements: StructuredElement[] = [];

    for (const elem of elements) {
        const elemType = elem.type;
        const elemLevel = elem.level || 0;
        const elemText = elem.text?.trim() || '';

        // Update hierarchy stack when we hit a heading
        if (elemType === 'heading' && elemText) {
            // Clean heading text (remove markdown # symbols)
            const cleanHeading = elemText.replace(/^#+\s*/, '').trim();

            // Pop headings at same or lower level
            while (
                hierarchyStack.length > 0 &&
                hierarchyStack[hierarchyStack.length - 1].level >= elemLevel
            ) {
                hierarchyStack.pop();
            }

            // Add this heading to stack
            hierarchyStack.push({ level: elemLevel, text: cleanHeading });
        }

        // Build section path from hierarchy stack
        const sectionPath = hierarchyStack.map(h => h.text);
        const parentHeading = sectionPath.length > 0 
            ? sectionPath[sectionPath.length - 1] 
            : '';

        // Create enriched element
        enrichedElements.push({
            ...elem,
            sectionPath,
            parentHeading,
        });
    }

    logger.info(
        `Built hierarchy: ${enrichedElements.length} elements enriched with section paths`
    );
    return enrichedElements;
}

/**
 * Extract structure from markdown content
 * Enhanced to detect FAQ patterns (lines ending with ?)
 */
export function extractStructureFromMarkdown(
    content: string,
    page: number
): StructuredElement[] {
    const elements: StructuredElement[] = [];
    const lines = content.split('\n');

    let currentParagraph: string[] = [];

    const flushParagraph = () => {
        if (currentParagraph.length > 0) {
            const text = currentParagraph.join(' ').trim();
            if (text) {
                elements.push({
                    type: 'paragraph',
                    text,
                    page,
                });
            }
            currentParagraph = [];
        }
    };

    for (const line of lines) {
        const trimmed = line.trim();

        // Check for headings (markdown format)
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
            flushParagraph();
            elements.push({
                type: 'heading',
                level: headingMatch[1].length,
                text: headingMatch[2],
                markdown: trimmed,
                page,
            });
            continue;
        }

        // Check for FAQ questions (lines ending with ?)
        // These become headings for FAQ chunking to detect
        if (trimmed.endsWith('?') && trimmed.length > 5 && trimmed.length < 200) {
            flushParagraph();
            elements.push({
                type: 'heading',
                level: 3,  // Treat as h3 for FAQ questions
                text: trimmed,
                page,
            });
            continue;
        }

        // Check for table rows
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            flushParagraph();
            elements.push({
                type: 'table',
                text: trimmed,
                page,
            });
            continue;
        }

        // Check for list items
        if (/^[-*+]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
            flushParagraph();
            elements.push({
                type: 'list',
                text: trimmed.replace(/^[-*+\d.]+\s+/, ''),
                page,
            });
            continue;
        }

        // Empty line flushes paragraph
        if (!trimmed) {
            flushParagraph();
            continue;
        }

        // Regular text - add to current paragraph
        currentParagraph.push(trimmed);
    }

    // Flush any remaining paragraph
    flushParagraph();

    return elements;
}
