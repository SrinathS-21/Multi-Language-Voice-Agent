/**
 * Dynamic Data Extractor
 * 
 * Extracts data from integration context using flexible path-based configuration.
 * Now supports LLM-based extraction for 'extracted' source type.
 * 
 * @module plugins/integrations/utils/data-extractor
 */

import type { IntegrationExecutionContext } from '../types.js';
import { getTranscriptExtractor, ExtractionColumn } from '../../../services/TranscriptExtractor.js';

/**
 * Dynamic column configuration for Google Sheets and other integrations
 */
export interface DynamicColumnConfig {
    /** User-defined column name (what appears in the spreadsheet header) */
    name: string;
    
    /** Data source category */
    source: DataSourceType;
    
    /** 
     * Path within the data source
     * - For 'call': callId, duration, callerNumber, etc.
     * - For 'transcript': full, summary, userOnly, etc.
     * - For 'extracted': field to extract via LLM (e.g., "customer name", "appointment date")
     * - For 'agent': name, id, organizationId
     * - For 'metadata': any metadata key
     * - For 'static': the value itself
     */
    path: string;
    
    /** Optional format transformation */
    format?: DataFormat;
    
    /** Default value if data not found */
    fallback?: string;
}

/**
 * Data source categories
 */
export type DataSourceType = 
    | 'call'        // Call metadata: callId, duration, callerNumber, startTime, endTime
    | 'transcript'  // Transcript data: full, summary, userOnly, agentOnly
    | 'extracted'   // LLM-extracted data from transcript (RECOMMENDED)
    | 'agent'       // Agent info: name, id, organizationId
    | 'metadata'    // Custom metadata fields
    | 'static';     // Static value (use path as the value itself)

/**
 * Data format transformations
 */
export type DataFormat = 
    | 'text'        // Raw text (default)
    | 'datetime'    // Format as datetime
    | 'date'        // Format as date only
    | 'time'        // Format as time only
    | 'phone'       // Format as phone number
    | 'number'      // Parse as number
    | 'currency'    // Format as currency
    | 'uppercase'   // Convert to uppercase
    | 'lowercase'   // Convert to lowercase
    | 'json';       // Stringify as JSON

/**
 * Extended context with LLM-extracted data
 */
export interface ExtendedExecutionContext extends IntegrationExecutionContext {
    /** Agent information */
    agentName?: string;
    
    /** LLM-extracted data (populated by TranscriptExtractor) */
    llmExtractedData?: Record<string, unknown>;
}

/**
 * Dynamic Data Extractor Class
 * 
 * Extracts data from integration context using path-based configuration.
 * Supports LLM-based extraction for 'extracted' source type.
 */
export class DynamicDataExtractor {
    private context: ExtendedExecutionContext;
    private llmExtractedData: Record<string, unknown> = {};
    
    constructor(context: ExtendedExecutionContext) {
        this.context = context;
        
        // Use pre-extracted LLM data if available
        if (context.llmExtractedData) {
            this.llmExtractedData = context.llmExtractedData;
        }
    }
    
    /**
     * Extract data using LLM for 'extracted' columns
     * Call this BEFORE extractAll() to populate LLM data
     */
    async extractWithLLM(columns: DynamicColumnConfig[]): Promise<void> {
        const extractor = getTranscriptExtractor();
        
        if (!extractor.isAvailable()) {
            console.warn('[DynamicDataExtractor] LLM extraction not available (no OpenAI key)');
            return;
        }
        
        // Get columns that need LLM extraction
        const extractedColumns = columns.filter(col => col.source === 'extracted');
        
        if (extractedColumns.length === 0) {
            return;
        }
        
        // Get the full transcript
        const transcript = this.extractTranscriptData('full') as string;
        
        if (!transcript || transcript.trim().length === 0) {
            console.warn('[DynamicDataExtractor] No transcript available for LLM extraction');
            return;
        }
        
        // Build extraction columns
        const llmColumns: ExtractionColumn[] = extractedColumns.map(col => ({
            name: col.name,
            path: col.path,
            description: col.path, // Use path as description hint
        }));
        
        // Extract using LLM
        const result = await extractor.extract(transcript, llmColumns);
        
        if (result.success) {
            this.llmExtractedData = result.data;
            console.log('[DynamicDataExtractor] LLM extraction successful', {
                fields: Object.keys(result.data).filter(k => result.data[k] !== null),
            });
        } else {
            console.error('[DynamicDataExtractor] LLM extraction failed:', result.error);
        }
    }
    
