/**
 * Text Parser for Voice Knowledge
 * 
 * Parses enriched text format and cleans text for voice output.
 */

import { ParsedItem, VoiceSearchItem } from './types.js';

/**
 * Parse enriched text format created by SmartIngestionService
 * 
 * Format: "Section: A > B > C | Context: Y | Name: X | Price: $Z | Description: ..."
 * 
 * Per PARSER_ARCHITECTURE.md: Context is pre-embedded in chunk text
 * using pipe-separated format for zero-latency retrieval.
 */
export function parseEnrichedText(text: string): ParsedItem {
    const result: ParsedItem = {
        name: '',
        category: '',
        price: 0,
        description: '',
        tags: [],
    };

    // Try parsing pipe-separated enriched format
    if (text.includes(' | ')) {
        const parts = text.split(' | ');
        const contentParts: string[] = [];

        for (const part of parts) {
            if (part.includes(': ')) {
                const colonIndex = part.indexOf(': ');
                const key = part.slice(0, colonIndex).toLowerCase().trim();
                const value = part.slice(colonIndex + 2).trim();

                switch (key) {
                    case 'name':
                    case 'item':
                        result.name = cleanName(value);
                        break;
                    case 'category':
                        result.category = value;
                        break;
                    case 'section':
                        // Section path like "Menu > Entrees > Seafood"
                        // Extract last segment as category if no category set
                        if (!result.category) {
                            const segments = value.split(' > ');
                            result.category = segments[segments.length - 1];
                        }
                        break;
                    case 'price':
                        const priceMatch = value.match(/[\$₹]?([\d]+\.?\d*)/);
                        if (priceMatch) {
                            result.price = parseFloat(priceMatch[1]);
                        }
                        break;
                    case 'description':
                        result.description = cleanDescription(value);
                        break;
                    case 'context':
                        // Context from parent section - can supplement description
                        if (!result.description) {
                            result.description = value;
                        }
                        break;
                    case 'tags':
                        result.tags = value.split(',').map(t => t.trim());
                        break;
                }
            } else {
                // Not a key-value pair - collect as content
                contentParts.push(part);
            }
        }

        // Use collected content as description if none found
        if (!result.description && contentParts.length > 0) {
            result.description = cleanDescription(
                contentParts.join(' ').slice(0, 200)
            );
        }

        if (result.name) {
            return result;
        }
    }

    // Fallback: regex extraction for legacy/unstructured data
    // Pattern 1: "Name – $Price" or "Name - $Price"
    const match1 = text.match(/^(.*?)\s*[–-]\s*[\$₹]?([\d\.]+)/);
    if (match1) {
        result.name = cleanName(match1[1].trim());
        result.price = parseFloat(match1[2]);
        return result;
    }

    // Pattern 2: Look for price patterns
    const priceMatch = text.match(/[\$₹]([\d]+\.?\d*)/);
    if (priceMatch) {
        result.price = parseFloat(priceMatch[1]);
    }

    // Pattern 3: First capitalized phrase as name
    const capMatch = text.match(/([A-Z][A-Za-z]+(?:\s+[A-Z]?[a-z]+)*)/);
    if (capMatch) {
        const potentialName = capMatch[1].trim();
        const commonWords = ['menu', 'the', 'and', 'for', 'with', 'section', 'context'];
        if (potentialName.length > 3 && !commonWords.includes(potentialName.toLowerCase())) {
            result.name = cleanName(potentialName);
        }
    }

    // Use first part of text as description if nothing else matched
    if (!result.name && !result.description) {
        result.description = text.slice(0, 200);
    }

    return result;
}

/**
 * Clean item name - remove markdown and formatting
 */
export function cleanName(name: string): string {
    return name
        .replace(/^[\|\-•*#]+\s*/, '')  // Remove bullets, pipes, hashes at start
        .replace(/\s*[\|#]+\s*$/, '')   // Remove pipes, hashes at end
        .replace(/\*+/g, '')            // Remove asterisks anywhere
        .replace(/^#+\s*/, '')          // Remove markdown headers
        .replace(/^[A-Za-z\s]+Menu\s*\n+/, '') // Remove "Menu" headers
        .replace(/\s*\n+\s*/g, ' ')     // Replace newlines with spaces
        .replace(/\s+/g, ' ')           // Normalize spaces
        .replace(/[""]/g, '"')          // Normalize quotes
        .trim();
}

/**
 * Clean description - remove markdown for voice output
 */
export function cleanDescription(desc: string): string {
    if (!desc) return '';
    
    return desc
        .replace(/\|/g, ' ')            // Remove pipes
        .replace(/#+\s*/g, '')          // Remove headers
        .replace(/\*+/g, '')            // Remove asterisks
        .replace(/^[-•]\s*/gm, '')      // Remove bullets
        .replace(/\s+/g, ' ')           // Normalize whitespace
        .trim();
}

/**
 * Format price for voice
 */
export function formatPrice(price: number): string {
    if (price === 0) return '';
    if (price < 1000) {
        return `$${price.toFixed(2)}`;
    }
    return `$${price.toLocaleString()}`;
}

/**
 * Get price range string
 */
export function getPriceRange(items: VoiceSearchItem[]): string | null {
    const prices = items.filter(i => i.price > 0).map(i => i.price);
    if (prices.length === 0) return null;

    const min = Math.min(...prices);
    const max = Math.max(...prices);

    if (min === max) {
        return formatPrice(min);
    }

    return `${formatPrice(min)} to ${formatPrice(max)}`;
}
