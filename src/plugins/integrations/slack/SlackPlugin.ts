/**
 * Slack Notification Integration Plugin
 * 
 * Sends call summaries, alerts, and updates to Slack channels
 * using Slack Incoming Webhooks.
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
 * Slack Plugin Configuration
 */
export interface SlackConfig {
    webhookUrl: string;           // Slack Incoming Webhook URL
    channel?: string;             // Channel override (e.g., #sales)
    username?: string;            // Bot username
    iconEmoji?: string;           // Bot icon emoji
    includeTranscript?: boolean;  // Include full transcript
    mentionUsers?: string[];      // Users to @ mention
    notifyOnEscalation?: boolean; // Special formatting for escalations
}

/**
 * Slack Notification Integration Plugin
 */
export class SlackPlugin extends IntegrationPluginBase {

    get metadata(): IntegrationPluginMetadata {
        return createPluginMetadata(
            'slack-webhook',
            'Slack Notifications',
            'Send call summaries, alerts, and updates to Slack channels.',
            'notification',
            ['call_ended', 'escalation_requested'],
            {
                type: 'object',
                required: ['webhookUrl'],
                properties: {
                    webhookUrl: {
                        type: 'string',
                        title: 'Slack Webhook URL',
                        description: 'Your Slack Incoming Webhook URL (starts with https://hooks.slack.com/)',
                        pattern: '^https://hooks\\.slack\\.com/.*$',
                    },
                    channel: {
                        type: 'string',
                        title: 'Channel Override',
                        description: 'Override the default channel (e.g., #sales-notifications)',
                        pattern: '^#.*$',
                    },
                    username: {
                        type: 'string',
                        title: 'Bot Username',
                        description: 'Name displayed for the bot',
                        default: 'Voice Agent',
                    },
                    iconEmoji: {
                        type: 'string',
                        title: 'Bot Icon',
                        description: 'Emoji for bot avatar (e.g., :phone:)',
                        default: ':telephone_receiver:',
                    },
                    includeTranscript: {
                        type: 'boolean',
                        title: 'Include Transcript',
                        description: 'Include full conversation transcript in message',
                        default: false,
                    },
                    mentionUsers: {
                        type: 'array',
                        title: 'Mention Users',
                        description: 'Slack user IDs to @ mention (e.g., U012345)',
                        items: { type: 'string' },
                    },
                    notifyOnEscalation: {
                        type: 'boolean',
                        title: 'Alert on Escalation',
                        description: 'Send urgent notification when customer requests human',
                        default: true,
                    },
                },
            },
            {
                icon: '💬',
                version: '1.0.0',
                setupInstructions: SETUP_INSTRUCTIONS,
                documentationUrl: 'https://api.slack.com/messaging/webhooks',
            }
        );
    }

    /**
     * Validate Slack configuration
     */
    validateConfig(config: unknown): IntegrationConfigValidationResult {
        const baseValidation = super.validateConfig(config);
        if (!baseValidation.valid) return baseValidation;

        const cfg = config as SlackConfig;
        const errors: { field: string; message: string }[] = [];

        // Validate webhook URL format
        if (cfg.webhookUrl) {
            try {
                const url = new URL(cfg.webhookUrl);
                if (!url.hostname.includes('hooks.slack.com')) {
                    errors.push({
                        field: 'webhookUrl',
                        message: 'URL must be a Slack webhook URL (hooks.slack.com)',
                    });
                }
            } catch {
                errors.push({
                    field: 'webhookUrl',
                    message: 'Invalid URL format',
                });
            }
        }

        // Validate channel format if provided
        if (cfg.channel && !cfg.channel.startsWith('#')) {
            errors.push({
                field: 'channel',
                message: 'Channel must start with # (e.g., #general)',
            });
        }

        return {
            valid: errors.length === 0,
            errors: errors.length > 0 ? errors : undefined,
        };
    }

    /**
     * Test connection to Slack
     */
    async testConnection(config: unknown): Promise<IntegrationTestConnectionResult> {
        const validation = this.validateConfig(config);
        if (!validation.valid) {
            return {
                success: false,
                message: `Configuration invalid: ${validation.errors?.map(e => e.message).join(', ')}`,
            };
        }

        const cfg = config as SlackConfig;
        const startTime = Date.now();

        try {
            const testMessage = this.buildSlackMessage(
                {
                    text: '✅ *Connection Test Successful*',
                    blocks: [
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: '✅ *Voice Agent Connection Test*\n\nYour Slack integration is configured correctly!',
                            },
                        },
                        {
                            type: 'context',
                            elements: [
                                {
                                    type: 'mrkdwn',
                                    text: `Tested at: ${new Date().toLocaleString()}`,
                                },
                            ],
                        },
                    ],
                },
                cfg
            );