    /**
     * Extract a single value using column configuration
     */
    extractValue(config: DynamicColumnConfig): unknown {
        let value: unknown;
        
        switch (config.source) {
            case 'call':
                value = this.extractCallData(config.path);
                break;
            case 'transcript':
                value = this.extractTranscriptData(config.path);
                break;
            case 'extracted':
                value = this.extractLLMData(config);
                break;
            case 'agent':
                value = this.extractAgentData(config.path);
                break;
            case 'metadata':
                value = this.extractMetadata(config.path);
                break;
            case 'static':
                value = config.path; // Use path as static value
                break;
            default:
                value = undefined;
        }
        
        // Apply fallback if value is empty
        if (value === undefined || value === null || value === '') {
            value = config.fallback ?? '';
        }
        
        // Apply format transformation
        if (config.format && value !== '') {
            value = this.applyFormat(value, config.format);
        }
        
        return value;
    }
    
    /**
     * Extract all configured columns into a payload object
     */
    extractAll(columns: DynamicColumnConfig[]): Record<string, unknown> {
        const payload: Record<string, unknown> = {};
        
        for (const col of columns) {
            payload[col.name] = this.extractValue(col);
        }
        
        return payload;
    }
    
    /**
     * Extract call metadata
     */
    private extractCallData(path: string): unknown {
        const ctx = this.context;
        
        switch (path) {
            case 'callId':
            case 'id':
                return ctx.callId;
            case 'sessionId':
            case 'callSessionId':
                return ctx.callSessionId;
            case 'callerNumber':
            case 'phone':
            case 'phoneNumber':
                return ctx.callerNumber;
            case 'duration':
            case 'durationSeconds':
                return ctx.duration;
            case 'direction':
            case 'callDirection':
                return ctx.callDirection;
            case 'startTime':
            case 'start':
                return ctx.startTime ? new Date(ctx.startTime).toISOString() : '';
            case 'endTime':
            case 'end':
                return ctx.endTime ? new Date(ctx.endTime).toISOString() : '';
            case 'timestamp':
            case 'now':
                return new Date().toISOString();
            default:
                return undefined;
        }
    }
    
    /**
     * Extract transcript data
     */
    private extractTranscriptData(path: string): unknown {
        const ctx = this.context;
        
        switch (path) {
            case 'full':
            case 'complete':
            case 'all':
                return ctx.fullTranscript || '';
            case 'summary':
                return (ctx.extractedData as any)?.summary || '';
            case 'userOnly':
            case 'userMessages':
                return ctx.transcript
                    ?.filter(t => t.role === 'user')
                    .map(t => t.content)
                    .join('\n') || '';
            case 'agentOnly':
            case 'agentMessages':
                return ctx.transcript
                    ?.filter(t => t.role === 'assistant')
                    .map(t => t.content)
                    .join('\n') || '';
            case 'messageCount':
            case 'turns':
                return ctx.transcript?.length || 0;
            default:
                return undefined;
        }
    }
    
    /**
     * Extract LLM-extracted data
     */
    private extractLLMData(config: DynamicColumnConfig): unknown {
        // First, check if we have LLM-extracted data for this column
        if (this.llmExtractedData[config.name] !== undefined) {
            return this.llmExtractedData[config.name];
        }
        
        // Also check by path (in case column name differs from path)
        if (this.llmExtractedData[config.path] !== undefined) {
            return this.llmExtractedData[config.path];
        }
        
        // Fallback: check extractedData from context
        const extracted = (this.context.extractedData || {}) as Record<string, unknown>;
        const parts = config.path.split('.');
        return this.getNestedValue(extracted, parts);
    }
    
    /**
     * Extract agent information
     */
    private extractAgentData(path: string): unknown {
        const ctx = this.context as any;
        
        switch (path) {
            case 'name':
            case 'agentName':
                return ctx.agentName || 'Voice Agent';
            case 'id':
            case 'agentId':
                return ctx.agentId;
            case 'organizationId':
            case 'orgId':
                return ctx.organizationId;
            default:
                return undefined;
        }
    }
    
