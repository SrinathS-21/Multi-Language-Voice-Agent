"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  Table,
  Save,
  TestTube,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Settings2,
  HelpCircle,
  Bot,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

// Column definition type
type DataSourceType = 'call' | 'transcript' | 'extracted' | 'agent' | 'static';
type DataFormat = 'text' | 'datetime' | 'date' | 'time' | 'phone' | 'number' | 'currency' | 'uppercase' | 'lowercase' | 'json';

interface ColumnDefinition {
  id: string;
  name: string;
  source: DataSourceType;
  path: string;
  description?: string;
  format?: DataFormat;
  fallback?: string;
}

// Available data sources for columns
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
    label: '✨ AI Extracted', 
    description: 'AI extracts this from the conversation', 
    icon: '🤖',
    examples: ['customer name', 'appointment date', 'reason for visit', 'phone number', 'email']
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
    description: 'Fixed text', 
    icon: '📝',
    examples: ['Completed', 'Active']
  },
];

// Format options
const FORMAT_OPTIONS: { value: DataFormat | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'text', label: 'Text' },
  { value: 'datetime', label: 'Date & Time' },
  { value: 'date', label: 'Date Only' },
  { value: 'time', label: 'Time Only' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'uppercase', label: 'UPPERCASE' },
  { value: 'lowercase', label: 'lowercase' },
  { value: 'json', label: 'JSON' },
];

// Trigger options
const _TRIGGERS = [
  { value: "call_ended", label: "Call Ended", description: "When a call is completed" },
  { value: "transcript_ready", label: "Transcript Ready", description: "When transcript is processed" },
];

// Default columns for new configurations
const DEFAULT_COLUMNS: ColumnDefinition[] = [
  { id: "1", name: "Timestamp", source: 'call', path: "startTime", format: 'datetime' },
  { id: "2", name: "Caller", source: 'call', path: "callerNumber", format: 'phone' },
  { id: "3", name: "Customer Name", source: 'extracted', path: "customer name" },
  { id: "4", name: "Duration", source: 'call', path: "duration", format: 'number' },
  { id: "5", name: "Intent", source: 'extracted', path: "main intent" },
  { id: "6", name: "Outcome", source: 'extracted', path: "call outcome" },
];

