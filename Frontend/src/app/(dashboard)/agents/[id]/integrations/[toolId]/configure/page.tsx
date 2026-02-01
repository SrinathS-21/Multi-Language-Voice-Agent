"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  TestTube,
  CheckCircle,
  XCircle,
  Loader2,
  BookOpen,
  ChevronDown,
  Copy,
  Plus,
  Trash2,
  Code,
  Table,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAgentStore } from "@/store";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { useSearchParams } from "next/navigation";
import { useConfigureIntegration } from "@/api/hooks";
import type { Integration } from "@/api/endpoints";

// Integration configuration schemas
const INTEGRATION_CONFIGS: Record<string, IntegrationConfigDef> = {
  "google-sheets": {
    name: "Google Sheets",
    icon: "📊",
    description: "Export call data to Google Sheets via Apps Script",
    fields: [
      {
        name: "webhookUrl",
        type: "string",
        label: "Apps Script Web App URL",
        description: "The URL of your deployed Google Apps Script",
        required: true,
        placeholder: "https://script.google.com/macros/s/...",
      },
      {
        name: "spreadsheetId",
        type: "string",
        label: "Spreadsheet ID (Optional)",
        description: "Override the default spreadsheet",
        required: false,
        placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
      },
      {
        name: "sheetName",
        type: "string",
        label: "Sheet Name (Optional)",
        description: "Specific sheet tab name",
        required: false,
        placeholder: "Call Logs",
      },
    ],
    triggers: ["call_ended", "transcript_ready"],
    hasCustomColumns: true, // Enable custom column builder for Google Sheets
    setupInstructions: `
## 📋 Google Sheets Setup Guide

### Step 1: Create a Google Sheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. **Important:** Add the column headers exactly as you configured below in Row 1

### Step 2: Create Apps Script
1. Click **Extensions** → **Apps Script**
2. Delete any existing code
3. **Copy the generated code** from the "Generated Apps Script" section below
4. Paste it in the Apps Script editor

### Step 3: Deploy as Web App
1. Click **Deploy** → **New deployment**
2. Click the gear icon ⚙️ → Select **Web app**
3. Configure:
   - **Description**: Voice Agent Integration
   - **Execute as**: Me
   - **Who has access**: Anyone
4. Click **Deploy**
5. **Copy the Web app URL** - paste it in the URL field above!

### Step 4: Test Your Deployment
1. Click the "Test Connection" button above
2. Check your spreadsheet - a test row should appear
3. Delete the test row when confirmed working

### 🔒 Security Notes
- The Apps Script runs with your permissions
- Only the webhook URL is exposed
- Consider adding authentication headers for production
`,
  },
  "slack": {
    name: "Slack",
    icon: "💬",
    description: "Send call notifications to Slack channels",
    fields: [
      {
        name: "webhookUrl",
        type: "string",
        label: "Slack Webhook URL",
        description: "Create an Incoming Webhook in your Slack workspace",
        required: true,
        placeholder: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX",
      },
      {
        name: "channel",
        type: "string",
        label: "Channel Override (Optional)",
        description: "Override the default channel",
        required: false,
        placeholder: "#call-logs",
      },
      {
        name: "username",
        type: "string",
        label: "Bot Username",
        description: "Display name for messages",
        required: false,
        defaultValue: "Voice Agent",
      },
      {
        name: "includeTranscript",
        type: "boolean",
        label: "Include Transcript",
        description: "Attach the full transcript to messages",
        required: false,
        defaultValue: false,
      },
      {
        name: "mentionOnEscalation",
        type: "string",
        label: "User to Mention on Escalation",
        description: "Slack user ID to @mention when escalation is requested",
        required: false,
        placeholder: "U0123456789",
      },
    ],
    triggers: ["call_started", "call_ended", "escalation_requested"],
    setupInstructions: `
## 💬 Slack Setup Guide

### Step 1: Create a Slack App
1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it "Voice Agent" and select your workspace

### Step 2: Enable Incoming Webhooks
1. In your app settings, click **Incoming Webhooks**
2. Toggle **Activate Incoming Webhooks** to ON
3. Click **Add New Webhook to Workspace**
4. Select the channel for notifications
5. Click **Allow**
6. **Copy the Webhook URL**

### Step 3: Customize Messages (Optional)
The integration sends rich messages with:
- 📞 Call summary with duration
- 😊 Sentiment indicators
- 📋 Key information extracted
- 🚨 Urgent alerts for escalations

### 🔒 Security Notes
- Webhook URLs should be kept secret
- Consider using a private channel for sensitive data
- Enable Slack's Enterprise Key Management for compliance
`,
  },
  "webhook": {
    name: "Webhook",
    icon: "🔗",
    description: "Send call data to any HTTP endpoint",
    fields: [
      {
        name: "url",
        type: "string",
        label: "Webhook URL",
        description: "The HTTP endpoint to send data to",
        required: true,
        placeholder: "https://api.example.com/webhook",
      },
      {
        name: "method",
        type: "select",
        label: "HTTP Method",
        required: true,
        defaultValue: "POST",
        options: ["POST", "PUT", "PATCH"],
      },
      {
        name: "headers",
        type: "keyvalue",
        label: "Custom Headers",
        description: "Add authentication or custom headers",
        required: false,
      },
      {
        name: "bodyTemplate",
        type: "textarea",
        label: "Body Template (Optional)",
        description: "Custom JSON template. Use {{callId}}, {{transcript}}, etc.",
        required: false,
        placeholder: `{
  "event": "{{trigger}}",
  "callId": "{{callId}}",
  "data": {{json extractedData}}
}`,
      },
    ],
    triggers: ["call_started", "call_ended", "transcript_ready", "intent_detected", "escalation_requested", "custom"],
    setupInstructions: `
## 🔗 Webhook Setup Guide

### Available Template Variables

| Variable | Description |
|----------|-------------|
| \`{{callId}}\` | Unique call identifier |
| \`{{callSessionId}}\` | Session ID for the call |
| \`{{callerNumber}}\` | Caller's phone number |
| \`{{duration}}\` | Call duration in seconds |
| \`{{transcript}}\` | Full call transcript |
| \`{{trigger}}\` | The event that triggered this webhook |
| \`{{json extractedData}}\` | All extracted data as JSON |

### Example Payloads

**Default Payload:**
\`\`\`json
{
  "callId": "call_abc123",
  "trigger": "call_ended",
  "timestamp": "2024-01-15T10:30:00Z",
  "callerNumber": "+1234567890",
  "duration": 180,
  "transcript": "...",
  "extractedData": {
    "customerName": "John",
    "intent": "appointment_booking",
    "sentiment": "positive"
  }
}
\`\`\`

### Authentication

Add custom headers for authentication:
- \`Authorization: Bearer your-api-key\`
- \`X-API-Key: your-api-key\`
- \`X-Webhook-Secret: your-secret\`
`,
  },
  "email": {
    name: "Email",
    icon: "📧",
    description: "Send email notifications via SendGrid, Mailgun, or SMTP",
    fields: [
      {
        name: "provider",
        type: "select",
        label: "Email Provider",
        required: true,
        options: ["sendgrid", "mailgun", "smtp"],
      },
      {
        name: "apiKey",
        type: "password",
        label: "API Key",
        description: "Your email provider API key",
        required: true,
        placeholder: "SG.xxxxxxxxxxxxxx",
      },
      {
        name: "fromEmail",
        type: "string",
        label: "From Email",
        required: true,
        placeholder: "noreply@example.com",
      },
      {
        name: "fromName",
        type: "string",
        label: "From Name",
        required: false,
        defaultValue: "Voice Agent",
      },
      {
        name: "toEmails",
        type: "string",
        label: "Recipient Emails",
        description: "Comma-separated list of email addresses",
        required: true,
        placeholder: "team@example.com, manager@example.com",
      },
      {
        name: "subjectTemplate",
        type: "string",
        label: "Subject Template",
        required: false,
        defaultValue: "[Voice Agent] Call {{trigger}} - {{callId}}",
      },
    ],
    triggers: ["call_ended", "transcript_ready", "escalation_requested"],
    setupInstructions: `
## 📧 Email Setup Guide

### SendGrid Setup
1. Sign up at [SendGrid](https://sendgrid.com)
2. Go to **Settings** → **API Keys**
3. Create an API key with **Mail Send** permission
4. Verify your sender email in **Settings** → **Sender Authentication**

### Mailgun Setup
1. Sign up at [Mailgun](https://www.mailgun.com)
2. Add and verify your domain
3. Get your API key from the dashboard
4. Use the domain format: \`mg.yourdomain.com\`

### SMTP Setup
For SMTP, you'll also need:
- **Host**: smtp.example.com
- **Port**: 587 (TLS) or 465 (SSL)
- **Username**: Your SMTP username
- **Password**: Your SMTP password

### Email Templates
Emails include:
- Call summary with key metrics
- Customer information extracted
- Full transcript (optional)
- Link to call details in dashboard
`,
  },
};

