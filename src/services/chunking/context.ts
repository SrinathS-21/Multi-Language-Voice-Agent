/**
 * Context Formatter for Chunks
 * 
 * Embeds context (section hierarchy, keywords) into chunk text
 * for better RAG retrieval performance.
 */

import { getTokenizer } from './tokenizer.js';
import { decodeHtmlEntities } from './utilities.js';

/**
 * Embed context INTO the chunk text for storage in Convex RAG.
 * 
 * Convex RAG doesn't support metadata fields, so we embed context
 * in the text itself.
 * 
 * NEW FORMAT: "[Section > SubSection] content..."
 * - Compact bracket format for better token efficiency
 * - Max 32 tokens for context prefix
 * - Easier to parse at retrieval time
 * 
 * LEGACY FORMAT: "Section: X | Context: Y | Keywords: Z | content..."
 * - Kept for backward compatibility
 * 
 * OPTIMIZATION: Adds searchable keywords to improve semantic retrieval:
 * - Section name provides topic context
 * - Extracted keywords improve query matching
 * - Common synonyms help voice query variations
 */
export function formatChunkWithContext(
    chunkText: string,
    sectionHierarchy: string[],
    parentSummary: string = '',
    useCompactFormat: boolean = true,
    maxPrefixTokens: number = 32
): string {
    // Clean HTML entities from chunk text
    let cleanedText = decodeHtmlEntities(chunkText);
    
    // Use compact format (new) or legacy format
    if (useCompactFormat) {
        return formatChunkCompact(cleanedText, sectionHierarchy, parentSummary, maxPrefixTokens);
    } else {
        return formatChunkLegacy(cleanedText, sectionHierarchy, parentSummary);
    }
}

/**
 * NEW Compact context prefix format
 * Format: "[Section > SubSection] content..."
 * 
 * Benefits:
 * - Max 32 tokens for prefix (configurable)
 * - Bracket format is easier to parse
 * - Less verbose, more content-focused
 */
export function formatChunkCompact(
    cleanedText: string,
    sectionHierarchy: string[],
    parentSummary: string,
    maxPrefixTokens: number
): string {
    const tokenizer = getTokenizer();
    
    // Build hierarchy string
    let hierarchy = sectionHierarchy
        .map(s => s.replace(/^#+\s*/, '').trim())  // Remove markdown #
        .filter(s => s.length > 0)
        .join(' > ');

    // Add parent heading if different from last in path
    if (parentSummary && !hierarchy.endsWith(parentSummary)) {
        const cleanParent = parentSummary.replace(/^#+\s*/, '').trim();
        hierarchy = hierarchy ? `${hierarchy} > ${cleanParent}` : cleanParent;
    }

    // If no hierarchy, return text without prefix
    if (!hierarchy) {
        return cleanedText;
    }

    // Format with brackets
    let prefix = `[${hierarchy}] `;

    // Truncate if too long
    if (tokenizer.countTokens(prefix) > maxPrefixTokens) {
        // Keep last 2 levels only
        const parts = hierarchy.split(' > ');
        if (parts.length > 2) {
            hierarchy = '... > ' + parts.slice(-2).join(' > ');
            prefix = `[${hierarchy}] `;
        }
        
        // Still too long? Truncate text
        if (tokenizer.countTokens(prefix) > maxPrefixTokens) {
            prefix = tokenizer.truncateToTokens(prefix, maxPrefixTokens);
            if (!prefix.endsWith('] ')) {
                prefix = prefix.slice(0, -1) + '...] ';
            }
        }
    }

    return `${prefix}${cleanedText}`;
}

/**
 * Legacy pipe-separated context prefix format
 * Format: "Section: X | Context: Y | Topics: Z | content..."
 * 
 * Kept for backward compatibility
 */
export function formatChunkLegacy(
    cleanedText: string,
    sectionHierarchy: string[],
    parentSummary: string
): string {
    // Build section path string (use "General" if no hierarchy)
    const sectionPath = (sectionHierarchy && sectionHierarchy.length > 0)
        ? sectionHierarchy.join(' > ')
        : 'General';

    // Extract searchable keywords to boost retrieval
    const keywords = extractSearchKeywords(cleanedText, sectionPath);

    // Build context prefix using pipe-separated format
    const contextParts: string[] = [`Section: ${sectionPath}`];
    if (parentSummary) {
        contextParts.push(`Context: ${decodeHtmlEntities(parentSummary.slice(0, 150))}`);
    }
    
    // Add keywords for semantic boosting (only if meaningful keywords found)
    if (keywords.length > 0) {
        contextParts.push(`Topics: ${keywords.join(', ')}`);
    }

    const contextPrefix = contextParts.join(' | ');

    // Embed context at start of chunk text
    return `${contextPrefix} | ${cleanedText}`;
}

/**
 * Extract searchable keywords from chunk content for semantic boosting.
 * 
 * GENERALIZED for ANY document type:
 * - Extracts key topics from section names
 * - Identifies important entities (prices, names, dates)
 * - Adds common query synonyms
 * 
 * This helps voice queries like "delivery fee" match chunks containing "$3.99"
 */
export function extractSearchKeywords(text: string, section: string): string[] {
    const keywords: string[] = [];
    const lowerText = text.toLowerCase();
    const lowerSection = section.toLowerCase();
    
    // 1. Extract section-based topic keywords
    const sectionKeywords: Record<string, string[]> = {
        'delivery': ['shipping', 'delivery fee', 'delivery charge', 'delivery policy', 'delivery time'],
        'payment': ['payment methods', 'pay', 'credit card', 'cash', 'payment options'],
        'hours': ['opening hours', 'timing', 'schedule', 'open', 'close'],
        'contact': ['phone', 'email', 'address', 'reach', 'call'],
        'price': ['cost', 'pricing', 'rate', 'charge', 'fee'],
        'menu': ['food', 'dish', 'item', 'order'],
        'policy': ['rules', 'terms', 'conditions', 'guidelines'],
        'reservation': ['booking', 'reserve', 'table', 'appointment'],
        'education': ['degree', 'college', 'university', 'school', 'qualification'],
        'experience': ['work', 'job', 'career', 'employment', 'position'],
        'skills': ['proficiency', 'expertise', 'knowledge', 'ability'],
        'certification': ['certificate', 'certified', 'qualification', 'credential'],
        'achievement': ['award', 'accomplishment', 'recognition', 'success'],
        'project': ['work', 'development', 'implementation', 'built'],
    };
    
    // Add section-matched keywords
    for (const [key, synonyms] of Object.entries(sectionKeywords)) {
        if (lowerSection.includes(key) || lowerText.includes(key)) {
            keywords.push(...synonyms.slice(0, 2)); // Add top 2 synonyms
        }
    }
    
    // 2. Extract price-related keywords if prices present
    if (/[\$₹]\d/.test(text) || /\d+\.\d{2}/.test(text)) {
        keywords.push('price', 'cost', 'fee');
    }
    
    // 3. Extract time-related keywords if times present
    if (/\d{1,2}:\d{2}\s*(AM|PM|am|pm)?/.test(text)) {
        keywords.push('hours', 'time', 'schedule');
    }
    
    // 4. Extract contact keywords if contact info present
    if (/\+?\d{10,}|@\w+\.\w+/.test(text)) {
        keywords.push('contact', 'phone', 'email');
    }
    
    // Deduplicate and limit
    const uniqueKeywords = [...new Set(keywords)];
    return uniqueKeywords.slice(0, 5); // Max 5 keywords per chunk
}
