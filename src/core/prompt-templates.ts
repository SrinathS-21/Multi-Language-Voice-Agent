/**
 * Prompt Templates - Single Source of Truth
 * 
 * All prompt sections that were previously duplicated across:
 * - convex/agents.ts
 * - src/services/agent-config.ts  
 * - src/services/prompt-builder.ts
 * 
 * This file contains the canonical versions that should be used everywhere.
 * 
 * IMPORTANT: If you need to modify prompt behavior, do it HERE only.
 * The convex/agents.ts file has a copy for Convex serverless execution.
 * Keep them in sync or use `buildFullPrompt` in agents.ts as the source.
 */

// ============================================================================
// PROMPT SECTION TEMPLATES
// ============================================================================

/**
 * Tool usage instructions for LLM
 * Critical for function calling behavior
 */
export const TOOL_USAGE_SECTION = `TOOL RULE (MANDATORY):
- ALWAYS use 'search_knowledge' tool BEFORE answering anything about business-specific information
- NEVER answer from your own knowledge — search first.
- If no results → politely say you don't have that info and offer other help.
  Example: "Sorry, I don't have that detail right now. Anything else I can assist with?"`;

/**
 * Language handling rules for multilingual support
 * Supports: Tamil, Hindi, English (Indian languages)
 */
export const LANGUAGE_RULES_SECTION = `LANGUAGE RULE:
- Reply in the same language the user is currently using:
  - Tamil → pure Tamil only
  - Hindi → pure Hindi only
  - English → English
- Switch immediately if user asks for a specific language.
- No mixing languages unless user requests it.`;

/**
 * Voice conversation guidelines for natural phone interactions
 */
export const VOICE_GUIDELINES_SECTION = `VOICE GUIDELINES:
- Speak naturally like a real phone agent
- Short answers (2–4 sentences max)
- No markdown, bullets, emojis or code formatting
- Use friendly confirmations ("sure", "let me check", "got it")
- Moderate pace, everyday words`;

/**
 * Response style guidance
 */
export const RESPONSE_STYLE_SECTION = `TONE & BEHAVIOR:
- Warm, calm, professional, helpful
- Sound like a real human agent
- Match user's language and energy`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build the standard prompt wrapper sections
 * Used by convex/agents.ts buildFullPrompt
 */
export function buildStandardSections(): string {
    return `${TOOL_USAGE_SECTION}

${LANGUAGE_RULES_SECTION}

${VOICE_GUIDELINES_SECTION}

${RESPONSE_STYLE_SECTION}`;
}

/**
 * Build complete system prompt from agent data
 * 
 * This is the CANONICAL implementation. Copy is maintained in convex/agents.ts
 * for serverless execution (Convex cannot import from src/).
 * 
 * @param name - Agent display name  
 * @param systemPrompt - Base system prompt/instructions
 * @param businessName - Business name for personalization
 * @returns Complete system prompt ready for LLM
 */
export function buildFullSystemPrompt(
    name: string,
    systemPrompt: string,
    businessName: string = 'our business'
): string {
    // Wrap with standard boilerplate sections
    return `You are ${name}, an AI voice assistant for ${businessName}.

${systemPrompt}

${buildStandardSections()}`;
}

// ============================================================================
// TYPE EXPORTS FOR CONSISTENCY
// ============================================================================

/**
 * Prompt building context (minimal required fields)
 */
export interface PromptBuildContext {
    name: string;
    systemPrompt: string;
    businessName?: string;
}