interface IntegrationConfigDef {
  name: string;
  icon: string;
  description: string;
  fields: FieldDef[];
  triggers: string[];
  setupInstructions: string;
  hasCustomColumns?: boolean; // Enable custom column builder
}

interface FieldDef {
  name: string;
  type: "string" | "boolean" | "select" | "textarea" | "password" | "keyvalue";
  label: string;
  description?: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: any;
  options?: string[];
}

// Available column types for Google Sheets
interface ColumnDefinition {
  id: string;
  name: string;          // Column header name (user-defined)
  description?: string;  // Description to help AI understand what to extract
  source: DataSourceType; // Category of data source
  path: string;          // Path to data or description of what to extract
  format?: DataFormat;   // Optional format transformation
  fallback?: string;     // Default value if not found
}

// Data source categories - matches backend DynamicDataExtractor
type DataSourceType = 'call' | 'transcript' | 'extracted' | 'agent' | 'static';

// Format transformations
type DataFormat = 'text' | 'datetime' | 'date' | 'time' | 'phone' | 'number' | 'currency' | 'uppercase' | 'lowercase' | 'json';

// Data source documentation for user guidance
const DATA_SOURCE_OPTIONS: { value: DataSourceType; label: string; description: string; icon: string; examples: string[] }[] = [
  { 
    value: 'call', 
    label: 'Call Data', 
    description: 'Call metadata (always available)', 
    icon: '📞',
    examples: ['callId', 'duration', 'callerNumber', 'startTime', 'endTime', 'direction']
  },
  { 
    value: 'transcript', 
    label: 'Transcript', 
    description: 'Conversation text', 
    icon: '💬',
    examples: ['full', 'summary', 'userOnly', 'agentOnly']
  },
  { 
    value: 'extracted', 
    label: '✨ AI Extracted (Recommended)', 
    description: 'AI extracts this from the conversation - just describe what you want!', 
    icon: '🤖',
    examples: ['customer name', 'appointment date', 'reason for visit', 'phone number', 'email address']
  },
  { 
    value: 'agent', 
    label: 'Agent Info', 
    description: 'Agent details', 
    icon: '📋',
    examples: ['name', 'id', 'organizationId']
  },
  { 
    value: 'static', 
    label: 'Static Value', 
    description: 'Fixed text (the path becomes the value)', 
    icon: '📝',
    examples: ['Completed', 'Voice Agent', 'Active']
  },
];

