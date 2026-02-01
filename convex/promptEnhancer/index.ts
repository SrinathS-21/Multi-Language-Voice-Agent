/**
 * Prompt Enhancer
 * 
 * Uses LLM to intelligently enhance user-provided system prompts by:
 * - Adding relevant tool usage instructions
 * - Integrating predefined best practice sections
 * - Maintaining agent personality and role
 */

import { action } from "../_generated/server.js";
import { v } from "convex/values";
import { PREDEFINED_SECTIONS, ENHANCER_SYSTEM_PROMPT } from "./config.js";

/**
 * Enhance a system prompt using LLM
 * 
 * @param basePrompt - User's original system prompt
 * @param agentName - Name of the agent
 * @param agentRole - Role/title of the agent
 * @param businessName - Name of the business (from config)
 * @param tools - Array of tool configurations the agent has access to
 * @param includeSections - Which predefined sections to include
 * @returns Enhanced system prompt
 */
export const enhancePrompt = action({
  args: {
    basePrompt: v.string(),
    agentName: v.string(),
    agentRole: v.optional(v.string()),
    businessName: v.optional(v.string()),
    tools: v.optional(v.array(v.object({
      name: v.string(),
      description: v.string(),
      purpose: v.optional(v.string()),
    }))),
    includeSections: v.optional(v.array(v.string())), // Array of section keys to include
  },
  handler: async (ctx, args) => {
    // Build context for the LLM
    const toolsContext = args.tools && args.tools.length > 0
      ? `\n\n## Configured Tools:\n${args.tools.map(tool => 
          `- **${tool.name}**: ${tool.description}${tool.purpose ? `\n  Purpose: ${tool.purpose}` : ''}`
        ).join('\n')}`
      : '';

    // Get selected predefined sections
    const sectionsToInclude = args.includeSections || Object.keys(PREDEFINED_SECTIONS);
    const sectionsContext = sectionsToInclude.length > 0
      ? `\n\n## Predefined Sections to Integrate (use only if relevant):\n${sectionsToInclude.map(key => {
          const section = PREDEFINED_SECTIONS[key as keyof typeof PREDEFINED_SECTIONS];
          return section ? `### ${section.name}\n${section.content}` : '';
        }).filter(Boolean).join('\n\n')}`
      : '';

    const businessContext = args.businessName 
      ? `\n\n## Business Information:\n- Business Name: ${args.businessName}`
      : '';

    // Construct the user message
    const userMessage = `**Agent Information:**
- Name: ${args.agentName}
- Role: ${args.agentRole || 'AI Assistant'}
${businessContext}

**Base System Prompt (provided by user):**
${args.basePrompt}
${toolsContext}
${sectionsContext}

**YOUR TASK:**
ENHANCE this system prompt by adding DETAILED, SPECIFIC instructions for each tool listed above.

For the Google Sheets tool specifically, you MUST add a section like:
"### Automatic Data Logging
After each call, I will automatically log the following information to Google Sheets:
- Timestamp of the call
- Caller's phone number  
- Customer name (if provided)
- Primary intent/reason for calling
- Call duration
- Outcome (booked, inquiry, escalated, etc.)
- Any appointments scheduled (date/time)
- Additional notes

I will capture this data throughout our conversation and ensure it's recorded for follow-up purposes."

Make the enhanced prompt SIGNIFICANTLY longer with concrete tool usage instructions. The output should be at least 50% longer than the input.`;

    try {
      // Call OpenAI API - environment variable is available in Convex actions
      const openaiApiKey = process.env.OPENAI_API_KEY as string | undefined;
      if (!openaiApiKey) {
        throw new Error("OPENAI_API_KEY not configured in environment");
      }

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // Using gpt-4o-mini for cost efficiency
          messages: [
            {
              role: "system",
              content: ENHANCER_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: userMessage,
            },
          ],
          temperature: 0.7,
          max_tokens: 16000, // Increased from 2000 to handle very long prompts
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const enhancedPrompt = data.choices[0]?.message?.content;

      if (!enhancedPrompt) {
        throw new Error("No enhanced prompt returned from LLM");
      }

      return {
        success: true,
        enhancedPrompt: enhancedPrompt.trim(),
        originalPrompt: args.basePrompt,
        tokensUsed: data.usage?.total_tokens || 0,
      };
    } catch (error) {
      console.error("Prompt enhancement error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        enhancedPrompt: args.basePrompt, // Return original on error
      };
    }
  },
});
