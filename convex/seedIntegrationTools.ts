/**
 * Seed Integration Tools
 * Run this once to populate the integrationTools table with Google Sheets
 */

import { internalMutation } from "./_generated/server.js";

export const seedGoogleSheetsTool = internalMutation({
  handler: async (ctx) => {
    // Check if Google Sheets tool already exists
    const existing = await ctx.db
      .query("integrationTools")
      .withIndex("by_tool_id", (q) => q.eq("toolId", "google-sheets"))
      .first();

    if (existing) {
      console.log("Google Sheets tool already exists");
      return existing._id;
    }

    // Create Google Sheets tool
    const toolId = await ctx.db.insert("integrationTools", {
      toolId: "google-sheets",
      name: "Google Sheets",
      description: "Export call transcripts and extracted data to Google Sheets automatically",
      category: "data-export",
      icon: "📊",
      documentationUrl: "https://developers.google.com/apps-script/guides/web",
      
      configSchema: JSON.stringify({
        type: "object",
        required: ["webhookUrl", "deploymentId"],
        properties: {
          webhookUrl: {
            type: "string",
            title: "Webhook URL",
            description: "Google Apps Script Web App URL (must end with /exec)",
            format: "uri",
          },
          deploymentId: {
            type: "string",
            title: "Deployment ID",
            description: "The deployment ID from Google Apps Script",
          },
          sheetName: {
            type: "string",
            title: "Sheet Name (Optional)",
            description: "Specific sheet tab name. Leave blank to use active sheet.",
          },
        },
      }),
      
      setupInstructions: `
# Google Sheets Integration Setup

## Step 1: Deploy Apps Script
1. Copy the generated Apps Script code
2. Open Google Sheet → Extensions → Apps Script
3. Paste code and click Deploy → New deployment
4. Select "Web app"
5. Set "Who has access" to "Anyone"
6. Click Deploy and authorize

## Step 2: Configure Integration
1. Copy the /exec URL from deployment
2. Paste in "Webhook URL" field
3. Copy deployment ID
4. Test connection
5. Send test data to verify

## Step 3: Customize Columns
- Add/remove columns as needed
- Map to data sources (transcript, extracted fields, etc.)
- System prompt will be auto-updated with extraction instructions
      `.trim(),
      
      supportedTriggers: [
        "call_ended",
        "transcript_ready",
        "custom",
      ],
      
      isBuiltIn: true,
      isActive: true,
      isPremium: false,
      installCount: 0,
      
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    console.log("Google Sheets tool created:", toolId);
    return toolId;
  },
});
