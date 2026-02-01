/**
 * Integration Plugin System Type Definitions
 * 
 * Defines the core interfaces for the pluggable tool marketplace.
 * All integration plugins must implement these interfaces.
 */

// ============================================
// TRIGGER TYPES
// ============================================

/**
 * Events that can trigger a plugin execution
 */
export type IntegrationTriggerType =
    | "call_started"          // When a call begins
    | "call_ended"            // When a call ends
    | "transcript_ready"      // When full transcript is available
    | "intent_detected"       // When specific intent is detected
    | "escalation_requested"  // When customer asks for human
    | "custom";               // Custom trigger via API

/**
 * Categories of plugins in the marketplace
 */
export type IntegrationCategory =
    | "data-export"           // Google Sheets, CSV, Database
    | "notification"          // Slack, Email, SMS
    | "webhook"               // Generic HTTP webhooks
    | "crm"                   // Salesforce, HubSpot
    | "calendar"              // Google Calendar, Calendly
    | "custom";               // User-defined

// ============================================
// EXECUTION CONTEXT
// ============================================

/**
 * Data passed to plugins during execution
 */
export interface IntegrationExecutionContext {
    // Call Information
    callId: string;
    callSessionId: string;
    agentId: string;
    organizationId: string;
    
    // Caller Information
    callerNumber?: string;
    callDirection: "inbound" | "outbound";
    
    // Call Metrics
    startTime: Date;
    endTime?: Date;
    duration?: number; // seconds
    
    // Conversation Data
    transcript?: TranscriptEntry[];
    fullTranscript?: string; // Concatenated text
    
    // Extracted Information
    extractedData?: ExtractedCallData;
    
    // Trigger Information
    trigger: IntegrationTriggerType;
    triggerTimestamp: Date;
    
    // Custom metadata
    metadata?: Record<string, unknown>;
}

/**
 * Single transcript entry
 */
export interface TranscriptEntry {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp?: Date;
    language?: string;
}

/**
 * Data extracted from the conversation
 */
export interface ExtractedCallData {
    // Customer Information
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    
    // Intent Detection
    primaryIntent?: string;
    intentConfidence?: number;
    detectedIntents?: string[];
    
    // Appointment Data
    appointmentDate?: string;
    appointmentTime?: string;
    appointmentType?: string;
    
    // Sentiment Analysis
    sentiment?: "positive" | "neutral" | "negative";
    sentimentScore?: number;
    
    // Call Outcome
    outcome?: "successful" | "failed" | "transferred" | "voicemail";
    outcomeReason?: string;
    
    // Additional standard fields
    summary?: string;           // Brief summary of the call
    notes?: string;             // Additional notes from the conversation
    language?: string;          // Detected/used language
    status?: string;            // Call status
    callOutcome?: string;       // Alias for outcome
    
    // Custom fields (from agent config or dynamic extraction)
    customFields?: Record<string, unknown>;
    
    // Allow any additional fields for dynamic column support
    [key: string]: unknown;
}

// ============================================
// PLUGIN CONFIGURATION
// ============================================

/**
 * Configuration schema using JSON Schema format
 */
export interface IntegrationConfigSchema {
    type: "object";
    required?: string[];
    properties: Record<string, IntegrationConfigProperty>;
}

/**
 * Individual configuration field
 */
export interface IntegrationConfigProperty {
    type: "string" | "number" | "boolean" | "array" | "object";
    title?: string;                    // Optional for nested items
    description?: string;
    default?: unknown;
    enum?: string[];
    format?: "uri" | "email" | "password" | "date" | "time";
    pattern?: string;
    minimum?: number;
    maximum?: number;
    required?: string[];               // For object types - list of required property names
    items?: Partial<IntegrationConfigProperty> & { type: string; required?: string[] };
    properties?: Record<string, IntegrationConfigProperty>;
    additionalProperties?: Partial<IntegrationConfigProperty> & { type: string } | boolean;
}

// ============================================
// PLUGIN METADATA
// ============================================

/**
 * Plugin metadata for marketplace display
 */
export interface IntegrationPluginMetadata {
    // Identification
    id: string;                    // Unique slug: "google-sheets"
    name: string;                  // Display name: "Google Sheets"
    version: string;               // Semantic version: "1.0.0"
    
    // Description
    description: string;           // Short description
    longDescription?: string;      // Detailed description (markdown)
    category: IntegrationCategory;
    
    // Visual
    icon?: string;                 // Emoji or URL
    screenshots?: string[];        // URLs to screenshots
    
    // Documentation
    documentationUrl?: string;     // Link to docs
    setupInstructions?: string;    // Markdown setup guide
    
    // Capabilities
    supportedTriggers: IntegrationTriggerType[];
    configSchema: IntegrationConfigSchema;
    
    // Flags
    isBuiltIn: boolean;
    isPremium?: boolean;
    
    // Author (for community plugins)
    author?: {
        name: string;
        url?: string;
    };
}

// ============================================
// EXECUTION RESULTS
// ============================================