            const response = await this.httpRequest(cfg.webhookUrl, {
                method: 'POST',
                body: testMessage,
                timeout: 15000,
            });

            const latencyMs = Date.now() - startTime;

            if (response.status === 200) {
                return {
                    success: true,
                    message: 'Successfully sent test message to Slack',
                    latencyMs,
                };
            } else {
                return {
                    success: false,
                    message: `Slack returned error: ${response.status} - ${response.data}`,
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
     * Build Slack message with blocks
     */
    private buildSlackMessage(
        content: { text: string; blocks?: unknown[] },
        config: SlackConfig
    ): Record<string, unknown> {
        const message: Record<string, unknown> = {
            text: content.text,
        };

        if (content.blocks) {
            message.blocks = content.blocks;
        }

        // Apply config overrides
        if (config.channel) {
            message.channel = config.channel;
        }
        if (config.username) {
            message.username = config.username;
        }
        if (config.iconEmoji) {
            message.icon_emoji = config.iconEmoji;
        }

        return message;
    }

    /**
     * Format duration as human-readable string
     */
    private formatDuration(seconds: number): string {
        if (seconds < 60) {
            return `${seconds}s`;
        }
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    }

    /**
     * Get emoji for sentiment
     */
    private getSentimentEmoji(sentiment?: string): string {
        switch (sentiment) {
            case 'positive': return '😊';
            case 'negative': return '😟';
            default: return '😐';
        }
    }

    /**
     * Get emoji for outcome
     */
    private getOutcomeEmoji(outcome?: string): string {
        switch (outcome) {
            case 'successful': return '✅';
            case 'failed': return '❌';
            case 'transferred': return '🔄';
            case 'voicemail': return '📫';
            default: return '📞';
        }
    }

    /**
     * Transform context into Slack message payload
     */
    transformPayload(context: IntegrationExecutionContext, config: unknown): unknown {
        const cfg = config as SlackConfig;
        const isEscalation = context.trigger === 'escalation_requested';

        // Build user mentions if configured
        let mentions = '';
        if (cfg.mentionUsers && cfg.mentionUsers.length > 0) {
            mentions = cfg.mentionUsers.map(id => `<@${id}>`).join(' ') + ' ';
        }

        // Build header based on trigger
        let headerText: string;
        let headerEmoji: string;

        if (isEscalation && cfg.notifyOnEscalation !== false) {
            headerEmoji = '🚨';
            headerText = 'Escalation Requested';
        } else {
            headerEmoji = this.getOutcomeEmoji(context.extractedData?.outcome);
            headerText = 'Call Completed';
        }

        // Build the Slack blocks
        const blocks: unknown[] = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: `${headerEmoji} ${headerText}`,
                    emoji: true,
                },
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Caller:*\n${context.callerNumber || 'Unknown'}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Duration:*\n${context.duration ? this.formatDuration(context.duration) : 'N/A'}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Intent:*\n${context.extractedData?.primaryIntent || 'Not detected'}`,
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Sentiment:*\n${this.getSentimentEmoji(context.extractedData?.sentiment)} ${context.extractedData?.sentiment || 'Unknown'}`,
                    },
                ],
            },
        ];

        // Add customer name if available
        if (context.extractedData?.customerName) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Customer:* ${context.extractedData.customerName}`,
                },
            });
        }

        // Add appointment details if available in extracted data
        if (context.extractedData?.appointmentDate) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `📅 *Appointment:* ${context.extractedData?.appointmentDate || 'TBD'} at ${context.extractedData?.appointmentTime || 'TBD'}`,
                },
            });
        }

        // Add transcript if configured
        if (cfg.includeTranscript && context.fullTranscript) {
            const transcript = context.fullTranscript.length > 2900
                ? context.fullTranscript.substring(0, 2900) + '...'
                : context.fullTranscript;

            blocks.push(
                { type: 'divider' },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Transcript:*\n\`\`\`${transcript}\`\`\``,
                    },
                }
            );
        }

        // Add context footer
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: `Call ID: ${context.callId} | ${new Date().toLocaleString()}`,
                },
            ],
        });

        // Build final message
        const fallbackText = `${headerEmoji} ${headerText}: ${context.callerNumber || 'Unknown'} - ${context.extractedData?.primaryIntent || 'Call completed'}`;

        return this.buildSlackMessage(
            {
                text: mentions + fallbackText,
                blocks,
            },
            cfg
        );
    }

    /**
     * Execute the Slack notification
     */
    async execute(
        context: IntegrationExecutionContext,
        config: unknown
    ): Promise<IntegrationExecutionResult> {
        const cfg = config as SlackConfig;
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

        this.logger.info('Sending Slack notification', {
            callId: context.callId,
            trigger: context.trigger,
        });

        try {
            const response = await this.httpRequest(cfg.webhookUrl, {
                method: 'POST',
                body: payload,
                timeout: 15000,
            });

            const executionTimeMs = Date.now() - startTime;

            if (response.status === 200) {
                this.logger.info('Slack notification sent', {
                    callId: context.callId,
                    executionTimeMs,
                });

                return this.createSuccessResult(
                    { message: 'Notification sent to Slack' },
                    executionTimeMs,
                    payload,
                    { status: 'ok' }
                );
            } else {
                this.logger.error('Slack returned error', {
                    status: response.status,
                    response: response.data,
                });

                return this.createErrorResult(
                    `SLACK_ERROR`,
                    `Slack error: ${response.data}`,
                    executionTimeMs,
                    false, // Slack errors are usually not retryable
                    response.data,
                    payload
                );
            }
        } catch (error) {
            const executionTimeMs = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            this.logger.error('Failed to send Slack notification', {
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
 * Setup instructions for Slack
 */
const SETUP_INSTRUCTIONS = `# 💬 Slack Integration Setup Guide

## Overview
Send call notifications, summaries, and alerts to your Slack channels automatically.

---

## Prerequisites
- Slack Workspace with admin access (to add apps)
- A channel where you want notifications

---

## Step 1: Create a Slack App

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Click **Create New App**
3. Choose **From scratch**
4. Enter:
   - **App Name**: "Voice Agent Notifications"
   - **Workspace**: Select your workspace
5. Click **Create App**

---

## Step 2: Enable Incoming Webhooks

1. In the left sidebar, click **Incoming Webhooks**
2. Toggle **Activate Incoming Webhooks** to **On**
3. Scroll down and click **Add New Webhook to Workspace**
4. Select the channel for notifications (e.g., #sales-calls)
5. Click **Allow**
6. **Copy the Webhook URL** - it looks like:
   \`https://hooks.slack.com/services/YOUR_WORKSPACE/YOUR_CHANNEL/YOUR_TOKEN\`

---

## Step 3: Configure in Tool Marketplace

1. Go to your agent's **Integrations** page
2. Click **Add Integration** → **Slack Notifications**
3. Paste your Webhook URL
4. Configure options:
   - **Channel Override**: Leave empty to use the default channel
   - **Bot Username**: How the bot appears (default: "Voice Agent")
   - **Include Transcript**: Whether to show full conversation
5. Select triggers:
   - ✅ **Call Ended** - Get notified of all calls
   - ✅ **Escalation Requested** - Urgent alerts when customers want human
   - ✅ **Appointment Booked** - Confirmed appointments
6. Click **Test Connection** to send a test message
7. Click **Save**

---

## Message Format

### Standard Call Notification
\`\`\`
📞 Call Completed
━━━━━━━━━━━━━━━━
Caller: +1-555-123-4567
Duration: 3m 45s
Intent: Appointment Booking
Sentiment: 😊 positive

Customer: John Smith
📅 Appointment: March 15, 2024 at 2:30 PM

Call ID: call_abc123 | Mar 15, 2024, 2:30:45 PM
\`\`\`

### Escalation Alert
\`\`\`
🚨 Escalation Requested
━━━━━━━━━━━━━━━━━━━━━
@sales-team

Caller: +1-555-123-4567
Duration: 5m 12s
Intent: Complaint
Sentiment: 😟 negative

Customer is requesting to speak with a human representative.
\`\`\`

---

## Advanced Configuration

### Mention Specific Users
To @ mention team members on escalations:
1. Find user IDs: Click on a user → "View profile" → "..." → "Copy member ID"
2. Add to "Mention Users" field: \`U012345678\`

### Multiple Channels
Create separate integrations for different channels:
- #sales-leads for appointment bookings
- #support-escalations for escalation alerts
- #call-logs for all calls

---

## Troubleshooting

### "channel_not_found" error
- The webhook can only post to the channel selected during setup
- Use the Channel Override field with a channel the app has access to
- Or create a new webhook for the desired channel

### Messages not appearing
- Check that the Slack app is still installed in your workspace
- Verify the webhook URL is correct
- Test the webhook using the Test Connection button

### "invalid_payload" error
- This usually means the message is too long
- Try disabling "Include Transcript" option

---

## Security Notes

- Webhook URLs should be kept secret
- If a URL is compromised, regenerate it in Slack App settings
- Consider using a private channel for sensitive call data
`;

// Export singleton instance
export const slackPlugin = new SlackPlugin();
