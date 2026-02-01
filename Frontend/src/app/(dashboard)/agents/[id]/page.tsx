"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Phone,
  Trash2,
  Power,
  Settings,
  Plug,
  FileText,
  Loader2,
  ChevronRight,
  Plus,
  MessageSquare,
  Sparkles,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { KBUploader } from "@/components/knowledge/KBUploader";
import { useAgentStore, useKBStore, useUIStore } from "@/store";
import { AgentLanguage, AgentVoice, SUPPORTED_LANGUAGES, VOICE_CONFIG, FEMALE_VOICES, MALE_VOICES, STATUS_COLORS } from "@/types";
import { cn, formatDate } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { 
  useCalls, 
  useCallTranscript,
  useAvailableTools, 
  useAgentIntegrations, 
  useDeleteIntegration,
  useEnhancePrompt,
  useAnalytics,
  useCallVolumeChart,
  useStatusDistribution,
  useLatencyTrends,
  useDurationDistribution,
  useFunctionCalls,
  useSentimentAnalytics
} from "@/api/hooks";

// Import analytics components
import { CallVolumeChart } from "@/components/analytics/CallVolumeChart";
import { LatencyTrendsChart } from "@/components/analytics/LatencyTrendsChart";
import { CallStatusPieChart } from "@/components/analytics/CallStatusPieChart";
import { CallDurationHistogram } from "@/components/analytics/CallDurationHistogram";
import { FunctionCallsChart } from "@/components/analytics/FunctionCallsChart";
import { SentimentChart } from "@/components/analytics/SentimentChart";
import { StatsCard } from "@/components/analytics/StatsCard";

