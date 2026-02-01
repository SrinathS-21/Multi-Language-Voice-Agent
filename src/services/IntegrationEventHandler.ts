/**
 * Integration Event Handler
 * 
 * Handles lifecycle events from the voice agent and triggers
 * appropriate integrations. This is the bridge between the
 * LiveKit agent and the integration plugin system.
 */

import {
    getIntegrationService,
    createExecutionContext,
    IntegrationService,
    IntegrationServiceConfig,
} from './IntegrationService.js';
import { IntegrationTriggerType } from '../plugins/integrations/index.js';

/**
 * Function call data recorded during a call
 */
export interface FunctionCallRecord {
    functionName: string;
    parameters: Record<string, unknown>;
    result?: unknown;
    timestamp: number;
    success: boolean;
}

/**
 * Call session data accumulated during a call
 */
export interface CallSessionData {
    callId: string;
    callSessionId: string;
    agentId: string;
    organizationId: string;
    callerNumber?: string;
    callDirection: 'inbound' | 'outbound';
    startTime: Date;
    endTime?: Date;
    duration?: number;
    transcript: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
        timestamp: Date;
    }>;
    extractedData: Record<string, unknown>;
    detectedIntents: string[];
    sentiment?: 'positive' | 'neutral' | 'negative';
    callOutcome?: string;
    metadata: Record<string, unknown>;
    /** All function calls made during the call */
    functionCalls: FunctionCallRecord[];
}

/**
 * Intent detection event
 */
export interface IntentDetectedEvent {
    intent: string;
    confidence: number;
    entities?: Record<string, string>;
    timestamp: Date;
}

/**
 * Escalation event
 */
export interface EscalationEvent {
    reason: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    targetAgent?: string;
    context?: string;
}

/**
 * Integration Event Handler
 * Manages event detection and integration triggering
 */
export class IntegrationEventHandler {
    private service: IntegrationService;
    private callSessions: Map<string, CallSessionData> = new Map();
    
    constructor(config: IntegrationServiceConfig) {
        this.service = getIntegrationService(config);
    }
    
    /**
     * Initialize the handler
     */
    async initialize(): Promise<void> {
        await this.service.initialize();
        console.log('[IntegrationEventHandler] Initialized');
    }
    
