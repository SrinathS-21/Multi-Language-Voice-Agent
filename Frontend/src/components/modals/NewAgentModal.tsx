"use client";

import React, { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useCreateAgent, useEnhancePrompt } from "@/api/hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUIStore } from "@/store";
import { AgentLanguage, SUPPORTED_LANGUAGES, AgentFormData, VOICE_CONFIG, FEMALE_VOICES, MALE_VOICES } from "@/types";
import { useRouter } from "next/navigation";

const STEPS = [
  { id: 1, title: "Basic Info", description: "Name, language, and persona" },
  { id: 2, title: "Greetings", description: "Welcome and farewell messages" },
  { id: 3, title: "Phone Setup", description: "Configure phone number" },
  { id: 4, title: "System Prompt", description: "Agent behavior and instructions" },
];

export function NewAgentModal() {
  const router = useRouter();
  const { isNewAgentModalOpen, closeNewAgentModal } = useUIStore();
  const { mutate: createAgentMutation, isLoading } = useCreateAgent();
  const { mutate: enhancePromptMutation } = useEnhancePrompt();

  const [step, setStep] = useState(1);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [formData, setFormData] = useState<AgentFormData>({
    name: "",
    language: "en-IN",
    voice: "anushka",
    aiPersonaName: "",
    systemPrompt: "",
    greeting: "",
    farewell: "",
    phoneCountryCode: "+1",
    phoneNumber: "",
    phoneLocation: "",
  });

  const updateField = (field: keyof AgentFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    try {
      const ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || process.env.DEFAULT_ORGANIZATION_ID || '';
      
      // Build config object with voice settings
      const config = {
        language: formData.language,
        voice: formData.voice,
      };
      
      const agent = await createAgentMutation({
        name: formData.name,
        tenant_id: ORG_ID,
        language: formData.language as AgentLanguage,
        voice: formData.voice,
        config: config,
        aiPersonaName: formData.aiPersonaName,
        systemPrompt: formData.systemPrompt,
        greeting: formData.greeting,
        farewell: formData.farewell,
        phoneCountryCode: formData.phoneCountryCode,
        phoneNumber: formData.phoneNumber,
        phoneLocation: formData.phoneLocation,
      });

      // Reset form and close modal immediately
      setStep(1);
      setFormData({
        name: "",
        language: "en-IN",
        voice: "anushka",
        aiPersonaName: "",
        systemPrompt: "",
        greeting: "",
        farewell: "",
        phoneCountryCode: "+1",
        phoneNumber: "",
        phoneLocation: "",
      });
      closeNewAgentModal();

      if (agent) {
        // Navigate to agents page (agent.agent.id from API response)
        router.push(`/agents/${agent.agent?.id || ''}`);
      }
    } catch (error) {
      console.error("Failed to create agent:", error);
      // Close modal immediately even on error
      closeNewAgentModal();
      setStep(1);
    }
  };

  const handleEnhancePrompt = async () => {
    if (!formData.systemPrompt.trim() || !formData.name.trim()) {
      alert("Please provide at least a name and a basic system prompt to enhance.");
      return;
    }

    setIsEnhancing(true);
    try {
      const result = await enhancePromptMutation({
        basePrompt: formData.systemPrompt,
        agentName: formData.name,
        agentRole: formData.aiPersonaName || undefined,
        businessName: undefined,
        tools: undefined,
        includeSections: undefined,
      });

      if (result.success && result.enhancedPrompt) {
        updateField("systemPrompt", result.enhancedPrompt);
      } else {
        alert(result.error || "Failed to enhance prompt");
      }
    } catch (error) {
      console.error("Prompt enhancement error:", error);
      alert("An error occurred while enhancing the prompt");
    } finally {
      setIsEnhancing(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return formData.name.trim().length > 0;
      case 2:
        return formData.greeting.trim().length > 0;
      case 3:
        return true; // Phone config is optional
      case 4:
        return formData.systemPrompt.trim().length > 0;
      default:
        return false;
    }
  };

  return (
    <Dialog open={isNewAgentModalOpen} onOpenChange={closeNewAgentModal}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create New Agent</DialogTitle>
          <DialogDescription>
            Step {step} of 3: {STEPS[step - 1].title}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicators */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  step >= s.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {s.id}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 ${
                    step > s.id ? "bg-primary" : "bg-gray-200"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step Content */}
        <div className="space-y-4">
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Agent Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Customer Support Agent"
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aiPersonaName">AI Persona Name</Label>
                <Input
                  id="aiPersonaName"
                  placeholder="e.g., Sarah, Dr. Johnson, Mike"
                  value={formData.aiPersonaName}
                  onChange={(e) => updateField("aiPersonaName", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The person name your agent will introduce itself as during calls
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="voice">Voice</Label>
                <Select
                  value={formData.voice}
                  onValueChange={(value: string) => updateField("voice", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select voice" />
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
                  Choose the voice personality for your agent
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select
                  value={formData.language}
                  onValueChange={(value: string) => updateField("language", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent side="bottom">
                    {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                      <SelectItem key={code} value={code}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="greeting">Greeting Message</Label>
                <Textarea
                  id="greeting"
                  placeholder="Hello! How can I assist you today?"
                  value={formData.greeting}
                  onChange={(e) => updateField("greeting", e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  This message will be spoken when the call begins.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="farewell">Farewell Message</Label>
                <Textarea
                  id="farewell"
                  placeholder="Thank you for calling. Have a great day!"
                  value={formData.farewell}
                  onChange={(e) => updateField("farewell", e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  This message will be spoken when the call ends.
                </p>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="phoneCountryCode">Country Code</Label>
                <Select
                  value={formData.phoneCountryCode}
                  onValueChange={(value: string) => updateField("phoneCountryCode", value)}
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  placeholder="5551234567"
                  value={formData.phoneNumber}
                  onChange={(e) => updateField("phoneNumber", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Phone number without country code
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneLocation">Location</Label>
                <Input
                  id="phoneLocation"
                  placeholder="New York, USA"
                  value={formData.phoneLocation}
                  onChange={(e) => updateField("phoneLocation", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Geographic location for this phone number
                </p>
              </div>
            </>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="systemPrompt">System Prompt</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleEnhancePrompt}
                    disabled={isEnhancing || !formData.systemPrompt.trim() || !formData.name.trim()}
                    className="gap-2"
                  >
                    {isEnhancing ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Enhancing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3 w-3" />
                        Enhance Prompt
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  id="systemPrompt"
                  placeholder="You are a helpful assistant that..."
                  value={formData.systemPrompt}
                  onChange={(e) => updateField("systemPrompt", e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Define the agent's personality and capabilities. Click "Enhance Prompt" to automatically add tool usage instructions and best practices.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={closeNewAgentModal}>
              Cancel
            </Button>
            {step < 4 ? (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!canProceed() || isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Agent
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
