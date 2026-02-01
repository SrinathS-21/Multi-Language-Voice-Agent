/**
 * Field Extractor for Structured Content
 * 
 * Extracts structured fields (key-value pairs, prices, items)
 * from text and parses enriched text format.
 */

import { cleanName, cleanDescription } from './utilities.js';

/**
 * Extract structured fields from text based on common patterns.
 * 
 * Works generically for any domain - detects:
 * - Key-value pairs (Name: Value, Label: Data)
 * - Price patterns ($X.XX, ₹X, Price: $X)
 * - List items (-, *, 1., bullet points)
 * - Table cells (| col1 | col2 |)
 * 
 * Per PARSER_ARCHITECTURE.md: Generic field extraction
 */
export function extractStructuredFields(
    text: string,
    elemType: string = 'text'
): Record<string, string> {
    const fields: Record<string, string> = {};

    // Pattern 1: Explicit key-value pairs (Label: Value)
    const kvPattern = /([A-Z][A-Za-z\s]+):\s*([^\n|]+)/g;
    let match;
    while ((match = kvPattern.exec(text)) !== null) {
        const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
        if (key.length < 30) {
            fields[key] = match[2].trim();
        }
    }

    // Pattern 2: Price detection ($X.XX or ₹X or Price: $X)
    const priceMatch = text.match(/[\$₹]\s*(\d+\.?\d*)/);
    if (priceMatch) {
        fields['price'] = `$${priceMatch[1]}`;
    }

    // Pattern 3: Table row parsing (| col1 | col2 | col3 |)
    if (elemType === 'table' && text.includes('|')) {
        const cells = text
            .split('|')
            .map(c => c.trim())
            .filter(c => c && c !== '-' && !c.match(/^-+$/));
        
        if (cells.length >= 2) {
            // First cell often is name/item
            fields['item'] = cells[0];
            
            // Look for price in remaining cells
            for (const cell of cells.slice(1)) {
                if (cell.includes('$') || cell.includes('₹')) {
                    fields['price'] = cell.trim();
                    break;
                }
            }
            
            // Last cell often is description
            if (cells.length > 2 && fields['price'] !== cells[cells.length - 1]) {
                fields['description'] = cells[cells.length - 1];
            }
        }
    }

    // Pattern 4: List item with dash/bullet
    if (/^[-•*]\s/.test(text.trim())) {
        const cleanText = text.replace(/^[-•*]\s*/, '').trim();
        // First sentence or clause often is the item name
        const firstPart = cleanText
            .split('.')[0]
            .split(',')[0]
            .split('is priced at')[0];
        
        if (firstPart.length < 100) {
            fields['item'] = firstPart.trim();
        }
    }

    return fields;
}

/**
 * Parse enriched text format back to structured data.
 * Used for parsing chunks during retrieval.
 * 
 * Format: "Section: X | Name: Y | Price: $Z | Description: ..."
 * 
 * Per PARSER_ARCHITECTURE.md: voice_knowledge_service._parse_enriched_text()
 */
export function parseEnrichedText(text: string): Record<string, any> {
    const result: Record<string, any> = {
        name: '',
        category: '',
        section: '',
        price: 0,
        description: '',
        tags: [],
        rawText: text,
    };

    // Try parsing pipe-separated enriched format
    if (text.includes(' | ')) {
        const parts = text.split(' | ');
        let contentParts: string[] = [];

        for (const part of parts) {
            if (part.includes(': ')) {
                const colonIndex = part.indexOf(': ');
                const key = part.slice(0, colonIndex).toLowerCase().trim();
                const value = part.slice(colonIndex + 2).trim();

                switch (key) {
                    case 'name':
                    case 'item':
                        result['name'] = value;
                        break;
                    case 'category':
                        result['category'] = value;
                        break;
                    case 'section':
                        result['section'] = value;
                        break;
                    case 'context':
                        result['context'] = value;
                        break;
                    case 'price':
                        // Extract numeric price
                        const priceMatch = value.match(/[\$₹]?([\d]+\.?\d*)/);
                        if (priceMatch) {
                            result['price'] = parseFloat(priceMatch[1]);
                        }
                        break;
                    case 'description':
                        result['description'] = value;
                        break;
                    case 'tags':
                        result['tags'] = value.split(',').map((t: string) => t.trim());
                        break;
                    default:
                        // Keep other fields
                        result[key] = value;
                }
            } else {
                // Not a key-value pair, part of content
                contentParts.push(part);
            }
        }

        // If we have leftover content parts, use as description
        if (contentParts.length > 0 && !result['description']) {
            result['description'] = contentParts.join(' ').slice(0, 200);
        }

        // If we found a name, return
        if (result['name']) {
            return result;
        }
    }

    // Fallback: regex extraction for legacy/unstructured data
    // Pattern 1: "Name – $Price" or "Name - $Price"
    const dashMatch = text.match(/^(.*?)\s*[–-]\s*[\$₹]?([\d\.]+)/);
    if (dashMatch) {
        result['name'] = cleanName(dashMatch[1]);
        result['price'] = parseFloat(dashMatch[2]) || 0;
    } else {
        // Pattern 2: Look for "$Price" anywhere
        const priceMatch = text.match(/[\$₹]([\d]+\.?\d*)/);
        if (priceMatch) {
            result['price'] = parseFloat(priceMatch[1]) || 0;
        }

        // Pattern 3: First capitalized phrase as name
        const capMatch = text.match(/([A-Z][A-Za-z]+(?:\s+[A-Z]?[a-z]+)*)/);
        if (capMatch) {
            const potentialName = capMatch[1].trim();
            const commonWords = ['menu', 'the', 'and', 'for', 'with', 'section', 'context'];
            if (potentialName.length > 3 && !commonWords.includes(potentialName.toLowerCase())) {
                result['name'] = cleanName(potentialName);
            }
        }
    }

    // Set description from text
    result['description'] = cleanDescription(text.slice(0, 200));

    return result;
}
