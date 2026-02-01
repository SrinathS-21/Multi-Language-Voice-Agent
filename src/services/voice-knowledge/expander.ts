/**
 * Query Expander for Voice Knowledge
 * 
 * Expands short queries for better semantic matching.
 * Fixes issue where "address" or "location" queries fail due to poor embedding quality.
 */

import { logger } from '../../core/logging.js';

/**
 * Info type keywords for query expansion
 * 
 * Current hypothesis: Short queries (<15 chars) produce weak embeddings
 */
export const INFO_TYPE_KEYWORDS: Record<string, string[]> = {
    address: ['address', 'location', 'where', 'directions', 'street'],
    hours: ['hours', 'timing', 'open', 'close', 'schedule', 'when'],
    contact: ['contact', 'phone', 'email', 'call', 'reach'],
    menu: ['menu', 'food', 'dish', 'items', 'catalog'],
    price: ['price', 'cost', 'fee', 'charge', 'expensive', 'cheap', 'rupees', 'inr'],
    surgery: ['surgery', 'operation', 'procedure', 'replacement', 'tkr', 'thr', 'acl'],
};

/**
 * Query expansion mapping for each info type
 */
const EXPANSION_MAP: Record<string, string> = {
    address: 'what is the business address and location',
    hours: 'what are the business hours and operating times',
    contact: 'what is the contact information phone number and email',
    menu: 'what items are on the menu or catalog',
    price: 'what is the price cost package rates rupees',
    surgery: 'procedure package rates price cost',
};

/**
 * Query expansion result
 */
export interface ExpandedQuery {
    expanded: string;
    infoType?: string;
}

/**
 * Expand short queries for better semantic matching
 * 
 * Short queries (<15 chars) produce weak embeddings that often fail
 * to match relevant content. This function expands them into full
 * questions for better semantic search results.
 * 
 * Also expands queries with cost/surgery keywords to better match
 * procedure rate chunks in the knowledge base.
 * 
 * @param query Original user query
 * @returns Expanded query and detected info type
 */
export function expandQuery(query: string): ExpandedQuery {
    const normalizedQuery = query.toLowerCase().trim();

    // Check for cost/surgery related queries - these need to include "package rates"
    // to better match the procedural cost chunks in the knowledge base
    const costKeywords = ['cost', 'price', 'fee', 'charge', 'rupees', 'inr', 'how much', 'kitna', 'paisa'];
    const surgeryKeywords = ['surgery', 'replacement', 'tkr', 'thr', 'acl', 'pcl', 'operation', 'procedure'];
    
    const hasCostKeyword = costKeywords.some(kw => normalizedQuery.includes(kw));
    const hasSurgeryKeyword = surgeryKeywords.some(kw => normalizedQuery.includes(kw));
    
    // If query mentions surgery AND cost, expand with "package rates" for better matching
    if (hasCostKeyword && hasSurgeryKeyword) {
        // Add "package rates" to help match procedural cost chunks
        const expanded = `${query} package rates price rupees`;
        
        logger.info('Query expansion triggered', {
            original: query,
            originalLength: query.length,
            expanded,
            expandedLength: expanded.length,
            infoType: 'surgery_cost',
            reason: 'surgery_cost_query_expansion'
        });
        
        return { expanded, infoType: 'price' };
    }
    
    // If query has cost keyword but no surgery, still expand
    if (hasCostKeyword) {
        const expanded = `${query} package rates price`;
        
        logger.info('Query expansion triggered', {
            original: query,
            originalLength: query.length,
            expanded,
            expandedLength: expanded.length,
            infoType: 'price',
            reason: 'cost_query_expansion'
        });
        
        return { expanded, infoType: 'price' };
    }
    
    // If query has surgery keyword, add "cost package rates" to catch cost queries
    if (hasSurgeryKeyword) {
        const expanded = `${query} cost package rates`;
        
        logger.info('Query expansion triggered', {
            original: query,
            originalLength: query.length,
            expanded,
            expandedLength: expanded.length,
            infoType: 'surgery',
            reason: 'surgery_query_expansion'
        });
        
        return { expanded, infoType: 'surgery' };
    }

    // Short queries (<15 chars) need expansion for better embeddings
    if (normalizedQuery.length < 15) {
        // Detect info type and expand accordingly
        for (const [infoType, keywords] of Object.entries(INFO_TYPE_KEYWORDS)) {
            if (keywords.some(kw => normalizedQuery.includes(kw))) {
                const expanded = EXPANSION_MAP[infoType] || `information about ${normalizedQuery}`;
                
                logger.info('Query expansion triggered', {
                    original: query,
                    originalLength: query.length,
                    expanded,
                    expandedLength: expanded.length,
                    infoType,
                    reason: 'short_query_with_keyword_match'
                });
                
                return { expanded, infoType };
            }
        }

        // Generic expansion for other short queries
        const expanded = `information about ${normalizedQuery}`;
        
        logger.info('Query expansion triggered', {
            original: query,
            originalLength: query.length,
            expanded,
            expandedLength: expanded.length,
            infoType: 'generic',
            reason: 'short_query_without_keyword_match'
        });
        
        return { expanded };
    }

    return { expanded: query };
}

/**
 * Get adjusted similarity threshold for info-type queries
 * 
 * Info-type queries (address, hours, contact) need lower threshold for better recall
 * 
 * @param baseThreshold Default similarity threshold
 * @param infoType Detected info type from query expansion
 * @returns Adjusted threshold
 */
export function getAdjustedThreshold(baseThreshold: number, infoType?: string): number {
    if (infoType) {
        return Math.min(baseThreshold, 0.20);
    }
    return baseThreshold;
}