    /**
     * Extract from custom metadata
     */
    private extractMetadata(path: string): unknown {
        const metadata = (this.context.metadata || {}) as Record<string, unknown>;
        const parts = path.split('.');
        return this.getNestedValue(metadata, parts);
    }
    
    /**
     * Navigate nested object using path array
     */
    private getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
        let current: unknown = obj;
        
        for (const key of path) {
            if (current === undefined || current === null) {
                return undefined;
            }
            if (typeof current !== 'object') {
                return undefined;
            }
            current = (current as Record<string, unknown>)[key];
        }
        
        return current;
    }
    
    /**
     * Apply format transformation to value
     */
    private applyFormat(value: unknown, format: DataFormat): unknown {
        const strValue = String(value ?? '');
        
        switch (format) {
            case 'text':
                return strValue;
                
            case 'datetime':
                try {
                    return new Date(strValue).toISOString();
                } catch {
                    return strValue;
                }
                
            case 'date':
                try {
                    return new Date(strValue).toISOString().split('T')[0];
                } catch {
                    return strValue;
                }
                
            case 'time':
                try {
                    return new Date(strValue).toISOString().split('T')[1]?.split('.')[0] || strValue;
                } catch {
                    return strValue;
                }
                
            case 'phone':
                // Format as phone number (Indian format)
                const digits = strValue.replace(/\D/g, '');
                if (digits.length === 10) {
                    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
                }
                return strValue;
                
            case 'number':
                const num = parseFloat(strValue);
                return isNaN(num) ? 0 : num;
                
            case 'currency':
                const amount = parseFloat(strValue);
                if (isNaN(amount)) return strValue;
                return `₹${amount.toLocaleString('en-IN')}`;
                
            case 'uppercase':
                return strValue.toUpperCase();
                
            case 'lowercase':
                return strValue.toLowerCase();
                
            case 'json':
                try {
                    return JSON.stringify(value);
                } catch {
                    return strValue;
                }
                
            default:
                return strValue;
        }
    }
}

/**
 * Available data sources documentation for UI
 */
export const DATA_SOURCE_DOCUMENTATION = {
    call: {
        description: 'Call metadata and metrics',
        paths: [
            { path: 'callId', description: 'Unique call identifier' },
            { path: 'callerNumber', description: 'Caller phone number' },
            { path: 'duration', description: 'Call duration in seconds' },
            { path: 'direction', description: 'inbound or outbound' },
            { path: 'startTime', description: 'Call start timestamp' },
            { path: 'endTime', description: 'Call end timestamp' },
            { path: 'timestamp', description: 'Current timestamp' },
        ],
    },
    transcript: {
        description: 'Conversation transcript data',
        paths: [
            { path: 'full', description: 'Complete conversation transcript' },
            { path: 'summary', description: 'AI-generated summary' },
            { path: 'userOnly', description: 'Only user messages' },
            { path: 'agentOnly', description: 'Only agent messages' },
            { path: 'messageCount', description: 'Total number of messages' },
        ],
    },
    extracted: {
        description: 'LLM-extracted data from transcript (RECOMMENDED)',
        paths: [
            { path: 'customer name', description: 'Customer/patient/guest name' },
            { path: 'phone number', description: 'Phone number mentioned' },
            { path: 'email', description: 'Email address mentioned' },
            { path: 'appointment date', description: 'Appointment/reservation date' },
            { path: 'appointment time', description: 'Appointment/reservation time' },
            { path: 'reason', description: 'Reason for call/visit' },
            { path: 'intent', description: 'Main purpose of the call' },
            { path: 'sentiment', description: 'Conversation sentiment' },
            { path: '(any custom field)', description: 'Describe what to extract in plain English' },
        ],
    },
    agent: {
        description: 'Agent information',
        paths: [
            { path: 'name', description: 'Agent name' },
            { path: 'id', description: 'Agent ID' },
            { path: 'organizationId', description: 'Organization ID' },
        ],
    },
    metadata: {
        description: 'Custom metadata fields',
        paths: [
            { path: '[key]', description: 'Any custom metadata key' },
        ],
    },
    static: {
        description: 'Static value (use path as the value)',
        paths: [
            { path: '[any_value]', description: 'The path itself becomes the value' },
        ],
    },
};