// Import call log components
import { CallLogDetail, CallListItem } from "@/components/calls/CallLogDetail";

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const confirm = useConfirmDialog();
  const { toast } = useToast();
  const ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || process.env.DEFAULT_ORGANIZATION_ID || '';

  const { currentAgent, fetchAgent, updateAgent, deleteAgent, toggleAgentStatus, isLoading } =
    useAgentStore();
  const { documents, fetchDocsByAgent } = useKBStore();
  const { openOutboundCallModal } = useUIStore();

  // State for call detail modal
  const [selectedCall, setSelectedCall] = useState<any>(null);
  const [showCallDetail, setShowCallDetail] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  
  // Fetch transcript for selected call
  const { data: transcriptData, isLoading: transcriptLoading } = useCallTranscript(
    selectedSessionId || ''
  );

  // Fetch agent data and calls from API
  const { data: callsData, isLoading: callsLoading, error: callsError } = useCalls({ agentId: agentId, limit: 50 });
  
  // Fetch analytics data for this agent
  const { data: todayStats } = useAnalytics({ tenantId: ORG_ID, agentId });
  const { data: callVolumeData } = useCallVolumeChart({ tenantId: ORG_ID, agentId, days: 30 }) as { data: any };
  const { data: statusDistribution } = useStatusDistribution({ tenantId: ORG_ID, agentId, days: 30 }) as { data: any };
  const { data: latencyTrends } = useLatencyTrends({ tenantId: ORG_ID, agentId, days: 7 }) as { data: any };
  const { data: durationDistribution } = useDurationDistribution({ tenantId: ORG_ID, agentId, days: 30 }) as { data: any };
  const { data: functionCalls } = useFunctionCalls({ tenantId: ORG_ID, agentId, days: 30 }) as { data: any };
  const { data: sentimentData } = useSentimentAnalytics({ tenantId: ORG_ID, agentId, days: 30 }) as { data: any };
  
  // Debug logging
  React.useEffect(() => {
    console.log('[Agent Detail] Calls Data:', { 
      callsData, 
      callsLoading, 
      callsError,
      agentId 
    });
  }, [callsData, callsLoading, callsError, agentId]);
  
  // Debug logging for analytics
  React.useEffect(() => {
    console.log('[Agent Detail] Analytics Data:', {
      todayStats,
      callVolumeData,
      statusDistribution,
      latencyTrends,
      durationDistribution,
      functionCalls,
      sentimentData,
      agentId
    });
  }, [todayStats, callVolumeData, statusDistribution, latencyTrends, durationDistribution, functionCalls, sentimentData, agentId]);
  
  // Fetch integrations for this agent
  const { data: availableToolsData } = useAvailableTools();
  const { data: integrationsData } = useAgentIntegrations(agentId);
  const { mutate: deleteIntegrationMutation } = useDeleteIntegration();
  const { mutate: enhancePrompt } = useEnhancePrompt();
  
  // Extract the actual arrays from response objects
  const availableTools = availableToolsData?.tools || [];
  const integrations = integrationsData?.integrations || [];
  
  // Transform calls data to frontend format
  const detailedCalls = React.useMemo(() => {
    if (!callsData?.items) return [];
    
    return callsData.items.map((call: any) => ({
        _id: call.session_id,
        sessionId: call.session_id,
        agentId: call.agent_id || agentId,
        agentName: currentAgent?.name,
        callType: call.call_type || (call.phone_number ? 'outbound' : 'web'),
        status: call.status || 'completed',
        callerPhoneNumber: call.phone_number,
        destinationPhoneNumber: call.phone_number,
        startedAt: call.started_at || Date.now(),
        endedAt: call.ended_at,
        durationSeconds: call.duration_seconds || 0,
        isTelephony: !!call.phone_number,
        transcript: [],
        transcriptLength: 0,
      }));
  }, [callsData, agentId, currentAgent]);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    language: "en-IN" as AgentLanguage,
    voice: "anushka" as AgentVoice,
    aiPersonaName: "",
    greeting: "",
    farewell: "",
    systemPrompt: "",
    phoneCountryCode: "",
    phoneNumber: "",
    phoneLocation: "",
  });

  useEffect(() => {
    fetchAgent(agentId);
    fetchDocsByAgent(agentId);
  }, [agentId, fetchAgent, fetchDocsByAgent]);

  // Refresh documents when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchDocsByAgent(agentId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [agentId, fetchDocsByAgent]);

  const handleDocumentUploaded = () => {
    // Refresh documents list after upload
    fetchDocsByAgent(agentId);
  };

  // Handler for viewing call details
  const handleViewCallDetails = (call: any) => {
    setSelectedSessionId(call.sessionId);
    setSelectedCall(call);
    setShowCallDetail(true);
  };
  
  // Merge transcript data with selected call
  const callWithTranscript = React.useMemo(() => {
    if (!selectedCall) return null;
    
    const transcript = transcriptData?.conversation?.map((msg: any) => ({
      timestamp: msg.timestamp,
      speaker: msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'agent' : 'system',
      text: msg.content || (msg.name ? `Function: ${msg.name}` : ''),
      type: msg.role === 'function' ? 'function_call' : 'speech',
      metadata: msg.role === 'function' ? {
        functionName: msg.name,
        params: msg.params,
        result: msg.result,
      } : undefined,
    })) || [];
    
    return {
      ...selectedCall,
      transcript,
      transcriptLength: transcript.length,
    };
  }, [selectedCall, transcriptData]);

  useEffect(() => {
    if (currentAgent) {
      setFormData({
        name: currentAgent.name,
        language: currentAgent.language,
        voice: currentAgent.voice,
        aiPersonaName: currentAgent.aiPersonaName || "",
        greeting: currentAgent.greeting,
        farewell: currentAgent.farewell,
        systemPrompt: currentAgent.systemPrompt,
        phoneCountryCode: currentAgent.phoneCountryCode || "",
        phoneNumber: currentAgent.phoneNumber || "",
        phoneLocation: currentAgent.phoneLocation || "",
      });
    }
  }, [currentAgent]);

  const handleSave = async () => {
    if (!currentAgent) return;
    setIsSaving(true);
    await updateAgent(currentAgent.id, formData);
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!currentAgent) return;
    
    const confirmed = await confirm.show({
      title: "Delete Agent",
      description: (
        <>
          Are you sure you want to delete <strong>{currentAgent.name}</strong>?
          <br />
          <span className="text-xs text-red-600 mt-2 block font-medium">
            This action cannot be undone.
          </span>
          <span className="text-xs text-muted-foreground mt-1 block">
            All associated calls, knowledge base documents, and analytics will be permanently deleted.
          </span>
        </>
      ),
      confirmText: "Delete Permanently",
      variant: "destructive",
    });
    
    if (confirmed) {
      const success = await deleteAgent(currentAgent.id);
      if (success) {
        router.push("/agents");
      }
    }
  };

  const handleToggleStatus = async () => {
    if (currentAgent) {
      await toggleAgentStatus(currentAgent.id);
    }
  };

  const handleEnhancePrompt = async () => {
    if (!formData.systemPrompt || !currentAgent?.name) return;

    setIsEnhancing(true);
    try {
      // Build tools array from configured integrations (tool names only)
      const tools = integrations
        ?.map((integration) => integration.name || integration.toolId)
        .filter((name): name is string => Boolean(name)) || [];

      const result = await enhancePrompt({
        basePrompt: formData.systemPrompt,
        agentName: currentAgent.name,
        tools: tools.length > 0 ? tools : undefined,
      });

      if (result.success && result.enhancedPrompt) {
        setFormData({ ...formData, systemPrompt: result.enhancedPrompt });
      }
    } catch (error) {
      console.error("Failed to enhance prompt:", error);
    } finally {
      setIsEnhancing(false);
    }
  };

  // Helper to get tool descriptions
  const _getToolDescription = (toolType: string): string => {
    const descriptions: Record<string, string> = {
      "google-sheets": "Export and manage call data in Google Sheets",
      slack: "Send notifications and alerts to Slack channels",
      webhook: "Trigger custom HTTP endpoints with call data",
      email: "Send email notifications and reports",
    };
    return descriptions[toolType] || "External tool integration";
  };

  const _getToolPurpose = (toolType: string): string => {
    const purposes: Record<string, string> = {
      "google-sheets": "Data export and tracking",
      slack: "Team communication and alerts",
      webhook: "Custom automation workflows",
      email: "Email notifications",
    };
    return purposes[toolType] || "Workflow automation";
  };

  if (isLoading || !currentAgent) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {confirm.dialog}
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{currentAgent.name}</h1>
              <div className="relative">
                <div className={cn("w-3 h-3 rounded-full", STATUS_COLORS[currentAgent.status])} />
                {currentAgent.status === "active" && (
                  <div className={cn("absolute inset-0 w-3 h-3 rounded-full animate-pulse-ring", STATUS_COLORS[currentAgent.status])} />
                )}
              </div>
              <Badge variant={currentAgent.status as any} className="capitalize">
                {currentAgent.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {SUPPORTED_LANGUAGES[currentAgent.language]} • Created {formatDate(currentAgent.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleToggleStatus}>
            <Power className="h-4 w-4 mr-2" />
            {currentAgent.status === "active" ? "Deactivate" : "Activate"}
          </Button>
          <Button variant="outline" onClick={() => openOutboundCallModal(currentAgent.id)}>
            <Phone className="h-4 w-4 mr-2" />
            Make Call
          </Button>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{currentAgent.numberOfCalls}</div>
            <p className="text-sm text-muted-foreground">Total Calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{documents.length}</div>
            <p className="text-sm text-muted-foreground">KB Documents</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{currentAgent.status}</div>
            <p className="text-sm text-muted-foreground">Status</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="configuration" className="space-y-4">
        <TabsList>
          <TabsTrigger value="configuration" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="calls" className="flex items-center gap-2">
            <Phone className="h-4 w-4" />
            Call History
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Knowledge Base
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="configuration">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>Core agent settings and identity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Agent Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!isEditing}
                  />
                  <p className="text-xs text-muted-foreground">
                    Dashboard identifier for this agent
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="aiPersonaName">AI Persona Name</Label>
                  <Input
                    id="aiPersonaName"
                    value={formData.aiPersonaName}
                    onChange={(e) => setFormData({ ...formData, aiPersonaName: e.target.value })}
                    disabled={!isEditing}
                    placeholder="e.g., Sarah, Dr. Johnson"
                  />
                  <p className="text-xs text-muted-foreground">
                    The person name the agent introduces itself as during calls
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voice">Voice</Label>
                  <Select
                    value={formData.voice}
                    onValueChange={(v: string) => setFormData({ ...formData, voice: v as AgentVoice })}
                    disabled={!isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Female Voices</div>
                      {FEMALE_VOICES.map((voiceId) => {
                        const voiceInfo = VOICE_CONFIG[voiceId];
                        return (
                          <SelectItem key={voiceId} value={voiceId} className="py-2">
                            <div className="flex items-center justify-between gap-3 w-full">
                              <span className="text-sm font-medium">{voiceInfo.name}</span>
                              <span className="text-[11px] text-muted-foreground">{voiceInfo.description}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-1">Male Voices</div>
                      {MALE_VOICES.map((voiceId) => {
                        const voiceInfo = VOICE_CONFIG[voiceId];
                        return (
                          <SelectItem key={voiceId} value={voiceId} className="py-2">
                            <div className="flex items-center justify-between gap-3 w-full">
                              <span className="text-sm font-medium">{voiceInfo.name}</span>
                              <span className="text-[11px] text-muted-foreground">{voiceInfo.description}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Voice personality for text-to-speech synthesis
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select
                    value={formData.language}
                    onValueChange={(v: string) => setFormData({ ...formData, language: v as AgentLanguage })}
                    disabled={!isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent side="bottom">
                      {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                        <SelectItem key={code} value={code}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Primary language for speech recognition and synthesis
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Phone Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Phone Configuration
                </CardTitle>
                <CardDescription>Phone number settings for outbound calls</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phoneCountryCode">Country Code</Label>
                  <Select
                    value={formData.phoneCountryCode}
                    onValueChange={(value: string) => setFormData({ ...formData, phoneCountryCode: value })}
                    disabled={!isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select country code" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="+1">🇺🇸 +1 (USA/Canada)</SelectItem>
                      <SelectItem value="+91">🇮🇳 +91 (India)</SelectItem>
                      <SelectItem value="+44">🇬🇧 +44 (UK)</SelectItem>
                      <SelectItem value="+86">🇨🇳 +86 (China)</SelectItem>
                      <SelectItem value="+81">🇯🇵 +81 (Japan)</SelectItem>
                      <SelectItem value="+49">🇩🇪 +49 (Germany)</SelectItem>
                      <SelectItem value="+33">🇫🇷 +33 (France)</SelectItem>
                      <SelectItem value="+61">🇦🇺 +61 (Australia)</SelectItem>
                      <SelectItem value="+55">🇧🇷 +55 (Brazil)</SelectItem>
                      <SelectItem value="+52">🇲🇽 +52 (Mexico)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    International dialing code
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number</Label>
                  <Input
                    id="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    disabled={!isEditing}
                    placeholder="e.g., 1234567890"
                  />
                  <p className="text-xs text-muted-foreground">
                    Phone number without country code
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phoneLocation">Location</Label>
                  <Input
                    id="phoneLocation"
                    value={formData.phoneLocation}
                    onChange={(e) => setFormData({ ...formData, phoneLocation: e.target.value })}
                    disabled={!isEditing}
                    placeholder="e.g., New York, Mumbai"
                  />
                  <p className="text-xs text-muted-foreground">
                    Geographic location for the phone number
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Greetings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Greetings
                </CardTitle>
                <CardDescription>Welcome and farewell messages</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="greeting">Greeting Message</Label>
                  <Textarea
                    id="greeting"
                    value={formData.greeting}
                    onChange={(e) => setFormData({ ...formData, greeting: e.target.value })}
                    disabled={!isEditing}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="farewell">Farewell Message</Label>
                  <Textarea
                    id="farewell"
                    value={formData.farewell}
                    onChange={(e) => setFormData({ ...formData, farewell: e.target.value })}
                    disabled={!isEditing}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* System Prompt */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>System Prompt</CardTitle>
                    <CardDescription>
                      Define the agent's behavior, personality, and capabilities
                    </CardDescription>
                  </div>
                  {isEditing && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleEnhancePrompt}
                      disabled={!formData.systemPrompt || !currentAgent?.name || isEnhancing}
                    >
                      {isEnhancing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enhancing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          Enhance Prompt
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={formData.systemPrompt}
                  onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                  disabled={!isEditing}
                  rows={12}
                  className="font-mono text-sm"
                />
                {integrations && integrations.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Configured tools: {integrations.map(i => i.name || i.toolId).join(", ")} - Enhancement will include tool-specific instructions
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Danger Zone */}
          <Card className="mt-6 border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Agent
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Calls Tab */}
        <TabsContent value="calls">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Call History
                {detailedCalls && detailedCalls.length > 0 && (
                  <Badge variant="secondary">{detailedCalls.length} calls</Badge>
                )}
              </CardTitle>
              <CardDescription>
                View call logs and transcriptions for this agent
              </CardDescription>
            </CardHeader>
            <CardContent>
              {callsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : callsError ? (
                <div className="text-center py-12">
                  <Phone className="h-12 w-12 mx-auto text-red-500 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Error loading calls</h3>
                  <p className="text-muted-foreground mb-4">
                    {callsError.message || 'Failed to fetch call history'}
                  </p>
                </div>
              ) : detailedCalls.length === 0 ? (
                <div className="text-center py-12">
                  <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No calls yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Call history will appear here once you start making calls.
                  </p>
                  <Button onClick={() => openOutboundCallModal(agentId)}>
                    <Phone className="h-4 w-4 mr-2" />
                    Make First Call
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {detailedCalls.map((call, index) => (
                    <CallListItem
                      key={call._id || call.sessionId || index}
                      call={{
                        ...call,
                        agentName: currentAgent?.name,
                      }}
                      onClick={() => handleViewCallDetails({
                        ...call,
                        agentName: currentAgent?.name,
                      })}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Call Detail Modal */}
          {callWithTranscript && (
            <CallLogDetail
              call={callWithTranscript}
              isOpen={showCallDetail}
              onClose={() => {
                setShowCallDetail(false);
                setSelectedCall(null);
                setSelectedSessionId(null);
              }}
              isLoadingTranscript={transcriptLoading}
            />
          )}
        </TabsContent>

        {/* Knowledge Base Tab */}
        <TabsContent value="knowledge">
          <KBUploader 
            agentId={agentId} 
            documents={documents} 
            onUploadComplete={handleDocumentUploaded}
          />
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-5 w-5" />
                Tool Integrations
              </CardTitle>
              <CardDescription>
                Connect {currentAgent.name} to external services to automate workflows
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick Stats */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold">{integrations?.length || 0}</div>
                  <p className="text-sm text-muted-foreground">Active Integrations</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold">
                    0
                  </div>
                  <p className="text-sm text-muted-foreground">Total Executions</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold">{availableTools?.length || 0}</div>
                  <p className="text-sm text-muted-foreground">Available Tools</p>
                </div>
              </div>

              {/* Available Tools Preview */}
              <div className="grid gap-3 md:grid-cols-2">
                {availableTools && availableTools.length > 0 ? (
                  availableTools.map((tool) => (
                    <div
                      key={tool._id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => router.push(`/agents/${agentId}/integrations/${tool._id}/configure`)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{tool.icon || '🔗'}</span>
                        <div>
                          <div className="font-medium">{tool.name}</div>
                          <div className="text-xs text-muted-foreground">{tool.description}</div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 text-center py-8 text-muted-foreground">
                    No integration tools available
                  </div>
                )}
              </div>

              {/* Active Integrations List */}
              {integrations && integrations.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Active Integrations</h3>
                    <Badge variant="secondary">{integrations.length}</Badge>
                  </div>
                  {integrations.map((integration) => (
                    <div
                      key={integration._id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div 
                        className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => router.push(`/agents/${agentId}/integrations/${integration.toolId}/configure?integrationId=${integration._id}`)}
                      >
                        <span className="text-xl">
                          {availableTools?.find(t => t._id === integration.toolId)?.icon || '🔗'}
                        </span>
                        <div>
                          <div className="font-medium">{integration.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {integration.enabledTriggers?.join(", ") || "No triggers"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={integration.status === "active" ? "default" : "secondary"}
                        >
                          {integration.status}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/agents/${agentId}/integrations/${integration.toolId}/configure?integrationId=${integration._id}`);
                          }}
                          title="Edit integration"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const confirmed = await confirm.show({
                              title: "Disconnect Integration",
                              description: `Are you sure you want to disconnect ${integration.name}? This will stop all automated data exports.`,
                              confirmText: "Disconnect",
                              variant: "destructive",
                            });
                            
                            if (confirmed) {
                              try {
                                await deleteIntegrationMutation(integration._id);
                                toast({
                                  title: "Integration disconnected",
                                  description: `${integration.name} has been removed successfully`,
                                });
                                // Refresh agent data
                                fetchAgent(agentId);
                              } catch (error: any) {
                                console.error("Failed to delete integration:", error);
                                
                                // If integration not found, it may have been already deleted - refresh data
                                if (error.message?.includes("Integration not found") || error.message?.includes("not found")) {
                                  toast({
                                    title: "Integration already removed",
                                    description: "This integration was already deleted. Refreshing...",
                                  });
                                  fetchAgent(agentId);
                                } else {
                                  toast({
                                    title: "Failed to disconnect",
                                    description: error.message || "An error occurred while removing the integration",
                                    variant: "destructive",
                                  });
                                }
                              }
                            }
                          }}
                          title="Delete integration"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Button - Navigate to global integrations page */}
              <Button
                className="w-full"
                onClick={() => router.push(`/integrations`)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Browse More Integrations
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <div className="space-y-6">
            {/* Agent Stats Summary */}
            <div className="grid gap-4 md:grid-cols-4">
              <StatsCard
                title="Total Calls (30d)"
                value={callVolumeData?.summary?.totalCalls?.toString() || "0"}
                subtitle="in last 30 days"
                icon={Phone}
                color="blue"
                isLoading={!callVolumeData}
              />
              <StatsCard
                title="Completed"
                value={statusDistribution?.statusDistribution?.find((s: any) => s.name === 'completed')?.value?.toString() || "0"}
                subtitle={`${statusDistribution?.statusDistribution?.find((s: any) => s.name === 'completed')?.percentage || 0}% success rate`}
                icon={Phone}
                color="green"
                isLoading={!statusDistribution}
              />
              <StatsCard
                title="Avg Duration"
                value={durationDistribution?.stats?.avgDuration ? `${Math.floor(durationDistribution.stats.avgDuration / 60)}m ${durationDistribution.stats.avgDuration % 60}s` : "0m 0s"}
                subtitle="per call"
                icon={Phone}
                color="purple"
                isLoading={!durationDistribution}
              />
              <StatsCard
                title="Failed Calls"
                value={statusDistribution?.statusDistribution?.find((s: any) => s.name === 'failed')?.value?.toString() || "0"}
                subtitle={`${statusDistribution?.statusDistribution?.find((s: any) => s.name === 'failed')?.percentage || 0}% failure rate`}
                icon={Phone}
                color="yellow"
                isLoading={!statusDistribution}
              />
            </div>

            {/* Charts Row 1 */}
            <div className="grid gap-6 lg:grid-cols-2">
              <CallVolumeChart
                data={callVolumeData?.data || []}
                isLoading={!callVolumeData}
                title="Call Volume (Last 30 Days)"
              />
              <CallStatusPieChart
                data={statusDistribution?.statusDistribution || []}
                totalCalls={statusDistribution?.totalCalls || 0}
                isLoading={!statusDistribution}
                title="Call Status Distribution"
              />
            </div>

            {/* Charts Row 2 */}
            <div className="grid gap-6 lg:grid-cols-2">
              <LatencyTrendsChart
                data={latencyTrends?.data || []}
                summary={latencyTrends?.summary}
                isLoading={!latencyTrends}
                title="Latency Trends (STT/TTS/LLM)"
              />
              <CallDurationHistogram
                data={durationDistribution?.distribution || []}
                stats={durationDistribution?.stats}
                isLoading={!durationDistribution}
                title="Call Duration Distribution"
              />
            </div>

            {/* Charts Row 3 */}
            <div className="grid gap-6 lg:grid-cols-2">
              <FunctionCallsChart
                data={functionCalls?.functions || []}
                totalCalls={functionCalls?.totalCalls || 0}
                uniqueFunctions={functionCalls?.uniqueFunctions || 0}
                isLoading={!functionCalls}
                title="Function Call Analytics"
              />
              <SentimentChart
                data={sentimentData?.distribution || []}
                total={sentimentData?.total || 0}
                sentimentScore={sentimentData?.sentimentScore || 0}
                isLoading={!sentimentData}
                title="Sentiment Analysis"
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </>
  );
}