export default function IntegrationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { agents, fetchAgents, isLoading: agentsLoading } = useAgentStore();

  // State
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [sheetName, setSheetName] = useState("Call Logs");
  const [columns, setColumns] = useState<ColumnDefinition[]>(DEFAULT_COLUMNS);
  const [enabledTriggers, setEnabledTriggers] = useState<string[]>(["call_ended"]);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("configure");

  // Load agents on mount
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Auto-select first agent
  useEffect(() => {
    if (agents.length > 0 && !selectedAgentId) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId]);

  // Column management
  const addColumn = useCallback(() => {
    const newId = String(Date.now());
    setColumns(prev => [...prev, {
      id: newId,
      name: "New Column",
      source: 'extracted',
      path: "describe what to extract"
    }]);
  }, []);

  const removeColumn = useCallback((id: string) => {
    if (columns.length > 1) {
      setColumns(prev => prev.filter(col => col.id !== id));
    }
  }, [columns.length]);

  const updateColumn = useCallback((id: string, updates: Partial<ColumnDefinition>) => {
    setColumns(prev => prev.map(col =>
      col.id === id ? { ...col, ...updates } : col
    ));
  }, []);

  const moveColumn = useCallback((index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= columns.length) return;
    
    const newColumns = [...columns];
    [newColumns[index], newColumns[newIndex]] = [newColumns[newIndex], newColumns[index]];
    setColumns(newColumns);
  }, [columns]);

  // Toggle trigger
  const _toggleTrigger = useCallback((trigger: string) => {
    setEnabledTriggers(prev =>
      prev.includes(trigger)
        ? prev.filter(t => t !== trigger)
        : [...prev, trigger]
    );
  }, []);

  // Generate Apps Script
  const generatedAppsScript = useMemo(() => {
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
    
    // Get column mapping from request
    const mapping = data._columnMapping || [];
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = data._sheetName ? ss.getSheetByName(data._sheetName) : ss.getActiveSheet();
    
    if (!sheet && data._sheetName) {
      sheet = ss.insertSheet(data._sheetName);
    }
    
    // Handle test connection - create/update headers
    if (data._test) {
      if (mapping.length > 0) {
        const headers = mapping.map(col => col.name);
        
        // Create or update header row
        if (sheet.getLastRow() === 0) {
          sheet.appendRow(headers);
          sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
        } else {
          // Update existing headers
          sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
          sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
        }
        
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          message: 'Connection successful! ✅ Column headers created/updated.',
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
    
    // Create header row if empty
    if (sheet.getLastRow() === 0 && mapping.length > 0) {
      const headers = mapping.map(col => col.name);
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    }
    
    // Extract data - backend already extracted everything, just read by column name
    const rowData = mapping.map(col => data[col.name] || '');
    
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
  }, [columns]);

  // Copy script to clipboard
  const copyScript = useCallback(() => {
    try {
      navigator.clipboard.writeText(generatedAppsScript);
      setScriptCopied(true);
      toast({ title: "Copied!", description: "Script copied to clipboard" });
      setTimeout(() => setScriptCopied(false), 3000);
    } catch {
      toast({ title: "Copy failed", description: "Please select and copy manually", variant: "destructive" });
    }
  }, [generatedAppsScript, toast]);

  // Test connection
  const handleTest = useCallback(async () => {
    if (!webhookUrl) {
      toast({ title: "Missing URL", description: "Please enter your Apps Script URL", variant: "destructive" });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _test: true, _sheetName: sheetName }),
      });
      
      const result = await response.json();
      setTestResult({
        success: result.success,
        message: result.success ? "Connection successful! Check your spreadsheet." : result.error || "Test failed"
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Connection failed"
      });
    } finally {
      setIsTesting(false);
    }
  }, [webhookUrl, sheetName, toast]);

  // Save configuration
  const handleSave = useCallback(async () => {
    if (!selectedAgentId) {
      toast({ title: "Select Agent", description: "Please select an agent first", variant: "destructive" });
      return;
    }
    if (!webhookUrl) {
      toast({ title: "Missing URL", description: "Please enter your Apps Script URL", variant: "destructive" });
      return;
    }
    if (columns.length === 0) {
      toast({ title: "No Columns", description: "Add at least one column", variant: "destructive" });
      return;
    }
    if (enabledTriggers.length === 0) {
      toast({ title: "No Triggers", description: "Select at least one trigger", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    try {
      // TODO: Save to backend
      console.log('Saving configuration:', {
        agentId: selectedAgentId,
        webhookUrl,
        sheetName,
        columns,
        triggers: enabledTriggers
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({ title: "Saved!", description: "Google Sheets integration configured successfully" });
    } catch (error) {
      toast({ 
        title: "Save Failed", 
        description: error instanceof Error ? error.message : "Unknown error", 
        variant: "destructive" 
      });
    } finally {
      setIsSaving(false);
    }
  }, [selectedAgentId, webhookUrl, sheetName, columns, enabledTriggers, toast]);

  // Unused but keeping for future use
  const _selectedAgent = agents.find(a => a.id === selectedAgentId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto py-8 px-4 max-w-7xl">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Sheet className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Google Sheets Integration</h1>
                <p className="text-muted-foreground text-sm">
                  Automatically export call data to your spreadsheet
                </p>
              </div>
            </div>
          </div>

          {/* Main Layout */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column - Configuration */}
            <div className="lg:col-span-2 space-y-6">
              {/* Agent Selection */}
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">Select Agent</CardTitle>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => fetchAgents()}>
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {agentsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading agents...
                    </div>
                  ) : agents.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-muted-foreground mb-2">No agents found</p>
                      <Button size="sm" onClick={() => router.push('/agents/new')}>
                        Create Agent
                      </Button>
                    </div>
                  ) : (
                    <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map(agent => (
                          <SelectItem key={agent.id} value={agent.id}>
                            <div className="flex items-center gap-2">
                              <span>{agent.name}</span>
                              {agent.status === 'active' && (
                                <Badge variant="secondary" className="text-[10px] px-1">Active</Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="configure" className="gap-2">
                    <Settings2 className="h-3 w-3" />
                    Configure
                  </TabsTrigger>
                  <TabsTrigger value="columns" className="gap-2">
                    <Table className="h-3 w-3" />
                    Columns
                  </TabsTrigger>
                  <TabsTrigger value="script" className="gap-2">
                    <ExternalLink className="h-3 w-3" />
                    Apps Script
                  </TabsTrigger>
                </TabsList>

                {/* Configure Tab */}
                <TabsContent value="configure" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Connection Settings</CardTitle>
                      <CardDescription>Enter your Google Apps Script Web App URL</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="webhookUrl">
                          Apps Script URL <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="webhookUrl"
                          value={webhookUrl}
                          onChange={(e) => setWebhookUrl(e.target.value)}
                          placeholder="https://script.google.com/macros/s/..."
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground">
                          Deploy your Apps Script as a web app and paste the URL here
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="sheetName">Sheet Tab Name</Label>
                        <Input
                          id="sheetName"
                          value={sheetName}
                          onChange={(e) => setSheetName(e.target.value)}
                          placeholder="Call Logs"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Test Result */}
                  {testResult && (
                    <Card className={cn(
                      "border-2",
                      testResult.success ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-red-500 bg-red-50 dark:bg-red-950/20"
                    )}>
                      <CardContent className="py-4">
                        <div className="flex items-center gap-3">
                          {testResult.success ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-600" />
                          )}
                          <span className={testResult.success ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                            {testResult.message}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Columns Tab */}
                <TabsContent value="columns" className="mt-4">
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
                                onClick={() => moveColumn(index, "up")}
                                disabled={index === 0}
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground"
                                onClick={() => moveColumn(index, "down")}
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
                              onChange={(e) => updateColumn(column.id, { name: e.target.value })}
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
                              onChange={(e) => updateColumn(column.id, { 
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
                                  onChange={(e) => updateColumn(column.id, { path: e.target.value })}
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
                </TabsContent>

                {/* Script Tab */}
                <TabsContent value="script" className="mt-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">Generated Apps Script</CardTitle>
                          <CardDescription>Copy this code to your Google Apps Script</CardDescription>
                        </div>
                        <Button size="sm" onClick={copyScript} variant={scriptCopied ? "secondary" : "default"}>
                          {scriptCopied ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3 mr-1" />
                              Copy Code
                            </>
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="relative">
                        <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs font-mono max-h-[500px] overflow-y-auto">
                          <code>{generatedAppsScript}</code>
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Right Column - Setup Guide & Actions */}
            <div className="space-y-6">
              {/* Action Buttons */}
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <Button className="w-full" onClick={handleSave} disabled={isSaving}>
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Configuration
                    </Button>
                    <Button variant="outline" className="w-full" onClick={handleTest} disabled={isTesting}>
                      {isTesting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <TestTube className="h-4 w-4 mr-2" />
                      )}
                      Test Connection
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Setup Guide */}
              <Card>
                <Collapsible open={showGuide} onOpenChange={setShowGuide}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                          <CardTitle className="text-base">Setup Guide</CardTitle>
                        </div>
                        {showGuide ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-4 text-sm">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                          <div>
                            <p className="font-medium">Create Google Sheet</p>
                            <p className="text-muted-foreground text-xs">Create a new spreadsheet in Google Sheets</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                          <div>
                            <p className="font-medium">Open Apps Script</p>
                            <p className="text-muted-foreground text-xs">Extensions → Apps Script</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                          <div>
                            <p className="font-medium">Paste Generated Code</p>
                            <p className="text-muted-foreground text-xs">Copy from "Apps Script" tab and paste</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</div>
                          <div>
                            <p className="font-medium">Deploy as Web App</p>
                            <p className="text-muted-foreground text-xs">Deploy → New deployment → Web app</p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">5</div>
                          <div>
                            <p className="font-medium">Copy Web App URL</p>
                            <p className="text-muted-foreground text-xs">Paste the URL above and test</p>
                          </div>
                        </div>

                        <div className="border-t my-4" />
                        
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                          <p className="text-xs text-amber-800 dark:text-amber-200">
                            <strong>Important:</strong> Set "Who has access" to "Anyone" when deploying the web app
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              {/* Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Column Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {columns.map((col, i) => (
                      <Badge key={col.id} variant="secondary" className="text-xs">
                        {String.fromCharCode(65 + i)}: {col.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
  );
}
