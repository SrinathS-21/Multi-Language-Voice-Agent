/**
 * Google Sheets Integration Plugin
 * 
 * Exports call data to Google Sheets using LLM-based transcript extraction.
 * Works with ANY voice agent use case - no specific function calls required!
 * 
 * @module plugins/integrations/google-sheets/GoogleSheetsPlugin
 */

import {
    IntegrationPluginBase,
    createPluginMetadata,
} from '../PluginBase.js';
import {
    IntegrationExecutionContext,
    IntegrationExecutionResult,
    IntegrationPluginMetadata,
    IntegrationConfigValidationResult,
    IntegrationTestConnectionResult,
} from '../types.js';
import {
    DynamicDataExtractor,
    DynamicColumnConfig,
    ExtendedExecutionContext,
    DATA_SOURCE_DOCUMENTATION,
} from '../utils/data-extractor.js';

/**
 * Google Sheets Plugin Configuration
 */
export interface GoogleSheetsConfig {
    /** Apps Script Web App URL (required) */
    webhookUrl: string;
    
    /** Optional: Override spreadsheet ID */
    spreadsheetId?: string;
    
    /** Optional: Specific sheet tab name */
    sheetName?: string;
    
    /** Include full transcript in output */
    includeTranscript?: boolean;
    
    /** 
     * Column configuration - each column specifies:
     * - name: Column header in the sheet
     * - source: Where to get data (call, transcript, extracted, agent, metadata, static)
     * - path: What to extract (e.g., "customer name", "appointment date")
     * - format: Optional formatting (datetime, phone, currency, etc.)
     * - fallback: Default value if not found
     */
    columns?: DynamicColumnConfig[];
}

/**
 * Google Sheets Integration Plugin
 * 
 * Uses LLM to extract data from conversation transcripts.
 */
export class GoogleSheetsPlugin extends IntegrationPluginBase {
    