    /**
     * Generate a brief summary from transcript
     * This is a simple heuristic-based summary generator
     */
    private generateCallSummary(
        transcript: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: Date }>,
        detectedIntents: string[]
    ): string {
        if (transcript.length === 0) {
            return 'No conversation recorded';
        }
        
        // Extract key information
        const userMessages = transcript.filter(t => t.role === 'user').map(t => t.content);
        const agentMessages = transcript.filter(t => t.role === 'assistant').map(t => t.content);
        
        // Build summary parts
        const parts: string[] = [];
        
        // Add detected intents
        if (detectedIntents.length > 0) {
            const intentText = detectedIntents
                .map(i => i.replace(/_/g, ' '))
                .join(', ');
            parts.push(`Purpose: ${intentText}`);
        }
        
        // Get last agent message as conclusion
        if (agentMessages.length > 0) {
            const lastMessage = agentMessages[agentMessages.length - 1];
            if (lastMessage.length > 100) {
                parts.push(`Conclusion: ${lastMessage.substring(0, 100)}...`);
            } else {
                parts.push(`Conclusion: ${lastMessage}`);
            }
        }
        
        // Count interactions
        parts.push(`${userMessages.length} customer messages, ${agentMessages.length} agent responses`);
        
        return parts.join('. ');
    }
    
    // ==========================================
    // Lifecycle Events
    // ==========================================
    
    /**
     * Called when a new call starts
     */
    async onCallStarted(data: {
        callId: string;
        callSessionId: string;
        agentId: string;
        organizationId: string;
        callerNumber?: string;
        callDirection?: 'inbound' | 'outbound';
    }): Promise<void> {
        console.log(`[IntegrationEventHandler] Call started: ${data.callId}`);
        
        // Initialize session data
        const sessionData: CallSessionData = {
            callId: data.callId,
            callSessionId: data.callSessionId,
            agentId: data.agentId,
            organizationId: data.organizationId,
            callerNumber: data.callerNumber,
            callDirection: data.callDirection || 'inbound',
            startTime: new Date(),
            transcript: [],
            extractedData: {},
            detectedIntents: [],
            metadata: {},
            functionCalls: [],
        };
        
        this.callSessions.set(data.callId, sessionData);
        
        // Trigger integrations
        const context = createExecutionContext({
            callId: data.callId,
            callSessionId: data.callSessionId,
            agentId: data.agentId,
            organizationId: data.organizationId,
            callerNumber: data.callerNumber,
            callDirection: data.callDirection,
            startTime: sessionData.startTime,
        }, 'call_started');
        
        await this.service.triggerIntegrations('call_started', context);
    }
    
    /**
     * Called when a function tool is executed during the call
     * Records the function call for later use by integrations
     */
    onFunctionCalled(
        callId: string, 
        functionName: string, 
        parameters: Record<string, unknown>,
        result?: unknown,
        success: boolean = true
    ): void {
        console.log(`[IntegrationEventHandler] Function called: ${functionName} for call: ${callId}`);
        
        const sessionData = this.callSessions.get(callId);
        if (!sessionData) {
            console.warn(`[IntegrationEventHandler] No session data for function call: ${callId}`);
            return;
        }
        
        // Record the function call
        sessionData.functionCalls.push({
            functionName,
            parameters,
            result,
            timestamp: Date.now(),
            success,
        });
        
        console.log(`[IntegrationEventHandler] Recorded function call: ${functionName} with params:`, 
            JSON.stringify(parameters).substring(0, 200));
    }
    
    /**
     * Called when a call ends
     */
    async onCallEnded(callId: string, outcome?: string): Promise<void> {
        console.log(`[IntegrationEventHandler] Call ended: ${callId}`);
        
        const sessionData = this.callSessions.get(callId);
        if (!sessionData) {
            console.warn(`[IntegrationEventHandler] No session data for call: ${callId}`);
            return;
        }
        
        // Update session data
        sessionData.endTime = new Date();
        sessionData.duration = Math.floor(
            (sessionData.endTime.getTime() - sessionData.startTime.getTime()) / 1000
        );
        if (outcome) {
            sessionData.callOutcome = outcome;
        }
        
        // Auto-generate summary from transcript if not already set
        const autoSummary = !sessionData.extractedData.summary 
            ? this.generateCallSummary(sessionData.transcript, sessionData.detectedIntents)
            : sessionData.extractedData.summary;
        
        console.log(`[IntegrationEventHandler] Call ${callId} had ${sessionData.functionCalls.length} function calls`);
        
        // Trigger integrations with function call data
        const context = createExecutionContext({
            callId: sessionData.callId,
            callSessionId: sessionData.callSessionId,
            agentId: sessionData.agentId,
            organizationId: sessionData.organizationId,
            callerNumber: sessionData.callerNumber,
            callDirection: sessionData.callDirection,
            startTime: sessionData.startTime,
            endTime: sessionData.endTime,
            duration: sessionData.duration,
            transcript: sessionData.transcript,
            extractedData: {
                ...sessionData.extractedData,
                callOutcome: sessionData.callOutcome,
                detectedIntents: sessionData.detectedIntents,
                sentiment: sessionData.sentiment,
                summary: autoSummary,
            },
            functionCalls: sessionData.functionCalls,
        }, 'call_ended');
        
        await this.service.triggerIntegrations('call_ended', context);
        
        // Clean up session after a delay (allow async operations to complete)
        setTimeout(() => {
            this.callSessions.delete(callId);
        }, 60000); // Keep for 1 minute for late events
    }
    
    /**
     * Called when transcript is ready
     */
    async onTranscriptReady(callId: string): Promise<void> {
        console.log(`[IntegrationEventHandler] Transcript ready: ${callId}`);
        
        const sessionData = this.callSessions.get(callId);
        if (!sessionData) {
            console.warn(`[IntegrationEventHandler] No session data for call: ${callId}`);
            return;
        }
        
        const context = createExecutionContext({
            callId: sessionData.callId,
            callSessionId: sessionData.callSessionId,
            agentId: sessionData.agentId,
            organizationId: sessionData.organizationId,
            callerNumber: sessionData.callerNumber,
            callDirection: sessionData.callDirection,
            startTime: sessionData.startTime,
            endTime: sessionData.endTime,
            duration: sessionData.duration,
            transcript: sessionData.transcript,
            extractedData: sessionData.extractedData,
        }, 'transcript_ready');
        
        await this.service.triggerIntegrations('transcript_ready', context);
    }
    
    // ==========================================
    // Action Events
    // ==========================================
    
    /**
     * Called when an intent is detected
     */
    async onIntentDetected(
        callId: string,
        event: IntentDetectedEvent
    ): Promise<void> {
        console.log(`[IntegrationEventHandler] Intent detected: ${event.intent} for call: ${callId}`);
        
        const sessionData = this.callSessions.get(callId);
        if (!sessionData) {
            console.warn(`[IntegrationEventHandler] No session data for call: ${callId}`);
            return;
        }
        
        // Track detected intents
        if (!sessionData.detectedIntents.includes(event.intent)) {
            sessionData.detectedIntents.push(event.intent);
        }
        
        // Merge entities into extracted data
        if (event.entities) {
            sessionData.extractedData = {
                ...sessionData.extractedData,
                ...event.entities,
            };
        }
        
        const context = createExecutionContext({
            callId: sessionData.callId,
            callSessionId: sessionData.callSessionId,
            agentId: sessionData.agentId,
            organizationId: sessionData.organizationId,
            callerNumber: sessionData.callerNumber,
            callDirection: sessionData.callDirection,
            startTime: sessionData.startTime,
            transcript: sessionData.transcript,
            extractedData: {
                ...sessionData.extractedData,
                detectedIntent: event.intent,
                intentConfidence: event.confidence,
                intentEntities: event.entities,
            },
        }, 'intent_detected');
        
        await this.service.triggerIntegrations('intent_detected', context);
    }
    
    /**
     * Called when escalation is requested
     */
    async onEscalationRequested(
        callId: string,
        event: EscalationEvent
    ): Promise<void> {
        console.log(`[IntegrationEventHandler] Escalation requested for call: ${callId}`);
        
        const sessionData = this.callSessions.get(callId);
        if (!sessionData) {
            console.warn(`[IntegrationEventHandler] No session data for call: ${callId}`);
            return;
        }
        
        // Store escalation data
        sessionData.extractedData = {
            ...sessionData.extractedData,
            escalation: event,
        };
        
        const context = createExecutionContext({
            callId: sessionData.callId,
            callSessionId: sessionData.callSessionId,
            agentId: sessionData.agentId,
            organizationId: sessionData.organizationId,
            callerNumber: sessionData.callerNumber,
            callDirection: sessionData.callDirection,
            startTime: sessionData.startTime,
            transcript: sessionData.transcript,
            extractedData: {
                ...sessionData.extractedData,
                escalationRequested: true,
                escalationDetails: event,
            },
        }, 'escalation_requested');
        
        await this.service.triggerIntegrations('escalation_requested', context);
    }
    
    /**
     * Trigger a custom event
     */
    async onCustomEvent(
        callId: string,
        eventName: string,
        eventData: Record<string, unknown>
    ): Promise<void> {
        console.log(`[IntegrationEventHandler] Custom event: ${eventName} for call: ${callId}`);
        
        const sessionData = this.callSessions.get(callId);
        if (!sessionData) {
            console.warn(`[IntegrationEventHandler] No session data for call: ${callId}`);
            return;
        }
        
        const context = createExecutionContext({
            callId: sessionData.callId,
            callSessionId: sessionData.callSessionId,
            agentId: sessionData.agentId,
            organizationId: sessionData.organizationId,
            callerNumber: sessionData.callerNumber,
            callDirection: sessionData.callDirection,
            startTime: sessionData.startTime,
            transcript: sessionData.transcript,
            extractedData: {
                ...sessionData.extractedData,
                customEvent: eventName,
                customEventData: eventData,
            },
        }, 'custom');
        
        await this.service.triggerIntegrations('custom', context);
    }
    
    // ==========================================
    // Transcript Management
    // ==========================================
    
    /**
     * Add a message to the call transcript
     */
    addTranscriptMessage(
        callId: string,
        role: 'user' | 'assistant' | 'system',
        content: string
    ): void {
        const sessionData = this.callSessions.get(callId);
        if (!sessionData) {
            return;
        }
        
        sessionData.transcript.push({
            role,
            content,
            timestamp: new Date(),
        });
    }
    
    /**
     * Update extracted data for a call
     */
    updateExtractedData(
        callId: string,
        data: Record<string, unknown>
    ): void {
        const sessionData = this.callSessions.get(callId);
        if (!sessionData) {
            return;
        }
        
        sessionData.extractedData = {
            ...sessionData.extractedData,
            ...data,
        };
    }
    
    /**
     * Set sentiment for a call
     */
    setSentiment(
        callId: string,
        sentiment: 'positive' | 'neutral' | 'negative'
    ): void {
        const sessionData = this.callSessions.get(callId);
        if (!sessionData) {
            return;
        }
        
        sessionData.sentiment = sentiment;
    }
    
    /**
     * Get session data for a call
     */
    getSessionData(callId: string): CallSessionData | undefined {
        return this.callSessions.get(callId);
    }
    
    /**
     * Test an integration
     */
    async testIntegration(
        toolId: string,
        config: unknown
    ): Promise<{ success: boolean; message: string; latencyMs?: number }> {
        return this.service.testIntegration(toolId, config);
    }
    
    /**
     * Get available integrations
     */
    getAvailableIntegrations() {
        return this.service.getAvailablePlugins();
    }
}

/**
 * Singleton instance
 */
let handlerInstance: IntegrationEventHandler | null = null;

/**
 * Get or create the event handler instance
 */
export function getIntegrationEventHandler(
    config?: IntegrationServiceConfig
): IntegrationEventHandler {
    if (!handlerInstance) {
        if (!config) {
            throw new Error('IntegrationEventHandler must be initialized with config');
        }
        handlerInstance = new IntegrationEventHandler(config);
    }
    return handlerInstance;
}

/**
 * Initialize integration event handler with default config
 */
export async function initializeIntegrationHandler(
    convexUrl: string
): Promise<IntegrationEventHandler> {
    const handler = getIntegrationEventHandler({
        convexUrl,
        maxRetries: 3,
        retryDelayMs: 1000,
        enableLogging: true,
    });
    
    await handler.initialize();
    return handler;
}