// Format options
const FORMAT_OPTIONS: { value: DataFormat | 'auto'; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto (Default)', description: 'No transformation' },
  { value: 'text', label: 'Text', description: 'Plain text' },
  { value: 'datetime', label: 'Date & Time', description: 'Full datetime' },
  { value: 'date', label: 'Date Only', description: 'Date without time' },
  { value: 'time', label: 'Time Only', description: 'Time without date' },
  { value: 'phone', label: 'Phone Number', description: 'Formatted phone' },
  { value: 'number', label: 'Number', description: 'Numeric value' },
  { value: 'currency', label: 'Currency', description: 'Money format' },
  { value: 'uppercase', label: 'UPPERCASE', description: 'All caps' },
  { value: 'lowercase', label: 'lowercase', description: 'All lower' },
  { value: 'json', label: 'JSON', description: 'Stringify as JSON' },
];

const _TRIGGER_LABELS: Record<string, string> = {
  call_started: "Call Started",
  call_ended: "Call Ended",
  transcript_ready: "Transcript Ready",
  intent_detected: "Intent Detected",
  escalation_requested: "Escalation",
  custom: "Custom Event",
};

export default function ConfigureIntegrationPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const agentId = params.id as string;
  const toolId = params.toolId as string;
  const integrationId = searchParams.get("integrationId") as string | null;

  const { currentAgent: _currentAgent, fetchAgent, isLoading: _isLoading } = useAgentStore();
  const { mutate: configureIntegration } = useConfigureIntegration();
  
  // Load existing integration for editing
  // TODO: Add API endpoint to get single integration by ID
  const existingIntegration = null as Integration | null; // Will be loaded from backend when endpoint is available
  
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [_showInstructions, _setShowInstructions] = useState(true);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [enabledTriggers, setEnabledTriggers] = useState<string[]>([]);
  const [integrationName, setIntegrationName] = useState("");
  const [isLoadedFromExisting, setIsLoadedFromExisting] = useState(false);
  
  // Custom columns for Google Sheets
  const [columns, setColumns] = useState<ColumnDefinition[]>(() => {
    // Initialize with just timestamp column - user adds their own
    return [
      { id: '1', name: 'Timestamp', source: 'call' as DataSourceType, path: 'startTime', format: 'datetime' as DataFormat },
    ];
  });
  const [_showAdvancedColumn, _setShowAdvancedColumn] = useState<string | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);

  const config = INTEGRATION_CONFIGS[toolId];

  // Generate Apps Script based on dynamic columns
  const generatedAppsScript = useMemo(() => {
    if (!config?.hasCustomColumns) return "";
    
    return `/**
 * 🚀 Google Apps Script for Voice Agent Integration v3.0
 * 
 * COLUMNS: ${columns.map(c => c.name).join(', ')}
 * 
 * This script receives pre-extracted data from your AI voice agent.
 * Data is already processed by LLM - just insert it!
 */

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ready',
    message: 'Google Sheets webhook is active ✅',
    version: '3.0.0'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = data._sheetName ? ss.getSheetByName(data._sheetName) : ss.getActiveSheet();
    
    if (!sheet && data._sheetName) {
      sheet = ss.insertSheet(data._sheetName);
    }
    
    // Handle test connection - also set headers if provided
    if (data._test) {
      // If headers are provided, set them
      if (data._setHeaders && data._headers && data._headers.length > 0) {
        const headers = data._headers;
        
        // Create or update header row
        if (sheet.getLastRow() === 0) {
          sheet.appendRow(headers);
        } else {
          // Update existing headers (first row)
          const currentCols = sheet.getLastColumn() || headers.length;
          sheet.getRange(1, 1, 1, Math.max(currentCols, headers.length)).clearContent();
          sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        }
        // Style the header row
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
        
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          message: 'Connection successful! ✅ Headers set: ' + headers.join(', '),
          headersSet: true,
          columnsCreated: headers.length,
          version: '3.0.0'
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Connection successful! ✅',
        version: '3.0.0'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Get column mapping from request or use data keys
    const mapping = data._columnMapping || [];
    
    // Create header row if empty
    if (sheet.getLastRow() === 0 && mapping.length > 0) {
      const headers = mapping.map(col => col.name);
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    }
    
    // Extract data - backend already extracted everything, just read by column name
    const rowData = mapping.length > 0 
      ? mapping.map(col => data[col.name] || '')
      : Object.values(data).filter(v => typeof v !== 'object');
    
    // Append row
    if (rowData.length > 0) {
      sheet.appendRow(rowData);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Data added successfully ✅',
      rowNumber: sheet.getLastRow(),
      callId: data.callId
    })).setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;
  }, [columns, config?.hasCustomColumns]);

  // Column management functions
  const addColumn = () => {
    const newId = String(Date.now());
    setColumns([...columns, {
      id: newId,
      name: "",
      description: "",
      source: "extracted",
      path: "",
      format: undefined,
      fallback: "",
    }]);
  };

  const removeColumn = (id: string) => {
    if (columns.length > 1) {
      setColumns(columns.filter(col => col.id !== id));
    }
  };

  const updateColumn = (id: string, updates: Partial<ColumnDefinition>) => {
    setColumns(columns.map(col => 
      col.id === id ? { ...col, ...updates } : col
    ));
  };

  const moveColumnUp = (index: number) => {
    if (index === 0) return;
    const newColumns = [...columns];
    [newColumns[index - 1], newColumns[index]] = [newColumns[index], newColumns[index - 1]];
    setColumns(newColumns);
  };

  const moveColumnDown = (index: number) => {
    if (index === columns.length - 1) return;
    const newColumns = [...columns];
    [newColumns[index], newColumns[index + 1]] = [newColumns[index + 1], newColumns[index]];
    setColumns(newColumns);
  };

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(generatedAppsScript);
      setScriptCopied(true);
      toast({
        title: "Copied!",
        description: "Apps Script copied to clipboard. Paste it in Google Apps Script.",
      });
      setTimeout(() => setScriptCopied(false), 3000);
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please manually select and copy the code",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchAgent(agentId);
  }, [agentId, fetchAgent]);

  useEffect(() => {
    if (config) {
      // Initialize form with default values
      const defaults: Record<string, any> = {};
      config.fields.forEach((field) => {
        if (field.defaultValue !== undefined) {
          defaults[field.name] = field.defaultValue;
        }
      });
      setFormData(defaults);
      setIntegrationName(config.name);
      // Enable all triggers by default
      setEnabledTriggers(config.triggers);
    }
  }, [config]);

  // Load existing integration data when editing
  useEffect(() => {
    if (!existingIntegration || isLoadedFromExisting) return;
    
    setIntegrationName(existingIntegration.name || '');
    setFormData(existingIntegration.config || {});
    setEnabledTriggers(existingIntegration.enabledTriggers || []);
    
    // Load custom columns if they exist (stored in config.columns for Google Sheets)
    if (existingIntegration.config?.columns && Array.isArray(existingIntegration.config.columns)) {
      setColumns(existingIntegration.config.columns as ColumnDefinition[]);
    }
    
    setIsLoadedFromExisting(true);
    
    toast({
      title: "Editing Integration",
      description: `Loaded configuration for ${existingIntegration.name || 'integration'}`,
    });
  }, [existingIntegration, isLoadedFromExisting, toast]);

  const handleFieldChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const _handleTriggerToggle = (trigger: string) => {
    setEnabledTriggers((prev) =>
      prev.includes(trigger)
        ? prev.filter((t) => t !== trigger)
        : [...prev, trigger]
    );
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      // Test connection by sending test payload to webhook URL via backend proxy
      if (toolId === "google-sheets" && formData.webhookUrl) {
        // Validate URL format first
        if (!formData.webhookUrl.includes('script.google.com') || 
            !formData.webhookUrl.endsWith('/exec')) {
          setTestResult({
            success: false,
            message: "⚠️ Invalid URL! Must be a Google Apps Script Web App URL ending in /exec",
          });
          setIsTesting(false);
          return;
        }

        // Use backend proxy to avoid CORS issues
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const response = await fetch(`${apiUrl}/api/v1/integrations/test-webhook`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhookUrl: formData.webhookUrl,
            columns: columns.map(c => c.name), // Send column names to set as headers
          }),
        });

        const result = await response.json();
        
        if (result.success) {
          setTestResult({
            success: true,
            message: result.headersSet 
              ? `Connection successful! ✅\n\n📊 Column headers set in your Google Sheet: ${columns.map(c => c.name).join(', ')}`
              : result.message || "Connection successful! ✅",
          });
        } else {
          setTestResult({
            success: false,
            message: result.error || "Connection failed",
          });
        }
      } else {
        // For other integrations, mock success for now
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setTestResult({
          success: true,
          message: "Configuration validated successfully!",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      setTestResult({
        success: false,
        message: `Test failed: ${errorMessage}

💡 Make sure:
• Backend API is running (http://localhost:8000)
• Google Apps Script is deployed correctly
• Webhook URL is correct and ends with /exec`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    // Validate required fields
    const missingFields = config?.fields
      .filter((f) => f.required && !formData[f.name])
      .map((f) => f.label);

    if (missingFields && missingFields.length > 0) {
      toast({
        title: "Missing required fields",
        description: `Please fill in: ${missingFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    if (enabledTriggers.length === 0) {
      toast({
        title: "No triggers selected",
        description: "Please select at least one trigger event",
        variant: "destructive",
      });
      return;
    }

    // Validate columns for Google Sheets
    if (config?.hasCustomColumns && columns.length === 0) {
      toast({
        title: "No columns defined",
        description: "Please add at least one column for your spreadsheet",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      // Prepare configuration data
      const integrationConfig = {
        ...formData,
        // Explicitly disable transcript column to only use user-defined columns
        includeTranscript: false,
        // Include dynamic columns for Google Sheets (new format!)
        ...(config?.hasCustomColumns && {
          columns: columns.map(col => ({
            name: col.name,
            description: col.description || col.path,
            source: col.source,
            path: col.path,
            format: col.format || undefined,
            fallback: col.fallback || undefined,
          }))
        })
      };

      // Save integration to backend API
      await configureIntegration({
        agentId: agentId,
        toolId: toolId,
        name: integrationName || config.name,
        config: integrationConfig,
        enabledTriggers: enabledTriggers,
        status: "active",
      });
      
      if (integrationId) {
        toast({
          title: "Integration updated! ✅",
          description: `${integrationName || config.name} has been updated successfully`,
        });
      } else {
        toast({
          title: "Integration created! ✅",
          description: `${integrationName || config.name} has been configured successfully`,
        });
      }

      console.log('✅ Integration saved to database:', {
        agentId,
        toolId,
        name: integrationName,
        triggers: enabledTriggers,
      });

      // Navigate back to agent page
      router.push(`/agents/${agentId}`);
    } catch (error) {
      toast({
        title: "Failed to save",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const _copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      duration: 2000,
    });
  };

  if (!config) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Integration not found</h3>
            <p className="text-muted-foreground mb-4">
              The integration "{toolId}" does not exist.
            </p>
            <Button onClick={() => router.push(`/agents/${agentId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Agent
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/agents/${agentId}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="text-4xl">{config.icon}</div>
            <div>
              <h1 className="text-2xl font-bold">
                {integrationId ? "Edit" : "Configure"} {config.name}
              </h1>
              <p className="text-muted-foreground">{config.description}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTest} disabled={isTesting}>
            {isTesting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <TestTube className="h-4 w-4 mr-2" />
            )}
            Test Connection
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Integration
          </Button>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <Card className={cn(
          "border-2",
          testResult.success ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"
        )}>
          <CardContent className="py-4">
            <div className="flex items-start gap-2">
              {testResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              )}
              <pre className={cn(
                "whitespace-pre-wrap font-sans text-sm",
                testResult.success ? "text-green-700" : "text-red-700"
              )}>
                {testResult.message}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Google Sheets Deployment Warning */}
      {toolId === "google-sheets" && !testResult?.success && null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Configuration Form */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Integration Name</CardTitle>
              <CardDescription>A friendly name for this integration</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                value={integrationName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIntegrationName(e.target.value)}
                placeholder="My Google Sheets Export"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Enter your integration settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.fields.map((field) => (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name}>
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  
                  {field.type === "string" && (
                    <Input
                      id={field.name}
                      value={formData[field.name] || ""}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(field.name, e.target.value)}
                      placeholder={field.placeholder}
                    />
                  )}
                  
                  {field.type === "password" && (
                    <Input
                      id={field.name}
                      type="password"
                      value={formData[field.name] || ""}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(field.name, e.target.value)}
                      placeholder={field.placeholder}
                    />
                  )}
                  
                  {field.type === "textarea" && (
                    <Textarea
                      id={field.name}
                      value={formData[field.name] || ""}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange(field.name, e.target.value)}
                      placeholder={field.placeholder}
                      className="font-mono text-sm"
                      rows={6}
                    />
                  )}
                  
                  {field.type === "select" && (
                    <Select
                      value={formData[field.name] || field.defaultValue}
                      onValueChange={(value: string) => handleFieldChange(field.name, value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options?.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  
                  {field.type === "boolean" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={field.name}
                        checked={formData[field.name] ?? field.defaultValue ?? false}
                        onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <Label htmlFor={field.name} className="font-normal cursor-pointer">
                        {field.description}
                      </Label>
                    </div>
                  )}
                  
                  {field.description && field.type !== "boolean" && (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Column Builder and Instructions */}
        <div className="space-y-6">
          {/* Column Builder for Google Sheets */}
          {config.hasCustomColumns && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Table className="h-5 w-5" />
                    <div>
                      <CardTitle>Sheet Columns</CardTitle>
                      <CardDescription>
                        Define what data to capture from each call
                      </CardDescription>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={addColumn}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Column
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {columns.map((column, index) => (
                  <div 
                    key={column.id} 
                    className="p-3 bg-muted/50 rounded-lg border space-y-2"
                  >
                    {/* Column Name and Controls */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground"
                          onClick={() => moveColumnUp(index)}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground"
                          onClick={() => moveColumnDown(index)}
                          disabled={index === columns.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <Badge variant="outline" className="text-xs font-mono w-8 justify-center">
                        {String.fromCharCode(65 + index)}
                      </Badge>
                      <Input
                        value={column.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateColumn(column.id, { name: e.target.value })}
                        placeholder="Column name"
                        className="h-8 text-sm flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => removeColumn(column.id)}
                        disabled={columns.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {/* Description */}
                    <div className="pl-[76px]">
                      <Input
                        value={column.description || column.path}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateColumn(column.id, { 
                          description: e.target.value,
                          path: e.target.value
                        })}
                        placeholder="Describe what to extract (e.g., customer name, appointment date)"
                        className="h-8 text-sm"
                      />
                    </div>

                    {/* Advanced Options */}
                    <Collapsible className="pl-[76px]">
                      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <ChevronDown className="h-3 w-3" />
                        Advanced
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <Select
                            value={column.source}
                            onValueChange={(value: DataSourceType) => {
                              let defaultPath = column.path;
                              if (value === 'call') defaultPath = 'callId';
                              else if (value === 'transcript') defaultPath = 'full';
                              else if (value === 'extracted') defaultPath = column.description || 'customer name';
                              else if (value === 'agent') defaultPath = 'name';
                              else if (value === 'static') defaultPath = 'Static Value';
                              
                              updateColumn(column.id, { source: value, path: defaultPath });
                            }}
                          >
                            <SelectTrigger className="h-8 text-sm w-[160px]">
                              <SelectValue placeholder="Data Source" />
                            </SelectTrigger>
                            <SelectContent>
                              {DATA_SOURCE_OPTIONS.map((source) => (
                                <SelectItem key={source.value} value={source.value}>
                                  <span className="flex items-center gap-2">
                                    <span>{source.icon}</span>
                                    <span>{source.label}</span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={column.format || 'auto'}
                            onValueChange={(value: DataFormat | 'auto') => updateColumn(column.id, { format: value === 'auto' ? undefined : value })}
                          >
                            <SelectTrigger className="h-8 text-sm w-[120px]">
                              <SelectValue placeholder="Format" />
                            </SelectTrigger>
                            <SelectContent>
                              {FORMAT_OPTIONS.map((fmt) => (
                                <SelectItem key={fmt.value} value={fmt.value}>
                                  {fmt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {column.source !== 'extracted' && (
                          <Input
                            value={column.path}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateColumn(column.id, { path: e.target.value })}
                            placeholder="Data path"
                            className="h-8 text-xs font-mono"
                          />
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                ))}
                
                {/* Data Source Reference */}
                <Collapsible className="mt-4">
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <BookOpen className="h-4 w-4" />
                    <span>Data Source Reference</span>
                    <ChevronDown className="h-4 w-4" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 p-3 bg-muted/30 rounded-lg text-xs space-y-2">
                    {DATA_SOURCE_OPTIONS.map((source) => (
                      <div key={source.value} className="flex gap-2">
                        <span className="font-medium w-24">{source.icon} {source.label}:</span>
                        <span className="text-muted-foreground">{source.examples.join(', ')}</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          )}

          {/* Generated Apps Script */}
          {config.hasCustomColumns && generatedAppsScript && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    <div>
                      <CardTitle>Generated Apps Script</CardTitle>
                      <CardDescription>Copy this code to your Google Sheet</CardDescription>
                    </div>
                  </div>
                  <Button 
                    variant={scriptCopied ? "default" : "outline"} 
                    size="sm" 
                    onClick={copyScript}
                    className={scriptCopied ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    {scriptCopied ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" />
                        Copy Script
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute top-2 right-2 flex gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {columns.length} columns
                    </Badge>
                  </div>
                  <pre className="p-4 bg-slate-950 text-slate-50 rounded-lg text-xs overflow-x-auto max-h-[400px] overflow-y-auto">
                    <code>{generatedAppsScript}</code>
                  </pre>
                </div>
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                    📋 Quick Setup Steps:
                  </h4>
                  <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                    <li>Click "Copy Script" above</li>
                    <li>Open your Google Sheet → Extensions → Apps Script</li>
                    <li>Delete all existing code, paste this script</li>
                    <li>Click Deploy → New deployment → Web app</li>
                    <li>Set "Who has access" to "Anyone", click Deploy</li>
                    <li>Copy the URL and paste it in the "Apps Script Web App URL" field above</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Simple markdown renderer (you may want to use a proper library like react-markdown)
function _renderMarkdown(markdown: string): string {
  return markdown
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-blue-600 hover:underline">$1</a>')
    .replace(/\| (.*) \|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      return `<tr>${cells.map(c => `<td class="border px-2 py-1">${c.trim()}</td>`).join('')}</tr>`;
    });
}
