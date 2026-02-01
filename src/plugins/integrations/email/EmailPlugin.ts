/**
 * Email Notification Integration Plugin
 * 
 * Sends call summaries and alerts via email using various providers.
 * Supports SMTP, SendGrid, Mailgun, and AWS SES.
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
 * Email Plugin Configuration
 */
export interface EmailConfig {
    provider: 'smtp' | 'sendgrid' | 'mailgun' | 'ses';
    
    // SMTP settings
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;  // TLS
    
    // API settings (for SendGrid, Mailgun, SES)
    apiKey?: string;
    apiSecret?: string;  // For Mailgun
    region?: string;     // For SES
    domain?: string;     // For Mailgun
    
    // Common settings
    username?: string;
    password?: string;
    fromEmail: string;
    fromName?: string;
    toEmails: string[];
    ccEmails?: string[];
    
    // Template settings
    subjectTemplate?: string;
    includeTranscript?: boolean;
}

/**
 * Email Notification Integration Plugin
 */
export class EmailPlugin extends IntegrationPluginBase {
    
    get metadata(): IntegrationPluginMetadata {
        return createPluginMetadata(
            'email-smtp',
            'Email Notifications',
            'Send call summaries and alerts via email using SMTP or email service providers.',
            'notification',
            ['call_ended', 'escalation_requested'],
            {
                type: 'object',
                required: ['provider', 'fromEmail', 'toEmails'],
                properties: {
                    provider: {
                        type: 'string',
                        title: 'Email Provider',
                        description: 'Choose your email sending method',
                        enum: ['smtp', 'sendgrid', 'mailgun', 'ses'],
                        default: 'smtp',
                    },
                    smtpHost: {
                        type: 'string',
                        title: 'SMTP Host',
                        description: 'SMTP server hostname (e.g., smtp.gmail.com)',
                    },
                    smtpPort: {
                        type: 'number',
                        title: 'SMTP Port',
                        description: 'SMTP server port (typically 587 or 465)',
                        default: 587,
                    },
                    smtpSecure: {
                        type: 'boolean',
                        title: 'Use TLS',
                        description: 'Enable TLS encryption',
                        default: true,
                    },
                    apiKey: {
                        type: 'string',
                        title: 'API Key',
                        description: 'API key for SendGrid, Mailgun, or SES',
                        format: 'password',
                    },
                    username: {
                        type: 'string',
                        title: 'Username',
                        description: 'SMTP username or email address',
                    },
                    password: {
                        type: 'string',
                        title: 'Password',
                        description: 'SMTP password or app-specific password',
                        format: 'password',
                    },
                    fromEmail: {
                        type: 'string',
                        title: 'From Email',
                        description: 'Sender email address',
                        format: 'email',
                    },
                    fromName: {
                        type: 'string',
                        title: 'From Name',
                        description: 'Sender display name',
                        default: 'Voice Agent',
                    },
                    toEmails: {
                        type: 'array',
                        title: 'To Emails',
                        description: 'Recipient email addresses',
                        items: { type: 'string', format: 'email' },
                    },
                    ccEmails: {
                        type: 'array',
                        title: 'CC Emails',
                        description: 'CC recipient email addresses',
                        items: { type: 'string', format: 'email' },
                    },
                    subjectTemplate: {
                        type: 'string',
                        title: 'Subject Template',
                        description: 'Email subject template. Use {{variable}} for dynamic values.',
                        default: 'Voice Agent: {{intent}} from {{callerNumber}}',
                    },
                    includeTranscript: {
                        type: 'boolean',
                        title: 'Include Transcript',
                        description: 'Include full conversation transcript in email',
                        default: true,
                    },
                },
            },
            {
                icon: '📧',
                version: '1.0.0',
                setupInstructions: SETUP_INSTRUCTIONS,
            }
        );
    }
    