    get metadata(): IntegrationPluginMetadata {
        return createPluginMetadata(
            'google-sheets',
            'Google Sheets',
            'Export call data to Google Sheets. Uses AI to extract data from conversations - no specific functions required!',
            'data-export',
            ['call_ended', 'transcript_ready'],
            {
                type: 'object',
                required: ['webhookUrl'],
                properties: {
                    webhookUrl: {
                        type: 'string',
                        title: 'Apps Script Web App URL',
                        description: 'The URL from your deployed Google Apps Script',
                        pattern: '^https://script\\.google\\.com/.*$',
                    },
                    spreadsheetId: {
                        type: 'string',
                        title: 'Spreadsheet ID (Optional)',
                        description: 'Override the default spreadsheet',
                    },
                    sheetName: {
                        type: 'string',
                        title: 'Sheet Tab Name',
                        description: 'Which sheet tab to write data to',
                        default: 'Call Logs',
                    },
                    includeTranscript: {
                        type: 'boolean',
                        title: 'Include Full Transcript',
                        description: 'Include the complete conversation transcript',
                        default: true,
                    },
                    columns: {
                        type: 'array',
                        title: 'Column Configuration',
                        description: 'Define what data goes into each column',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string', title: 'Column Name' },
                                source: { 
                                    type: 'string', 
                                    title: 'Data Source',
                                    enum: ['call', 'transcript', 'extracted', 'agent', 'metadata', 'static'],
                                },
                                path: { type: 'string', title: 'Data Path / What to Extract' },
                                format: { 
                                    type: 'string', 
                                    title: 'Format',
                                    enum: ['text', 'datetime', 'date', 'time', 'phone', 'number', 'currency', 'uppercase', 'lowercase', 'json'],
                                },
                                fallback: { type: 'string', title: 'Default Value' },
                            },
                            required: ['name', 'source', 'path'],
                        },
                    },
                },
            },
            {
                icon: '📊',
                version: '3.0.0',
                setupInstructions: SETUP_INSTRUCTIONS,
                documentationUrl: 'https://developers.google.com/apps-script/guides/web',
            }
        );
    }
    
    /**
     * Validate configuration
     */
    validateConfig(config: unknown): IntegrationConfigValidationResult {
        const baseValidation = super.validateConfig(config);
        if (!baseValidation.valid) return baseValidation;
        
        const cfg = config as GoogleSheetsConfig;
        const errors: { field: string; message: string }[] = [];
        
        // Validate URL
        if (cfg.webhookUrl) {
            try {
                const url = new URL(cfg.webhookUrl);
                if (!url.hostname.endsWith('script.google.com')) {
                    errors.push({
                        field: 'webhookUrl',
                        message: 'URL must be a Google Apps Script URL (script.google.com)',
                    });
                }
            } catch {
                errors.push({
                    field: 'webhookUrl',
                    message: 'Invalid URL format',
                });
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    
    /**
     * Test connection to Google Sheets
     */
    async testConnection(config: unknown): Promise<IntegrationTestConnectionResult> {
        const validation = this.validateConfig(config);
        if (!validation.valid) {
            return {
                success: false,
                message: `Configuration invalid: ${validation.errors?.map(e => e.message).join(', ')}`,
            };
        }
        
        const cfg = config as GoogleSheetsConfig;
        const startTime = Date.now();
        
        // Get columns (use configured or default)
        const columns = cfg.columns && cfg.columns.length > 0 
            ? cfg.columns 
            : this.getDefaultColumns();
        
        try {
            const response = await this.httpRequest(cfg.webhookUrl, {
                method: 'POST',
                body: {
                    _test: true,
                    timestamp: new Date().toISOString(),
                    message: 'Connection test from Voice Agent',
                    _columnMapping: columns.map(col => ({
                        name: col.name,
                        source: col.source,
                        path: col.path,
                    })),
                    _sheetName: cfg.sheetName,
                    _spreadsheetId: cfg.spreadsheetId,
                },
                timeout: 15000,
            });
            
            const latencyMs = Date.now() - startTime;
            
            if (response.status >= 200 && response.status < 300) {
                return {
                    success: true,
                    message: 'Successfully connected to Google Sheets',
                    latencyMs,
                    details: response.data,
                };
            } else {
                return {
                    success: false,
                    message: `Google Sheets returned error: ${response.status} ${response.statusText}`,
                    latencyMs,
                    details: response.data,
                };
            }
        } catch (error) {
            return {
                success: false,
                message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                latencyMs: Date.now() - startTime,
            };
        }
    }
    
    /**
     * Get default columns if none configured
     */
    private getDefaultColumns(): DynamicColumnConfig[] {
        return [
            { name: 'Timestamp', source: 'call', path: 'timestamp' },
            { name: 'Call ID', source: 'call', path: 'callId' },
            { name: 'Caller Number', source: 'call', path: 'callerNumber', format: 'phone' },
            { name: 'Duration (sec)', source: 'call', path: 'duration', format: 'number' },
            { name: 'Customer Name', source: 'extracted', path: 'customer name' },
            { name: 'Intent', source: 'extracted', path: 'main intent or purpose of the call' },
            { name: 'Outcome', source: 'extracted', path: 'call outcome or resolution' },
            { name: 'Sentiment', source: 'extracted', path: 'overall sentiment (positive/neutral/negative)' },
        ];
    }
    
    /**
     * Execute the Google Sheets integration
     */
    async execute(
        context: IntegrationExecutionContext,
        config: unknown
    ): Promise<IntegrationExecutionResult> {
        const cfg = config as GoogleSheetsConfig;
        const startTime = Date.now();
        
        // Validate config
        const validation = this.validateConfig(config);
        if (!validation.valid) {
            return this.createErrorResult(
                'INVALID_CONFIG',
                `Configuration error: ${validation.errors?.map(e => e.message).join(', ')}`,
                Date.now() - startTime,
                false
            );
        }
        
        // Get columns (use configured or default)
        let columns = cfg.columns && cfg.columns.length > 0 
            ? cfg.columns 
            : this.getDefaultColumns();
        
        // Add transcript column if requested and not already present
        if (cfg.includeTranscript !== false) {
            const hasTranscript = columns.some(c => c.source === 'transcript' && c.path === 'full');
            if (!hasTranscript) {
                columns = [...columns, { name: 'Transcript', source: 'transcript', path: 'full' }];
            }
        }
        
        this.logger.info('Processing Google Sheets integration', {
            callId: context.callId,
            columnCount: columns.length,
            extractedColumnsCount: columns.filter(c => c.source === 'extracted').length,
        });
        
        try {
            // Create the data extractor
            const extendedContext = context as ExtendedExecutionContext;
            const extractor = new DynamicDataExtractor(extendedContext);
            
            // Run LLM extraction for 'extracted' columns
            const extractedColumns = columns.filter(c => c.source === 'extracted');
            if (extractedColumns.length > 0) {
                this.logger.info('Running LLM extraction', {
                    columnsToExtract: extractedColumns.map(c => c.name),
                });
                await extractor.extractWithLLM(columns);
            }
            
            // Extract all column data
            const payload: Record<string, unknown> = extractor.extractAll(columns);
            
            // Add metadata for the Apps Script
            payload._columnMapping = columns.map(col => ({
                name: col.name,
                source: col.source,
                path: col.path,
            }));
            
            if (cfg.spreadsheetId) {
                payload._spreadsheetId = cfg.spreadsheetId;
            }
            if (cfg.sheetName) {
                payload._sheetName = cfg.sheetName;
            }
            
            // Send to Google Sheets
            this.logger.info('Sending data to Google Sheets', {
                callId: context.callId,
                columnCount: columns.length,
            });
            
            const response = await this.httpRequest(cfg.webhookUrl, {
                method: 'POST',
                body: payload,
                timeout: 30000,
            });
            
            const executionTimeMs = Date.now() - startTime;
            
            if (response.status >= 200 && response.status < 300) {
                this.logger.info('Successfully sent to Google Sheets', {
                    callId: context.callId,
                    executionTimeMs,
                });
                
                return this.createSuccessResult(
                    { message: 'Data sent to Google Sheets successfully' },
                    executionTimeMs,
                    payload,
                    response.data
                );
            } else {
                this.logger.error('Google Sheets returned error', {
                    status: response.status,
                    statusText: response.statusText,
                });
                
                return this.createErrorResult(
                    `HTTP_${response.status}`,
                    `Google Sheets error: ${response.statusText}`,
                    executionTimeMs,
                    response.status >= 500,
                    response.data,
                    payload
                );
            }
        } catch (error) {
            const executionTimeMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            this.logger.error('Failed to send to Google Sheets', {
                error: errorMessage,
                callId: context.callId,
            });
            
            return this.createErrorResult(
                'EXECUTION_ERROR',
                errorMessage,
                executionTimeMs,
                true
            );
        }
    }
}

/**
 * Setup instructions
 */
const SETUP_INSTRUCTIONS = `# 📊 Google Sheets Integration Setup

## Step 1: Create Your Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Add column headers in Row 1 (matching your column configuration)

---

## Step 2: Create the Apps Script

1. Click **Extensions** → **Apps Script**
2. Delete any existing code
3. Paste this script:

\`\`\`javascript
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Get sheet
    const sheetName = data._sheetName || 'Call Logs';
    const ss = data._spreadsheetId 
      ? SpreadsheetApp.openById(data._spreadsheetId)
      : SpreadsheetApp.getActiveSpreadsheet();
    
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    
    // Get column mapping
    const mapping = data._columnMapping || [];
    
    // Handle test requests - create/update headers
    if (data._test) {
      if (mapping.length > 0) {
        const headers = mapping.map(col => col.name);
        
        // Create or update header row
        if (sheet.getLastRow() === 0) {
          sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
          sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
        } else {
          // Update existing headers
          sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        }
        
        return ContentService.createTextOutput(JSON.stringify({ 
          success: true, 
          message: 'Connection successful - column headers created/updated',
          columnsCreated: headers.length
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ 
        success: true, 
        message: 'Connection successful' 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Create header row if empty
    if (sheet.getLastRow() === 0 && mapping.length > 0) {
      const headers = mapping.map(col => col.name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    
    // Build row data from mapping
    const rowData = mapping.map(col => data[col.name] || '');
    
    // Append row
    if (rowData.length > 0) {
      sheet.appendRow(rowData);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Data added',
      row: sheet.getLastRow()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    message: 'Voice Agent Integration Active'
  })).setMimeType(ContentService.MimeType.JSON);
}
\`\`\`

4. Click **Save**

---

## Step 3: Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Select **Web app**
3. Set:
   - **Execute as**: Me
   - **Who has access**: Anyone
4. Click **Deploy**
5. Click **Authorize access** and allow permissions
6. **Copy the Web App URL**

---

## Step 4: Configure in Voice Agent

1. Paste the Web App URL
2. Configure your columns:
   - Use **"extracted"** source for data from conversations (AI will find it!)
   - Use **"call"** source for call metadata (ID, duration, phone)
   - Use **"transcript"** source for the conversation text
3. Test the connection
4. Save!

---

## Example Column Configuration

| Column Name | Source | Path |
|-------------|--------|------|
| Timestamp | call | timestamp |
| Customer Name | extracted | customer name |
| Phone Number | call | callerNumber |
| Appointment Date | extracted | appointment date |
| Reason | extracted | reason for call |
| Duration | call | duration |
| Transcript | transcript | full |

The AI will automatically extract the data from your conversations!
`;

// Export singleton
export const googleSheetsPlugin = new GoogleSheetsPlugin();
