/**
 * Generic Webhook Integration Plugin
 * 
 * Sends call data to any HTTP endpoint with customizable payloads.
 * Supports custom headers, body templates, and multiple HTTP methods.
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

/**
 * Webhook Plugin Configuration
 */
export interface WebhookConfig {
    url: string;                          // Webhook URL
    method: 'POST' | 'PUT' | 'PATCH';    // HTTP method
    headers?: Record<string, string>;     // Custom headers
    bodyTemplate?: string;                // JSON template with {{variables}}
    timeout?: number;                     // Request timeout in ms
    retryOn5xx?: boolean;                // Retry on server errors
}

/**
 * Generic Webhook Integration Plugin
 */
export class WebhookPlugin extends IntegrationPluginBase {
    
    get metadata(): IntegrationPluginMetadata {
        return createPluginMetadata(
            'generic-webhook',
            'Custom Webhook',
            'Send call data to any HTTP endpoint with customizable payloads.',
            'webhook',
            ['call_started', 'call_ended', 'transcript_ready', 'intent_detected', 'escalation_requested'],
            {
                type: 'object',
                required: ['url', 'method'],
                properties: {
                    url: {
                        type: 'string',
                        title: 'Webhook URL',
                        description: 'The HTTP endpoint to send data to (must be https:// for production)',
                        format: 'uri',
                    },
                    method: {
                        type: 'string',
                        title: 'HTTP Method',
                        description: 'The HTTP method to use',
                        enum: ['POST', 'PUT', 'PATCH'],
                        default: 'POST',
                    },
                    headers: {
                        type: 'object',
                        title: 'Custom Headers',
                        description: 'Additional HTTP headers (e.g., Authorization, X-API-Key)',
                        additionalProperties: { type: 'string' },
                    },
                    bodyTemplate: {
                        type: 'string',
                        title: 'Body Template (JSON)',
                        description: 'Custom JSON body template. Use {{variable}} for dynamic values. Leave empty for default payload.',
                    },
                    timeout: {
                        type: 'number',
                        title: 'Timeout (ms)',
                        description: 'Request timeout in milliseconds',
                        default: 30000,
                        minimum: 1000,
                        maximum: 120000,
                    },
                    retryOn5xx: {
                        type: 'boolean',
                        title: 'Retry on Server Errors',
                        description: 'Automatically retry when server returns 5xx errors',
                        default: true,
                    },
                },
            },
            {
                icon: '🔗',
                version: '1.0.0',
                setupInstructions: SETUP_INSTRUCTIONS,
            }
        );
    }
    
