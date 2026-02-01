/**
 * Voice Assistant Class
 * 
 * Extends LiveKit's voice.Agent with session lifecycle management.
 * @module agent/voice-assistant
 */

import { voice, llm } from '@livekit/agents';
import { logger } from '../core/logging.js';
import { DEFAULT_AGENT } from './config.js';
import type { AgentContext } from './types.js';
import { getIntegrationEventHandler } from '../services/IntegrationEventHandler.js';
import { config } from '../core/config.js';

/**
 * Global active sessions tracker for graceful shutdown
 */
export const activeSessions = new Map<string, { callTracker: any; sessionId: string }>();

/**
 * Production Voice Assistant
 */
export class VoiceAssistant extends voice.Agent {
  private ctx?: AgentContext;

  constructor(systemPrompt: string, tools: llm.ToolContext, ctx?: AgentContext) {
    super({ instructions: systemPrompt, tools });
    this.ctx = ctx;
  }

  /**
   * Trigger integrations at call end (Google Sheets, Slack, Email, etc.)
   * This is DYNAMIC - it uses whatever integrations the user has configured for the agent
   */
  private async triggerCallEndIntegrations(): Promise<void> {
    if (!this.ctx?.sessionId || !this.ctx?.callTracker) {
      return;
    }

    try {
      // Get the integration event handler
      const integrationHandler = getIntegrationEventHandler({
        convexUrl: config.convex.url,
      });

      // Get conversation history for context
      const history = await this.ctx.callTracker.getConversationHistory(this.ctx.sessionId);
      
      // Add all transcript messages to the integration handler's session
      for (const interaction of history.interactions) {
        if (interaction.userInput) {
          integrationHandler.addTranscriptMessage(
            this.ctx.sessionId,
            'user',
            interaction.userInput
          );
        }
        if (interaction.agentResponse) {
          integrationHandler.addTranscriptMessage(
            this.ctx.sessionId,
            'assistant',
            interaction.agentResponse
          );
        }
      }

      // Find any function calls and extract data dynamically
      const functionCalls = history.interactions.filter(i => i.functionName);
      const extractedData: Record<string, unknown> = {};

      // Register ALL function calls with the integration handler for dynamic extraction
      for (const call of functionCalls) {
        if (call.functionParams) {
          // Register function call for dynamic data extraction (used by Google Sheets, etc.)
          integrationHandler.onFunctionCalled(
            this.ctx.sessionId,
            call.functionName || 'unknown',
            call.functionParams as Record<string, unknown>,
            call.functionResult,
            true // success
          );
          
          // Also merge all function parameters into extractedData for legacy compatibility
          const params = call.functionParams as Record<string, unknown>;
          for (const [key, value] of Object.entries(params)) {
            extractedData[key] = value;
          }
        }
        
        // Track which functions were called
        if (!extractedData.functionsUsed) {
          extractedData.functionsUsed = [];
        }
        (extractedData.functionsUsed as string[]).push(call.functionName || 'unknown');
      }

      // Update extracted data in the integration handler
      integrationHandler.updateExtractedData(this.ctx.sessionId, extractedData);

      // Log function call info before triggering call_ended
      logger.info('Function calls registered for integrations', {
        sessionId: this.ctx.sessionId,
        totalFunctionCalls: functionCalls.length,
        functionNames: functionCalls.map(f => f.functionName),
      });

      // Trigger call_ended event for ALL configured integrations
      await integrationHandler.onCallEnded(this.ctx.sessionId, extractedData.outcome as string);
      
      logger.info('Triggered call_ended integration event', {
        sessionId: this.ctx.sessionId,
        functionsUsed: extractedData.functionsUsed,
      });

    } catch (error) {
      logger.error('Failed to trigger call end integrations', {
        sessionId: this.ctx.sessionId,
        error: (error as Error).message,
      });
    }
  }