/**
 * Result of plugin execution
 */
export interface IntegrationExecutionResult {
    success: boolean;
    
    // Response data
    data?: unknown;
    
    // Error information
    error?: {
        code: string;
        message: string;
        details?: unknown;
        retryable: boolean;
    };
    
    // Performance metrics
    executionTimeMs: number;
    
    // For debugging
    requestPayload?: unknown;
    responsePayload?: unknown;
}

// ============================================
// PLUGIN INTERFACE
// ============================================

/**
 * Main plugin interface - all integration plugins must implement this
 */
export interface IIntegrationPlugin {
    /**
     * Plugin metadata for marketplace
     */
    readonly metadata: IntegrationPluginMetadata;
    
    /**
     * Validate the plugin configuration
     * @param config User-provided configuration
     * @returns Validation result with any errors
     */
    validateConfig(config: unknown): IntegrationConfigValidationResult;
    
    /**
     * Execute the plugin
     * @param context Execution context with call data
     * @param config User-provided configuration
     * @returns Execution result
     */
    execute(context: IntegrationExecutionContext, config: unknown): Promise<IntegrationExecutionResult>;
    
    /**
     * Test the connection/configuration
     * @param config User-provided configuration
     * @returns Test result
     */
    testConnection?(config: unknown): Promise<IntegrationTestConnectionResult>;
    
    /**
     * Transform data before sending (optional hook)
     * @param context Execution context
     * @param config Plugin configuration
     * @returns Transformed payload
     */
    transformPayload?(context: IntegrationExecutionContext, config: unknown): unknown;
    
    /**
     * Handle errors with custom retry logic (optional)
     * @param error The error that occurred
     * @param attemptNumber Current attempt number
     * @returns Whether to retry and after how long
     */
    handleError?(error: Error, attemptNumber: number): IntegrationRetryDecision;
}

/**
 * Configuration validation result
 */
export interface IntegrationConfigValidationResult {
    valid: boolean;
    errors?: {
        field: string;
        message: string;
    }[];
}

/**
 * Connection test result
 */
export interface IntegrationTestConnectionResult {
    success: boolean;
    message: string;
    latencyMs?: number;
    details?: unknown;
}

/**
 * Retry decision after error
 */
export interface IntegrationRetryDecision {
    shouldRetry: boolean;
    delayMs?: number;
    reason?: string;
}

// ============================================
// PLUGIN REGISTRY
// ============================================

/**
 * Registry for managing available plugins
 */
export interface IIntegrationPluginRegistry {
    /**
     * Register a new plugin
     */
    register(plugin: IIntegrationPlugin): void;
    
    /**
     * Get a plugin by ID
     */
    get(pluginId: string): IIntegrationPlugin | undefined;
    
    /**
     * Get all registered plugins
     */
    getAll(): IIntegrationPlugin[];
    
    /**
     * Get plugins by category
     */
    getByCategory(category: IntegrationCategory): IIntegrationPlugin[];
    
    /**
     * Check if a plugin exists
     */
    has(pluginId: string): boolean;
    
    /**
     * Unregister a plugin
     */
    unregister(pluginId: string): boolean;
}

// ============================================
// DATABASE TYPES (for Convex integration)
// ============================================

/**
 * Stored integration tool (from database)
 */
export interface StoredIntegrationTool {
    _id: string;
    toolId: string;
    name: string;
    description: string;
    category: IntegrationCategory;
    icon?: string;
    documentationUrl?: string;
    configSchema: string; // JSON stringified
    setupInstructions?: string;
    supportedTriggers: IntegrationTriggerType[];
    isBuiltIn: boolean;
    isActive: boolean;
    isPremium?: boolean;
    installCount?: number;
    createdAt: number;
    updatedAt: number;
}

/**
 * Stored agent integration (from database)
 */
export interface StoredAgentIntegration {
    _id: string;
    organizationId: string;
    agentId: string;
    toolId: string;
    name: string;
    config: string; // JSON stringified
    enabledTriggers: string[];
    triggerConditions?: string; // JSON stringified
    status: "active" | "paused" | "error" | "pending_setup";
    lastError?: string;
    lastErrorAt?: number;
    totalExecutions?: number;
    successfulExecutions?: number;
    failedExecutions?: number;
    lastExecutedAt?: number;
    retryEnabled?: boolean;
    maxRetries?: number;
    retryDelayMs?: number;
    createdAt: number;
    updatedAt: number;
}

/**
 * Integration execution log entry
 */
export interface IntegrationLogEntry {
    _id: string;
    organizationId: string;
    agentId: string;
    integrationId: string;
    toolId: string;
    callSessionId?: string;
    trigger: string;
    status: "pending" | "executing" | "success" | "failed" | "retrying";
    requestPayload?: string;
    responseData?: string;
    errorMessage?: string;
    errorCode?: string;
    stackTrace?: string;
    attemptNumber: number;
    maxAttempts: number;
    nextRetryAt?: number;
    executionTimeMs?: number;
    createdAt: number;
    completedAt?: number;
}