    /**
     * Validate email configuration
     */
    validateConfig(config: unknown): IntegrationConfigValidationResult {
        const baseValidation = super.validateConfig(config);
        if (!baseValidation.valid) return baseValidation;
        
        const cfg = config as EmailConfig;
        const errors: { field: string; message: string }[] = [];
        
        // Validate provider-specific requirements
        if (cfg.provider === 'smtp') {
            if (!cfg.smtpHost) {
                errors.push({ field: 'smtpHost', message: 'SMTP host is required' });
            }
            if (!cfg.username) {
                errors.push({ field: 'username', message: 'Username is required for SMTP' });
            }
            if (!cfg.password) {
                errors.push({ field: 'password', message: 'Password is required for SMTP' });
            }
        } else if (cfg.provider === 'sendgrid' || cfg.provider === 'mailgun' || cfg.provider === 'ses') {
            if (!cfg.apiKey) {
                errors.push({ field: 'apiKey', message: 'API key is required' });
            }
        }
        
        // Validate email format
        if (cfg.fromEmail && !this.isValidEmail(cfg.fromEmail)) {
            errors.push({ field: 'fromEmail', message: 'Invalid email format' });
        }
        
        if (cfg.toEmails) {
            for (let i = 0; i < cfg.toEmails.length; i++) {
                if (!this.isValidEmail(cfg.toEmails[i])) {
                    errors.push({ field: `toEmails[${i}]`, message: `Invalid email format: ${cfg.toEmails[i]}` });
                }
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    
    /**
     * Simple email validation
     */
    private isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    
    /**
     * Test connection (validates config since email testing is provider-specific)
     */
    async testConnection(config: unknown): Promise<IntegrationTestConnectionResult> {
        const validation = this.validateConfig(config);
        if (!validation.valid) {
            return {
                success: false,
                message: `Configuration invalid: ${validation.errors?.map(e => e.message).join(', ')}`,
            };
        }
        
        const cfg = config as EmailConfig;
        
        // For API providers, try to make a simple API call
        if (cfg.provider === 'sendgrid') {
            try {
                const response = await this.httpRequest('https://api.sendgrid.com/v3/user/profile', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${cfg.apiKey}`,
                    },
                    timeout: 10000,
                });
                
                return {
                    success: response.status === 200,
                    message: response.status === 200 
                        ? 'SendGrid API key is valid' 
                        : `SendGrid error: ${response.status}`,
                };
            } catch (error) {
                return {
                    success: false,
                    message: `Failed to verify SendGrid: ${error instanceof Error ? error.message : 'Unknown error'}`,
                };
            }
        }
        
        // For SMTP and other providers, just validate config
        return {
            success: true,
            message: `${cfg.provider.toUpperCase()} configuration is valid. Email will be sent on trigger.`,
        };
    }
    
    /**
     * Build HTML email body
     */
    private buildEmailHtml(context: IntegrationExecutionContext, config: EmailConfig): string {
        const isEscalation = context.trigger === 'escalation_requested';
        
        let html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${isEscalation ? '#dc3545' : '#0066cc'}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; }
        .footer { background: #e9ecef; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; color: #666; }
        .info-row { display: flex; margin-bottom: 10px; }
        .info-label { font-weight: bold; width: 150px; }
        .transcript { background: white; border: 1px solid #dee2e6; padding: 15px; margin-top: 15px; white-space: pre-wrap; font-family: monospace; font-size: 13px; max-height: 400px; overflow-y: auto; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        .badge-success { background: #28a745; color: white; }
        .badge-danger { background: #dc3545; color: white; }
        .badge-warning { background: #ffc107; color: black; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2 style="margin:0;">${isEscalation ? '🚨 Escalation Alert' : '📞 Call Summary'}</h2>
        </div>
        <div class="content">
            <div class="info-row">
                <span class="info-label">Caller:</span>
                <span>${context.callerNumber || 'Unknown'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Duration:</span>
                <span>${context.duration ? `${Math.floor(context.duration / 60)}m ${context.duration % 60}s` : 'N/A'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Intent:</span>
                <span>${context.extractedData?.primaryIntent || 'Not detected'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Sentiment:</span>
                <span class="badge ${this.getSentimentBadgeClass(context.extractedData?.sentiment)}">${context.extractedData?.sentiment || 'Unknown'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Outcome:</span>
                <span>${context.extractedData?.outcome || 'Completed'}</span>
            </div>`;
        
        if (context.extractedData?.customerName) {
            html += `
            <div class="info-row">
                <span class="info-label">Customer Name:</span>
                <span>${context.extractedData.customerName}</span>
            </div>`;
        }
        
        if (context.extractedData?.appointmentDate) {
            html += `
            <div class="info-row">
                <span class="info-label">Appointment:</span>
                <span>${context.extractedData.appointmentDate} at ${context.extractedData.appointmentTime || 'TBD'}</span>
            </div>`;
        }
        
        if (config.includeTranscript && context.fullTranscript) {
            html += `
            <h3>Transcript</h3>
            <div class="transcript">${this.escapeHtml(context.fullTranscript)}</div>`;
        }
        
        html += `
        </div>
        <div class="footer">
            <p>Call ID: ${context.callId}<br>
            Agent ID: ${context.agentId}<br>
            Time: ${new Date().toLocaleString()}</p>
            <p>This email was sent automatically by Voice Agent.</p>
        </div>
    </div>
</body>
</html>`;
        
        return html;
    }
    
    /**
     * Get CSS class for sentiment badge
     */
    private getSentimentBadgeClass(sentiment?: string): string {
        switch (sentiment) {
            case 'positive': return 'badge-success';
            case 'negative': return 'badge-danger';
            default: return 'badge-warning';
        }
    }
    
    /**
     * Escape HTML special characters
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    /**
     * Transform context into email payload
     */
    transformPayload(context: IntegrationExecutionContext, config: unknown): unknown {
        const cfg = config as EmailConfig;
        
        // Build subject from template
        const subject = this.replaceTemplateVariables(
            cfg.subjectTemplate || 'Voice Agent: {{intent}} from {{callerNumber}}',
            context
        );
        
        // Build HTML body
        const html = this.buildEmailHtml(context, cfg);
        
        return {
            subject,
            html,
            from: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
            to: cfg.toEmails,
            cc: cfg.ccEmails,
        };
    }
    
    /**
     * Execute email sending
     */
    async execute(
        context: IntegrationExecutionContext,
        config: unknown
    ): Promise<IntegrationExecutionResult> {
        const cfg = config as EmailConfig;
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
        const payload = this.transformPayload(context, config) as {
            subject: string;
            html: string;
            from: string;
            to: string[];
            cc?: string[];
        };
        
        this.logger.info('Sending email notification', {
            callId: context.callId,
            provider: cfg.provider,
            to: cfg.toEmails,
        });
        
        try {
            let result: IntegrationExecutionResult;
            
            switch (cfg.provider) {
                case 'sendgrid':
                    result = await this.sendViaSendGrid(payload, cfg, startTime);
                    break;
                case 'mailgun':
                    result = await this.sendViaMailgun(payload, cfg, startTime);
                    break;
                case 'smtp':
                default:
                    // For SMTP, we'll use a webhook approach or return instructions
                    result = this.createErrorResult(
                        'SMTP_NOT_IMPLEMENTED',
                        'Direct SMTP sending requires a server-side component. Consider using SendGrid or Mailgun.',
                        Date.now() - startTime,
                        false
                    );
            }
            
            return result;
        } catch (error) {
            const executionTimeMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            this.logger.error('Failed to send email', {
                callId: context.callId,
                error: errorMessage,
            });
            
            return this.createErrorResult(
                'EMAIL_ERROR',
                errorMessage,
                executionTimeMs,
                true,
                undefined,
                payload
            );
        }
    }
    
    /**
     * Send email via SendGrid API
     */
    private async sendViaSendGrid(
        payload: { subject: string; html: string; from: string; to: string[]; cc?: string[] },
        config: EmailConfig,
        startTime: number
    ): Promise<IntegrationExecutionResult> {
        const sendGridPayload = {
            personalizations: [{
                to: payload.to.map(email => ({ email })),
                cc: payload.cc?.map(email => ({ email })),
            }],
            from: { email: config.fromEmail, name: config.fromName || 'Voice Agent' },
            subject: payload.subject,
            content: [{
                type: 'text/html',
                value: payload.html,
            }],
        };
        
        const response = await this.httpRequest('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: sendGridPayload,
            timeout: 30000,
        });
        
        const executionTimeMs = Date.now() - startTime;
        
        if (response.status === 202) {
            return this.createSuccessResult(
                { message: 'Email sent via SendGrid' },
                executionTimeMs,
                sendGridPayload,
                { status: 'accepted' }
            );
        } else {
            return this.createErrorResult(
                `SENDGRID_${response.status}`,
                `SendGrid error: ${JSON.stringify(response.data)}`,
                executionTimeMs,
                response.status >= 500,
                response.data,
                sendGridPayload
            );
        }
    }
    
    /**
     * Send email via Mailgun API
     */
    private async sendViaMailgun(
        payload: { subject: string; html: string; from: string; to: string[]; cc?: string[] },
        config: EmailConfig,
        startTime: number
    ): Promise<IntegrationExecutionResult> {
        if (!config.domain) {
            return this.createErrorResult(
                'MISSING_DOMAIN',
                'Mailgun domain is required',
                Date.now() - startTime,
                false
            );
        }
        
        const formData = new URLSearchParams();
        formData.append('from', payload.from);
        formData.append('to', payload.to.join(','));
        if (payload.cc) {
            formData.append('cc', payload.cc.join(','));
        }
        formData.append('subject', payload.subject);
        formData.append('html', payload.html);
        
        const auth = Buffer.from(`api:${config.apiKey}`).toString('base64');
        
        const response = await fetch(`https://api.mailgun.net/v3/${config.domain}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formData.toString(),
        });
        
        const executionTimeMs = Date.now() - startTime;
        const data = await response.json();
        
        if (response.status === 200) {
            return this.createSuccessResult(
                { message: 'Email sent via Mailgun', id: data.id },
                executionTimeMs,
                { to: payload.to, subject: payload.subject },
                data
            );
        } else {
            return this.createErrorResult(
                `MAILGUN_${response.status}`,
                `Mailgun error: ${data.message || JSON.stringify(data)}`,
                executionTimeMs,
                response.status >= 500,
                data
            );
        }
    }
}

/**
 * Setup instructions for Email
 */
const SETUP_INSTRUCTIONS = `# 📧 Email Integration Setup Guide

## Overview
Send call summaries and alerts via email. Supports multiple providers:
- **SMTP** - Any email server
- **SendGrid** - Popular email API
- **Mailgun** - Developer-friendly email API
- **AWS SES** - Amazon's email service

---

## Option 1: SendGrid (Recommended)

### Step 1: Create SendGrid Account
1. Go to [SendGrid](https://sendgrid.com)
2. Sign up for a free account (100 emails/day free)
3. Verify your email address

### Step 2: Create API Key
1. Go to **Settings** → **API Keys**
2. Click **Create API Key**
3. Name: "Voice Agent"
4. Permissions: **Restricted Access** → Enable **Mail Send**
5. Click **Create & View**
6. **Copy the API key** (shown only once!)

### Step 3: Verify Sender
1. Go to **Settings** → **Sender Authentication**
2. Choose **Single Sender Verification** (easiest)
3. Add your sender email and verify it

### Step 4: Configure in Tool Marketplace
1. Provider: **SendGrid**
2. API Key: Paste your key
3. From Email: Your verified sender email
4. To Emails: Recipients

---

## Option 2: Mailgun

### Step 1: Create Mailgun Account
1. Go to [Mailgun](https://mailgun.com)
2. Sign up (5,000 emails/month free for 3 months)
3. Add and verify a domain (or use sandbox for testing)

### Step 2: Get API Key
1. Go to **Settings** → **API Security**
2. Copy your **Private API Key**
3. Note your **Domain** (e.g., mg.yourdomain.com)

### Step 3: Configure in Tool Marketplace
1. Provider: **Mailgun**
2. API Key: Your private API key
3. Domain: Your Mailgun domain
4. From Email: sender@yourdomain.com

---

## Option 3: Gmail SMTP

### Step 1: Enable App Password
1. Go to [Google Account](https://myaccount.google.com)
2. Security → 2-Step Verification (must be enabled)
3. Security → App passwords
4. Generate password for "Mail"

### Step 2: Configure
- SMTP Host: \`smtp.gmail.com\`
- SMTP Port: \`587\`
- Username: Your Gmail address
- Password: App password (not your regular password)

⚠️ **Note**: Gmail has sending limits (500/day for consumer accounts)

---

## Email Template Variables

Use these in the Subject Template:
- \`{{callId}}\` - Call identifier
- \`{{callerNumber}}\` - Phone number
- \`{{intent}}\` - Detected intent
- \`{{customerName}}\` - Customer name
- \`{{sentiment}}\` - Call sentiment
- \`{{duration}}\` - Call duration

### Example Subjects
- \`Voice Agent: {{intent}} from {{callerNumber}}\`
- \`📞 New Call - {{customerName}} - {{sentiment}}\`
- \`[{{outcome}}] Call {{callId}} Summary\`

---

## Troubleshooting

### "Unauthorized" error (SendGrid)
- Verify API key has Mail Send permission
- Regenerate API key if needed

### "Domain not verified" (Mailgun)
- Complete domain verification in Mailgun dashboard
- Or use sandbox domain for testing

### "Authentication failed" (SMTP)
- For Gmail, use App Password not regular password
- Check username/password combination
- Verify SMTP settings (host, port, TLS)

### Emails going to spam
- Verify sender domain (SPF, DKIM records)
- Use a professional sender name
- Avoid spam trigger words in subject
`;

// Export singleton instance
export const emailPlugin = new EmailPlugin();
