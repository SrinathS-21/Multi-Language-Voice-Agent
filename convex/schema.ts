/**
 * Convex Database Schema for LiveKit Voice Agent
 * 
 * Defines all tables for the voice agent platform:
 * 
 * CORE TABLES:
 * - organizations: Multi-tenant organization management
 * - agents: Voice agent configurations and prompts
 * - callSessions: Active and completed call tracking
 * - callInteractions: Conversation logs (user/agent messages)
 * - callMetrics: Performance and quality metrics
 * 
 * KNOWLEDGE BASE TABLES:
 * - documents: Uploaded file metadata
 * - functionSchemas: Dynamic function definitions for agents
 * 
 * @module convex/schema
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    // ============================================================================
    // CORE TABLES
    // ============================================================================

    // Organizations (multi-tenant support)
    organizations: defineTable({
        slug: v.string(),
        name: v.string(),
        billingCustomerId: v.optional(v.string()),
        status: v.union(v.literal("active"), v.literal("inactive")),
        config: v.optional(v.string()), // JSON string for custom config
        createdAt: v.number(),
    })
        .index("by_slug", ["slug"]),

    // Call sessions - tracks active and completed calls
    callSessions: defineTable({
        sessionId: v.string(),
        organizationId: v.string(),
        agentId: v.optional(v.string()), // Links to agents table for per-agent analytics
        roomName: v.optional(v.string()), // LiveKit room name
        participantIdentity: v.optional(v.string()), // LiveKit participant identity
        callType: v.union(v.literal("inbound"), v.literal("outbound"), v.literal("web")),
        status: v.union(
            v.literal("active"),
            v.literal("completed"),
            v.literal("failed"),
            v.literal("expired")
        ),
        
        // Telephony/SIP fields (for phone calls)
        callerPhoneNumber: v.optional(v.string()),       // E.164 format: +15550100
        destinationPhoneNumber: v.optional(v.string()),  // For outbound calls
        callSid: v.optional(v.string()),                 // Twilio Call SID
        sipParticipantId: v.optional(v.string()),        // LiveKit SIP participant identity
        callDirection: v.optional(v.union(v.literal("inbound"), v.literal("outbound"))),
        isTelephony: v.optional(v.boolean()),            // true if phone call vs web
        
        startedAt: v.number(),
        endedAt: v.optional(v.number()),
        durationSeconds: v.optional(v.number()),
        config: v.optional(v.string()), // JSON of call config
        metadata: v.optional(v.string()), // JSON for additional metadata
        
        // Complete call transcript (stored as single unified document after call ends)
        transcript: v.optional(v.array(v.object({
            timestamp: v.number(),
            speaker: v.union(v.literal("user"), v.literal("agent"), v.literal("system")),
            text: v.string(),
            type: v.optional(v.union(
                v.literal("speech"),
                v.literal("function_call"),
                v.literal("function_result")
            )),
            metadata: v.optional(v.object({
                functionName: v.optional(v.string()),
                latencyMs: v.optional(v.number()),
                confidence: v.optional(v.number()),
            })),
        }))),
        
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_session_id", ["sessionId"])
        .index("by_room_name", ["roomName"])
        .index("by_organization_id", ["organizationId"])
        .index("by_agent_id", ["agentId"])
        .index("by_status", ["status"])
        .index("by_status_and_organization", ["status", "organizationId"]),

    // Call interactions - individual messages and function calls
    callInteractions: defineTable({
        sessionId: v.string(),
        organizationId: v.string(), // Denormalized for faster org-level queries
        agentId: v.optional(v.string()), // For per-agent analytics and ML training
        interactionType: v.union(
            v.literal("user_message"),
            v.literal("agent_response"),
            v.literal("function_call")
        ),
        timestamp: v.number(),
        userInput: v.optional(v.string()),
        agentResponse: v.optional(v.string()),
        functionName: v.optional(v.string()),
        functionParams: v.optional(v.string()), // JSON
        functionResult: v.optional(v.string()), // JSON
        sentiment: v.optional(v.union(
            v.literal("positive"),
            v.literal("negative"),
            v.literal("neutral")
        )),
        latencyMs: v.optional(v.number()), // Response latency tracking
    })
        .index("by_session_id", ["sessionId"])
        .index("by_organization_id", ["organizationId"])
        .index("by_agent_id", ["agentId"])
        .index("by_timestamp", ["timestamp"]),

    // Call metrics - performance tracking
    callMetrics: defineTable({
        sessionId: v.string(),
        organizationId: v.string(),
        agentId: v.optional(v.string()), // For per-agent performance comparison
        
        // Original fields (backward compatible)
        latencyMs: v.optional(v.number()),
        audioQualityScore: v.optional(v.number()),
        callCompleted: v.optional(v.boolean()),
        errorsCount: v.optional(v.number()),
        functionsCalledCount: v.optional(v.number()),
        userSatisfied: v.optional(v.boolean()),
        sttUsageSeconds: v.optional(v.number()),
        ttsUsageCharacters: v.optional(v.number()),
        llmTokensUsed: v.optional(v.number()),
        
        // New analytics fields
        metricType: v.optional(v.union(
            v.literal("latency"),
            v.literal("function_call"),
            v.literal("error"),
            v.literal("quality")
        )),
        metricName: v.optional(v.string()), // e.g., "tts_latency", "hybrid_search", etc.
        value: v.optional(v.number()),
        unit: v.optional(v.string()), // e.g., "ms", "count", "score"
        metadata: v.optional(v.string()), // JSON for additional context
        timestamp: v.optional(v.number()),
        
        createdAt: v.number(),
    })
        .index("by_session_id", ["sessionId"])
        .index("by_organization_id", ["organizationId"])
        .index("by_agent_id", ["agentId"]),

    // Persistent agents (reusable configurations)
    agents: defineTable({
        organizationId: v.string(),
        name: v.string(),
        role: v.optional(v.string()),
        systemPrompt: v.string(),
        config: v.optional(v.string()), // JSON - includes voice settings, language, etc.
        status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
        createdAt: v.number(),
        updatedAt: v.number(),
        
        // Agent interaction messages
        aiPersonaName: v.optional(v.string()), // Person name agent introduces itself as
        greeting: v.optional(v.string()), // Message spoken when call begins
        farewell: v.optional(v.string()), // Message spoken when call ends
        language: v.optional(v.string()), // Primary language (en, hi, ta, te, etc.)
        
        // Phone configuration
        phoneCountryCode: v.optional(v.string()), // e.g., "+1", "+91"
        phoneNumber: v.optional(v.string()),      // e.g., "5551234567"
        phoneLocation: v.optional(v.string()),    // e.g., "New York, USA"
        
        // Rate limiting fields for per-agent call management
        maxConcurrentCalls: v.optional(v.number()), // Default 5 - max simultaneous calls
        monthlyCallLimit: v.optional(v.number()),   // Default 1000 - monthly quota
        currentConcurrentCalls: v.optional(v.number()), // Track active calls in real-time
        
        // Document parsing configuration
        enableContextualEnrichment: v.optional(v.boolean()), // Context embedding in chunks
        
        // Prompt caching fields (Hybrid Cache Strategy)
        // See docs/PROMPT_CACHING_OPTIMIZATION.md for details
        fullPrompt: v.optional(v.string()),         // Pre-built complete system prompt (2-5KB)
        promptVersion: v.optional(v.number()),      // Timestamp when prompt was last rebuilt
    })
        .index("by_organization_id", ["organizationId"])
        .index("by_phone", ["phoneCountryCode", "phoneNumber"])
        .index("by_phone_and_status", ["phoneCountryCode", "phoneNumber", "status"])
        .index("by_status", ["status", "updatedAt"]),

    // ============================================
    // KNOWLEDGE BASE TABLES
    // ============================================

    // Documents - tracks uploaded files (per-agent isolation)
    documents: defineTable({
        organizationId: v.string(),
        agentId: v.string(),  // Required: each agent has its own knowledge base
        documentId: v.string(), // Unique ID for this document
        fileName: v.string(),
        fileType: v.string(), // "pdf", "csv", "xlsx", "docx", "image", etc.
        fileSize: v.number(), // bytes
        sourceType: v.string(), // "menu", "faq", "policy", "catalog", etc.
        status: v.union(
            v.literal("uploading"),
            v.literal("processing"),
            v.literal("completed"),
            v.literal("failed")
        ),
        chunkCount: v.number(), // Total chunks generated
        ragEntryIds: v.optional(v.array(v.string())), // IDs of RAG entries for this document
        metadata: v.optional(v.string()), // JSON: custom metadata
        errorMessage: v.optional(v.string()),
        uploadedAt: v.number(),
        processedAt: v.optional(v.number()),
    })
        .index("by_organization_id", ["organizationId"])
        .index("by_agent_id", ["agentId"])  // Per-agent document isolation
        .index("by_document_id", ["documentId"])
        .index("by_status", ["organizationId", "status"])
        .index("by_agent_and_status", ["agentId", "status"]),

    // Function schemas - dynamic function definitions
    functionSchemas: defineTable({
        organizationId: v.string(),
        domain: v.string(), // "restaurant", "pharmacy", "hotel", "retail"
        functionName: v.string(),
        description: v.string(),
        parameters: v.string(), // JSON schema
        handlerType: v.union(
            v.literal("vector_search"),
            v.literal("convex_query"),
            v.literal("webhook"),
            v.literal("static")
        ),
        handlerConfig: v.string(), // JSON: handler-specific configuration
        isActive: v.boolean(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_organization_id", ["organizationId"])
        .index("by_function_name", ["organizationId", "functionName"])
        .index("by_domain", ["domain"]),

    // ============================================
    // RAG METADATA MANAGEMENT (Multi-Tenant Optimization)
    // ============================================

    // Agent Knowledge Metadata - Fast lookup and management layer
    // Tracks chunks per agent for quick stats and deletion
    agentKnowledgeMetadata: defineTable({
        agentId: v.string(),               // Agent namespace
        organizationId: v.string(),        // Organization for billing/limits
        totalChunks: v.number(),           // Total chunks for this agent
        totalSizeBytes: v.number(),        // Approximate storage used
        documentCount: v.number(),         // Number of documents ingested
        lastIngestedAt: v.optional(v.number()),  // Last ingestion timestamp
        lastSearchedAt: v.optional(v.number()),  // Last search timestamp (for cache warmth)
        status: v.union(
            v.literal("active"),           // Normal operation
            v.literal("deleting"),         // Deletion in progress
            v.literal("deleted")           // Soft deleted (cleanup pending)
        ),
        chunkKeysCache: v.optional(v.array(v.string())), // Cache of chunk keys for fast deletion
        searchCacheHitRate: v.optional(v.number()), // Performance metric
        avgSearchLatencyMs: v.optional(v.number()), // Performance metric
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_agent_id", ["agentId"])
        .index("by_organization_id", ["organizationId"])
        .index("by_status", ["status"])
        .index("by_org_and_status", ["organizationId", "status"]),

    // Deletion Queue - Async background deletion for performance
    // Prevents blocking API calls during large deletions
    deletionQueue: defineTable({
        agentId: v.string(),
        organizationId: v.string(),
        deletionType: v.union(
            v.literal("full_namespace"),   // Delete all chunks for agent
            v.literal("specific_documents"), // Delete specific documents
            v.literal("cleanup_orphans")   // Cleanup orphaned chunks
        ),
        targetKeys: v.optional(v.array(v.string())), // Specific keys to delete
        totalItems: v.number(),            // Total items to delete
        processedItems: v.number(),        // Items deleted so far
        status: v.union(
            v.literal("pending"),          // Queued for deletion
            v.literal("processing"),       // Currently deleting
            v.literal("completed"),        // Successfully deleted
            v.literal("failed"),           // Failed with errors
            v.literal("cancelled")         // Cancelled by user
        ),
        batchSize: v.number(),             // Chunks to delete per batch
        errorMessage: v.optional(v.string()),
        startedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
        createdAt: v.number(),
    })
        .index("by_agent_id", ["agentId"])
        .index("by_status", ["status"])
        .index("by_created_at", ["createdAt"])
        .index("by_status_and_created", ["status", "createdAt"]),

    // Chunk Access Log - Track hot/cold chunks for caching optimization
    // Helps identify frequently accessed knowledge for preloading
    chunkAccessLog: defineTable({
        agentId: v.string(),
        chunkKey: v.string(),              // Specific chunk identifier
        accessCount: v.number(),           // Number of times accessed
        lastAccessedAt: v.number(),        // Most recent access
        avgRelevanceScore: v.number(),     // Average similarity score when returned
        firstAccessedAt: v.number(),       // First time accessed
    })
        .index("by_agent_id", ["agentId"])
        .index("by_chunk_key", ["agentId", "chunkKey"])
        .index("by_access_count", ["agentId", "accessCount"])
        .index("by_last_accessed", ["agentId", "lastAccessedAt"]),

    // ============================================
    // PHASE 1: MISSING TABLES (Knowledge Management Enhancement)
    // ============================================

    // Ingestion Sessions - Preview workflow before embedding generation
    ingestionSessions: defineTable({
        sessionId: v.string(),              // UUID for this ingestion session
        organizationId: v.string(),
        agentId: v.string(),
        
        // File information
        fileName: v.string(),
        fileType: v.string(),               // "pdf", "docx", "xlsx", etc.
        fileSize: v.number(),               // bytes
        sourceType: v.string(),             // "menu", "faq", "policy", etc.
        
        // Workflow state
        stage: v.union(
            v.literal("uploading"),
            v.literal("parsing"),
            v.literal("chunking"),
            v.literal("preview_ready"),     // Soft gate - waiting for confirmation
            v.literal("confirming"),
            v.literal("persisting"),
            v.literal("embedding"),
            v.literal("completed"),
            v.literal("failed"),
            v.literal("cancelled")
        ),
        progress: v.optional(v.number()),   // 0-100
        
        // Preview data (temporary)
        previewChunks: v.optional(v.string()), // JSON: Array of chunk previews
        previewMetadata: v.optional(v.string()), // JSON: Token counts, quality scores
        
        // Result tracking
        documentId: v.optional(v.string()), // Points to documents table after completion
        chunkCount: v.optional(v.number()),
        errorMessage: v.optional(v.string()),
        
        // Timestamps
        createdAt: v.number(),
        uploadedAt: v.optional(v.number()),
        previewedAt: v.optional(v.number()),
        confirmedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
        
        // Cleanup flag (delete preview data after 24h)
        expiresAt: v.optional(v.number()),
    })
        .index("by_session_id", ["sessionId"])
        .index("by_agent_id", ["agentId"])
        .index("by_stage", ["organizationId", "stage"])
        .index("by_expires_at", ["expiresAt"]),  // For cleanup cron

    // Deleted Files - Soft delete audit trail for compliance
    deletedFiles: defineTable({
        // Original document info
        documentId: v.string(),
        organizationId: v.string(),
        agentId: v.string(),
        fileName: v.string(),
        fileType: v.string(),
        fileSize: v.number(),
        sourceType: v.string(),
        chunkCount: v.number(),
        
        // Deletion tracking
        deletedBy: v.optional(v.string()),      // User ID who deleted
        deletionReason: v.optional(v.string()), // "outdated", "incorrect", "duplicate"
        deletedAt: v.number(),
        
        // Backup metadata (for recovery)
        ragEntryIds: v.optional(v.array(v.string())), // Vector DB entries
        backupMetadata: v.optional(v.string()),       // JSON: Original metadata
        
        // Retention
        purgeAt: v.number(),                    // 30 days from deletedAt
        isPurged: v.optional(v.boolean()),      // True after vector cleanup
        purgedAt: v.optional(v.number()),
        
        // Original timestamps
        originalUploadedAt: v.number(),
        originalProcessedAt: v.optional(v.number()),
    })
        .index("by_document_id", ["documentId"])
        .index("by_agent_id", ["agentId"])
        .index("by_organization_id", ["organizationId"])
        .index("by_deleted_at", ["deletedAt"])
        .index("by_purge_at", ["purgeAt"])      // For cleanup cron
        .index("by_is_purged", ["isPurged"]),   // Find unpurged deletions

    // Chunks - Dual storage for metadata control + future migration
    chunks: defineTable({
        chunkId: v.string(),                    // UUID for this chunk
        documentId: v.string(),                 // Parent document
        organizationId: v.string(),
        agentId: v.string(),
        
        // Chunk content
        text: v.string(),                       // Full chunk text
        tokenCount: v.number(),                 // Actual token count
        
        // Position tracking
        chunkIndex: v.number(),                 // 0-based position in document
        totalChunks: v.number(),                // Total chunks in document
        
        // Metadata (customizable per agent)
        pageNumber: v.optional(v.number()),
        sectionTitle: v.optional(v.string()),
        hierarchyLevel: v.optional(v.number()), // 1=title, 2=section, 3=subsection
        parentChunkId: v.optional(v.string()),  // For hierarchical chunking
        
        // Quality metrics
        qualityScore: v.optional(v.number()),   // 0-1, based on coherence
        hasCode: v.optional(v.boolean()),       // Contains code blocks
        hasTable: v.optional(v.boolean()),      // Contains tables
        hasImage: v.optional(v.boolean()),      // References images
        
        // Vector DB mapping
        ragEntryId: v.string(),                 // ID in @convex-dev/rag
        ragNamespace: v.string(),               // Should be agentId
        
        // Search optimization
        accessCount: v.optional(v.number()),    // Times retrieved in search
        avgRelevanceScore: v.optional(v.number()), // Avg similarity score
        lastAccessedAt: v.optional(v.number()),
        
        // Timestamps
        createdAt: v.number(),
        updatedAt: v.optional(v.number()),
    })
        .index("by_chunk_id", ["chunkId"])
        .index("by_document_id", ["documentId"])
        .index("by_agent_id", ["agentId"])
        .index("by_rag_entry_id", ["ragEntryId"])
        .index("by_document_and_index", ["documentId", "chunkIndex"]) // Ordered retrieval
        .index("by_access_count", ["agentId", "accessCount"]),        // Hot chunks

    // ============================================
    // TOOL MARKETPLACE & INTEGRATIONS
    // ============================================

    // Integration Tools - Available tools in the marketplace
    // These are the "templates" that users can enable for their agents
    integrationTools: defineTable({
        // Tool Identity
        toolId: v.string(),                     // Unique slug: "google-sheets", "slack-webhook"
        name: v.string(),                       // Display name: "Google Sheets"
        description: v.string(),                // What this tool does
        category: v.union(
            v.literal("data-export"),           // Google Sheets, CSV, Database
            v.literal("notification"),          // Slack, Email, SMS
            v.literal("webhook"),               // Generic HTTP webhooks
            v.literal("crm"),                   // Salesforce, HubSpot
            v.literal("calendar"),              // Google Calendar, Calendly
            v.literal("custom")                 // User-defined webhooks
        ),
        
        // Tool Metadata
        icon: v.optional(v.string()),           // Icon URL or emoji
        documentationUrl: v.optional(v.string()), // Link to setup docs
        
        // Configuration Schema (JSON Schema format)
        // Defines what fields the user needs to fill out
        configSchema: v.string(),               // JSON Schema for configuration form
        
        // Setup Instructions (Markdown)
        setupInstructions: v.optional(v.string()), // Step-by-step setup guide
        
        // Event Triggers this tool can respond to
        supportedTriggers: v.array(v.union(
            v.literal("call_started"),          // When a call begins
            v.literal("call_ended"),            // When a call ends
            v.literal("transcript_ready"),      // When full transcript is available
            v.literal("intent_detected"),       // When specific intent is detected
            v.literal("escalation_requested"),  // When customer asks for human
            v.literal("custom")                 // Custom trigger via API
        )),
        
        // Feature Flags
        isBuiltIn: v.boolean(),                 // true = shipped with platform
        isActive: v.boolean(),                  // false = hidden from marketplace
        isPremium: v.optional(v.boolean()),     // Requires paid plan
        
        // Stats
        installCount: v.optional(v.number()),   // How many agents use this
        
        // Timestamps
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_tool_id", ["toolId"])
        .index("by_category", ["category", "isActive"])
        .index("by_is_active", ["isActive"])
        .index("by_is_built_in", ["isBuiltIn"]),

    // Agent Integrations - Connects agents to specific tool instances
    // This is the "configuration" that binds an agent to a tool with credentials
    agentIntegrations: defineTable({
        // Relationships
        organizationId: v.string(),
        agentId: v.string(),
        toolId: v.string(),                     // References integrationTools.toolId
        
        // User-defined name for this integration instance
        name: v.string(),                       // e.g., "Sales Leads Sheet", "Support Slack"
        
        // Configuration (encrypted sensitive data)
        config: v.string(),                     // JSON: Tool-specific settings
        // For Google Sheets: { webhookUrl, spreadsheetId, sheetName }
        // For Slack: { webhookUrl, channel }
        // For Webhook: { url, method, headers, bodyTemplate }
        
        // Trigger Configuration
        enabledTriggers: v.array(v.string()),   // Which events trigger this tool
        triggerConditions: v.optional(v.string()), // JSON: Optional conditions
        // e.g., { "intent": "appointment", "sentiment": "positive" }
        
        // Status
        status: v.union(
            v.literal("active"),                // Running normally
            v.literal("paused"),                // Temporarily disabled
            v.literal("error"),                 // Has errors, needs attention
            v.literal("pending_setup")          // Needs configuration
        ),
        lastError: v.optional(v.string()),      // Last error message
        lastErrorAt: v.optional(v.number()),    // When error occurred
        
        // Execution Stats
        totalExecutions: v.optional(v.number()),
        successfulExecutions: v.optional(v.number()),
        failedExecutions: v.optional(v.number()),
        lastExecutedAt: v.optional(v.number()),
        
        // Retry Configuration
        retryEnabled: v.optional(v.boolean()),
        maxRetries: v.optional(v.number()),     // Default: 3
        retryDelayMs: v.optional(v.number()),   // Default: 1000
        
        // Timestamps
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_agent_id", ["agentId"])
        .index("by_organization_id", ["organizationId"])
        .index("by_tool_id", ["toolId"])
        .index("by_agent_and_tool", ["agentId", "toolId"])
        .index("by_status", ["organizationId", "status"])
        .index("by_agent_and_status", ["agentId", "status"]),

    // Integration Execution Logs - History of all tool executions
    // Essential for debugging and auditing
    integrationLogs: defineTable({
        // Relationships
        organizationId: v.string(),
        agentId: v.string(),
        integrationId: v.id("agentIntegrations"), // Reference to the integration
        toolId: v.string(),
        callSessionId: v.optional(v.string()),  // Optional: which call triggered this
        
        // Execution Details
        trigger: v.string(),                    // What triggered this execution
        status: v.union(
            v.literal("pending"),
            v.literal("executing"),
            v.literal("success"),
            v.literal("failed"),
            v.literal("retrying")
        ),
        
        // Request/Response (for debugging)
        requestPayload: v.optional(v.string()), // JSON: What was sent
        responseData: v.optional(v.string()),   // JSON: What was received
        
        // Error Tracking
        errorMessage: v.optional(v.string()),
        errorCode: v.optional(v.string()),
        stackTrace: v.optional(v.string()),
        
        // Retry Info
        attemptNumber: v.number(),              // 1, 2, 3...
        maxAttempts: v.number(),
        nextRetryAt: v.optional(v.number()),
        
        // Performance
        executionTimeMs: v.optional(v.number()),
        
        // Timestamps
        createdAt: v.number(),
        completedAt: v.optional(v.number()),
    })
        .index("by_integration_id", ["integrationId"])
        .index("by_agent_id", ["agentId"])
        .index("by_call_session", ["callSessionId"])
        .index("by_status", ["organizationId", "status"])
        .index("by_created_at", ["organizationId", "createdAt"])
        .index("by_agent_and_created", ["agentId", "createdAt"]),
});
