/**
 * Text Utilities for Chunking
 * 
 * Utility functions for text cleaning, HTML entity decoding,
 * and table-to-text conversion.
 */

/**
 * Decode HTML entities to clean text.
 * Handles common entities like &amp;, &#x26;, etc.
 */
export function decodeHtmlEntities(text: string): string {
    if (!text) return '';
    
    return text
        // Numeric entities (hex)
        .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        // Numeric entities (decimal)
        .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        // Named entities
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

/**
 * Convert markdown table row to natural language sentence.
 * 
 * Input:  "| Butter Chicken | $15.99 | creamy tomato sauce |"
 * Output: "Butter Chicken costs $15.99 - creamy tomato sauce"
 */
export function tableRowToSentence(tableRow: string): string {
    if (!tableRow || !tableRow.includes('|')) {
        return tableRow;
    }
    
    // Skip separator rows (| --- | --- |)
    if (/^[\s|\-:]+$/.test(tableRow)) {
        return '';
    }
    
    // Extract cells
    const cells = tableRow
        .split('|')
        .map(c => c.trim())
        .filter(c => c && c !== '-' && !c.match(/^[-:]+$/));
    
    if (cells.length === 0) {
        return '';
    }
    
    // Single cell - just return it
    if (cells.length === 1) {
        return cells[0];
    }
    
    // Two cells - likely header/value or name/description
    if (cells.length === 2) {
        // Check if second cell is a price
        if (cells[1].match(/^\$[\d.]+$/)) {
            return `${cells[0]} costs ${cells[1]}`;
        }
        return `${cells[0]}: ${cells[1]}`;
    }
    
    // Three+ cells - likely item/price/description
    const name = cells[0];
    let price = '';
    let description = '';
    
    for (let i = 1; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.match(/^\$[\d.]+$/) || cell.match(/^\$\d+\.\d{2}$/)) {
            price = cell;
        } else if (cell.length > 5) {
            description = cell;
        }
    }
    
    // Build natural sentence
    let sentence = name;
    if (price) {
        sentence += ` costs ${price}`;
    }
    if (description) {
        sentence += ` - ${description}`;
    }
    
    return sentence;
}

/**
 * Clean and convert table text to natural language.
 * Handles multi-row tables and single rows.
 */
export function cleanTableText(text: string): string {
    if (!text || !text.includes('|')) {
        return text;
    }
    
    const lines = text.split('\n');
    const sentences: string[] = [];
    let headerRow: string[] = [];
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines
        if (!trimmed) continue;
        
        // Skip separator rows
        if (/^[\s|\-:]+$/.test(trimmed)) continue;
        
        // Check if it's a table row
        if (trimmed.includes('|')) {
            const cells = trimmed
                .split('|')
                .map(c => c.trim())
                .filter(c => c && !c.match(/^[-:]+$/));
            
            // First non-separator row might be header
            if (headerRow.length === 0 && cells.length > 0) {
                // Check if this looks like a header (Day, Hours, Item, Price, etc.)
                const looksLikeHeader = cells.some(c => 
                    /^(Day|Hours|Item|Name|Price|Description|Category|Menu|Time)$/i.test(c)
                );
                
                if (looksLikeHeader) {
                    headerRow = cells;
                    continue;
                }
            }
            
            // Convert row to sentence
            const sentence = tableRowToSentence(trimmed);
            if (sentence) {
                sentences.push(sentence);
            }
        } else {
            // Non-table content, keep as-is
            sentences.push(trimmed);
        }
    }
    
    return sentences.join('. ').replace(/\.\s*\./g, '.');
}

/**
 * Clean text by removing extra whitespace and decoding HTML entities
 */
export function cleanText(text: string): string {
    // First decode HTML entities
    let cleaned = decodeHtmlEntities(text);
    
    return cleaned
        .replace(/\r\n/g, '\n')
        .replace(/\t/g, ' ')
        .replace(/ +/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Clean markdown and formatting from item names
 */
export function cleanName(name: string): string {
    if (!name) return '';
    
    return name
        .replace(/^[\|\-•*#]+\s*/, '')  // Start of string
        .replace(/\s*[\|#]+\s*$/, '')   // End of string
        .replace(/\*+/g, '')             // Asterisks anywhere
        .replace(/^#+\s*/, '')           // Headers
        .replace(/^[A-Za-z\s]+Menu\s*\n+/, '') // Section headers
        .replace(/\s*\n+\s*/g, ' ')      // Newlines
        .replace(/\s+/g, ' ')            // Extra whitespace
        .trim();
}

/**
 * Clean markdown and formatting from descriptions
 */
export function cleanDescription(desc: string): string {
    if (!desc) return '';
    
    return desc
        .replace(/\|/g, ' ')        // Remove pipes
        .replace(/#+\s*/g, '')      // Remove headers
        .replace(/\*+/g, '')        // Remove asterisks
        .replace(/^[-•]\s*/gm, '')  // Remove bullets
        .replace(/\s+/g, ' ')       // Clean whitespace
        .trim();
}