    /**
     * Validate webhook configuration
     */
    validateConfig(config: unknown): IntegrationConfigValidationResult {
        const baseValidation = super.validateConfig(config);
        if (!baseValidation.valid) return baseValidation;
        
        const cfg = config as WebhookConfig;
        const errors: { field: string; message: string }[] = [];
        
        // URL validation
        if (cfg.url) {
            try {
                const url = new URL(cfg.url);
                if (!['http:', 'https:'].includes(url.protocol)) {
                    errors.push({
                        field: 'url',
                        message: 'URL must use http:// or https:// protocol',
                    });
                }
            } catch {
                errors.push({
                    field: 'url',
                    message: 'Invalid URL format',
                });
            }
        }
        
        // Validate body template is valid JSON (if provided)
        if (cfg.bodyTemplate) {
            try {
                // Replace template variables with test values to validate JSON structure
                const testTemplate = cfg.bodyTemplate.replace(/\{\{[^}]+\}\}/g, '"test"');
                JSON.parse(testTemplate);
            } catch {
                errors.push({
                    field: 'bodyTemplate',
                    message: 'Body template must be valid JSON format',
                });
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    
    /**
     * Test connection to the webhook endpoint
     */
    async testConnection(config: unknown): Promise<IntegrationTestConnectionResult> {
        const validation = this.validateConfig(config);
        if (!validation.valid) {
            return {
                success: false,
                message: `Configuration invalid: ${validation.errors?.map(e => e.message).join(', ')}`,
            };
        }
        
        const cfg = config as WebhookConfig;
        const startTime = Date.now();
        
        try {
            const testPayload = {
                _test: true,
                timestamp: new Date().toISOString(),
                source: 'voice-agent',
                message: 'Connection test',
            };
            
            const response = await this.httpRequest(cfg.url, {
                method: cfg.method || 'POST',
                headers: cfg.headers,
                body: testPayload,
                timeout: cfg.timeout || 15000,
            });
            
            const latencyMs = Date.now() - startTime;
            
            // Consider 2xx and some 4xx as successful connection
            // (4xx means server received but rejected - connection works)
            if (response.status >= 200 && response.status < 500) {
                return {
                    success: true,
                    message: `Connection successful (HTTP ${response.status})`,
                    latencyMs,
                    details: {
                        status: response.status,
                        statusText: response.statusText,
                    },
                };
            } else {
                return {
                    success: false,
                    message: `Server error: ${response.status} ${response.statusText}`,
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
     * Transform context using custom template or default payload
     */
    transformPayload(context: IntegrationExecutionContext, config: unknown): unknown {
        const cfg = config as WebhookConfig;
        
        // If custom template provided, use it
        if (cfg.bodyTemplate) {
            const populated = this.replaceTemplateVariables(cfg.bodyTemplate, context);
            try {
                return JSON.parse(populated);
            } catch {
                // If parsing fails, return as string
                return { data: populated };
            }
        }
        
        // Default payload structure
        return super.transformPayload(context, config);
    }
    
    /**
     * Execute the webhook call
     */
    async execute(
        context: IntegrationExecutionContext,
        config: unknown
    ): Promise<IntegrationExecutionResult> {
        const cfg = config as WebhookConfig;
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
        
        // Build payload
        const payload = this.transformPayload(context, config);
        
        this.logger.info('Sending webhook', {
            callId: context.callId,
            url: cfg.url,
            method: cfg.method,
        });
        
        try {
            const response = await this.httpRequest(cfg.url, {
                method: cfg.method || 'POST',
                headers: cfg.headers,
                body: payload,
                timeout: cfg.timeout || 30000,
            });
            
            const executionTimeMs = Date.now() - startTime;
            
            if (response.status >= 200 && response.status < 300) {
                this.logger.info('Webhook sent successfully', {
                    callId: context.callId,
                    status: response.status,
                    executionTimeMs,
                });
                
                return this.createSuccessResult(
                    {
                        status: response.status,
                        message: 'Webhook delivered successfully',
                    },
                    executionTimeMs,
                    payload,
                    response.data
                );
            } else {
                const isRetryable = cfg.retryOn5xx !== false && response.status >= 500;
                
                this.logger.error('Webhook returned error', {
                    callId: context.callId,
                    status: response.status,
                    statusText: response.statusText,
                });
                
                return this.createErrorResult(
                    `HTTP_${response.status}`,
                    `Webhook error: ${response.status} ${response.statusText}`,
                    executionTimeMs,
                    isRetryable,
                    response.data,
                    payload
                );
            }
        } catch (error) {
            const executionTimeMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            this.logger.error('Webhook request failed', {
                callId: context.callId,
                error: errorMessage,
            });
            
            return this.createErrorResult(
                'NETWORK_ERROR',
                errorMessage,
                executionTimeMs,
                true, // Network errors are retryable
                undefined,
                payload
            );
        }
    }
}

/**
 * Setup instructions for Custom Webhook
 */
const SETUP_INSTRUCTIONS = `# 🔗 Custom Webhook Setup Guide

## Overview
The Custom Webhook integration allows you to send call data to any HTTP endpoint. This is perfect for:
- Integrating with custom backend systems
- Triggering Zapier/Make.com workflows
- Sending data to your own APIs
- Building custom integrations

---

## Configuration Options

### 1. Webhook URL (Required)
The HTTP endpoint where data will be sent.

**Examples:**
- \`https://api.yourcompany.com/voice-agent/calls\`
- \`https://hooks.zapier.com/hooks/catch/123/abc\`
- \`https://hook.eu1.make.com/abc123\`

### 2. HTTP Method (Required)
Choose the appropriate method for your endpoint:
- **POST** - Most common, creates new resources
- **PUT** - Replaces existing resources
- **PATCH** - Partially updates resources

### 3. Custom Headers (Optional)
Add authentication or custom headers:

\`\`\`json
{
  "Authorization": "Bearer your-api-token",
  "X-API-Key": "your-api-key",
  "X-Custom-Header": "custom-value"
}
\`\`\`

### 4. Body Template (Optional)
Customize the JSON payload. Use \`{{variable}}\` for dynamic values.

---

## Available Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| \`{{callId}}\` | Unique call identifier | "call_abc123" |
| \`{{callSessionId}}\` | Session ID | "sess_xyz789" |
| \`{{agentId}}\` | Agent configuration ID | "agent_456" |
| \`{{organizationId}}\` | Organization ID | "org_001" |
| \`{{callerNumber}}\` | Caller's phone number | "+1-555-123-4567" |
| \`{{callDirection}}\` | Inbound or outbound | "inbound" |
| \`{{duration}}\` | Call duration in seconds | "180" |
| \`{{transcript}}\` | Full conversation text | "Hello, I'd like to..." |
| \`{{customerName}}\` | Extracted customer name | "John Smith" |
| \`{{customerEmail}}\` | Extracted email | "john@example.com" |
| \`{{customerPhone}}\` | Extracted phone | "+1-555-987-6543" |
| \`{{intent}}\` | Detected primary intent | "appointment_booking" |
| \`{{sentiment}}\` | Call sentiment | "positive" |
| \`{{appointmentDate}}\` | Booked date | "2024-03-15" |
| \`{{appointmentTime}}\` | Booked time | "14:30" |
| \`{{outcome}}\` | Call outcome | "successful" |
| \`{{trigger}}\` | What triggered this | "call_ended" |
| \`{{timestamp}}\` | ISO timestamp | "2024-03-15T14:30:00Z" |

---

## Example Body Templates

### Simple Payload
\`\`\`json
{
  "event": "call_completed",
  "call_id": "{{callId}}",
  "phone": "{{callerNumber}}",
  "duration_seconds": {{duration}},
  "summary": "{{intent}}",
  "timestamp": "{{timestamp}}"
}
\`\`\`

### Detailed CRM Integration
\`\`\`json
{
  "source": "voice_agent",
  "event_type": "{{trigger}}",
  "contact": {
    "name": "{{customerName}}",
    "phone": "{{callerNumber}}",
    "email": "{{customerEmail}}"
  },
  "call": {
    "id": "{{callId}}",
    "direction": "{{callDirection}}",
    "duration": {{duration}},
    "outcome": "{{outcome}}",
    "sentiment": "{{sentiment}}"
  },
  "appointment": {
    "date": "{{appointmentDate}}",
    "time": "{{appointmentTime}}"
  },
  "metadata": {
    "agent_id": "{{agentId}}",
    "org_id": "{{organizationId}}",
    "processed_at": "{{timestamp}}"
  }
}
\`\`\`

### Zapier-Compatible Format
\`\`\`json
{
  "callId": "{{callId}}",
  "callerNumber": "{{callerNumber}}",
  "customerName": "{{customerName}}",
  "intent": "{{intent}}",
  "transcript": "{{transcript}}",
  "appointmentDate": "{{appointmentDate}}",
  "appointmentTime": "{{appointmentTime}}"
}
\`\`\`

---

## Integration Examples

### Zapier
1. Create a Zap with "Webhooks by Zapier" trigger
2. Choose "Catch Hook"
3. Copy the webhook URL
4. Paste in Tool Marketplace configuration
5. Test to see sample data structure

### Make.com (Integromat)
1. Create a new scenario
2. Add "Webhooks" → "Custom webhook" module
3. Copy the webhook URL
4. Configure in Tool Marketplace
5. Click "Test Connection" to register the webhook

### n8n
1. Add a "Webhook" node
2. Set method to POST
3. Copy the production URL
4. Use in your Tool Marketplace configuration

---

## Security Best Practices

1. **Always use HTTPS** in production
2. **Add authentication headers** to prevent unauthorized access
3. **Validate incoming data** on your server
4. **Use webhook secrets** when possible
5. **Set appropriate timeouts** based on your endpoint's response time

---

## Troubleshooting

### "Connection refused" error
- Verify the URL is correct and accessible
- Check if your server has firewall rules blocking the connection

### "Timeout" error
- Increase the timeout setting
- Check if your endpoint is responding slowly
- Consider async processing on your server

### "401 Unauthorized" error
- Verify your authentication headers
- Check if API key/token is valid and not expired

### "400 Bad Request" error
- Validate your body template is valid JSON
- Ensure all required fields are present
- Check your endpoint's expected format
`;

// Export singleton instance
export const webhookPlugin = new WebhookPlugin();