  async say(text: string, _allowInterruptions?: boolean): Promise<void> {
    if (this.ctx?.callTracker && this.ctx?.sessionId && text) {
      this.ctx.callTracker.logAgentResponse(
        this.ctx.sessionId, 
        this.ctx.organizationId, 
        text, 
        { agentId: this.ctx.agentId }
      ).catch(err => logger.error('Failed to log agent response', { error: err.message }));
    }
  }

  async onEnter(): Promise<void> {
    logger.info('Voice Assistant activated', {
      sessionId: this.ctx?.sessionId,
      agentId: this.ctx?.agentId,
    });

    if (this.ctx?.sessionId && this.ctx?.callTracker) {
      activeSessions.set(this.ctx.sessionId, {
        callTracker: this.ctx.callTracker,
        sessionId: this.ctx.sessionId,
      });
    }

    // Initialize integration handler for this call
    try {
      const integrationHandler = getIntegrationEventHandler({
        convexUrl: config.convex.url,
      });
      
      await integrationHandler.onCallStarted({
        callId: this.ctx?.sessionId || '',
        callSessionId: this.ctx?.sessionId || '',
        agentId: this.ctx?.agentId || '',
        organizationId: this.ctx?.organizationId || '',
        callerNumber: this.ctx?.callerPhoneNumber,
        callDirection: this.ctx?.callDirection || 'inbound',
      });
    } catch (error) {
      logger.debug('Integration handler init skipped', { error: (error as Error).message });
    }

    this.ctx?.latencyTracker?.markAgentSpeechStart();

    // Delay to ensure audio path is established
    await new Promise(resolve => setTimeout(resolve, 2000));

    const greeting = this.ctx?.greeting || DEFAULT_AGENT.greeting;
    const splitIndex = greeting.indexOf('.');

    if (splitIndex > -1 && splitIndex < greeting.length - 2) {
      const part1 = greeting.substring(0, splitIndex + 1).trim();
      const part2 = greeting.substring(splitIndex + 1).trim();

      if (part1) await this.session.say(part1);
      await new Promise(resolve => setTimeout(resolve, 500));
      if (part2) await this.session.say(part2);
    } else {
      await this.session.say(greeting);
    }
  }

  async onExit(): Promise<void> {
    logger.info('Voice Assistant deactivated', { sessionId: this.ctx?.sessionId });
    
    if (this.ctx?.sessionId) {
      activeSessions.delete(this.ctx.sessionId);
    }

    // Print call summary
    this.ctx?.metricsCollector?.printSessionSummary();

    // Flush latency metrics
    if (this.ctx?.latencyTracker && this.ctx?.sessionId) {
      try {
        this.ctx.latencyTracker.logSummary();
        await this.ctx.latencyTracker.flushToDatabase(
          this.ctx.organizationId,
          this.ctx.agentId
        );
      } catch (error) {
        logger.error('Failed to flush latency metrics', { error: (error as Error).message });
      }
    }

    // Cleanup ambient audio
    this.ctx?.cleanupAmbientAudio?.();
    
    // Flush to database
    if (this.ctx?.callTracker && this.ctx?.sessionId) {
      try {
        await this.ctx.callTracker.flushSessionToConvex(this.ctx.sessionId);
      } catch (error) {
        logger.error('Failed to save session data', { error: (error as Error).message });
      }
    }

    // Send appointment data to Google Sheets (if webhook is configured)
    if (this.ctx?.callTracker && this.ctx?.sessionId) {
      try {
        await this.triggerCallEndIntegrations();
      } catch (error) {
        logger.error('Failed to trigger call end integrations', { 
          error: (error as Error).message,
          sessionId: this.ctx.sessionId 
        });
      }
    }

    // End session
    if (this.ctx?.sessionService && this.ctx?.sessionId) {
      try {
        await this.ctx.sessionService.endSession(this.ctx.sessionId);
      } catch (error) {
        logger.error('Failed to end session', { error: (error as Error).message });
      }
    }
  }
}
