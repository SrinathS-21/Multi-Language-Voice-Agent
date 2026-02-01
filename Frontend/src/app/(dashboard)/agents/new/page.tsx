"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bot, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgentStore } from "@/store";
import { AgentLanguage, AgentVoice, SUPPORTED_LANGUAGES, VOICE_CONFIG, FEMALE_VOICES, MALE_VOICES, AgentFormData } from "@/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, title: "Basic Info", description: "Name, language, and persona" },
  { id: 2, title: "Greetings", description: "Welcome and farewell messages" },
  { id: 3, title: "Phone Setup", description: "Configure phone number" },
  { id: 4, title: "System Prompt", description: "Behavior and instructions" },
  { id: 5, title: "Review", description: "Confirm and create" },
];

export default function NewAgentPage() {
  const router = useRouter();
  const { createAgent, isLoading } = useAgentStore();

  const [step, setStep] = useState(1);
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
    if (step < 5) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    try {
      const ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || process.env.DEFAULT_ORGANIZATION_ID || '';
      const agent = await createAgent({
        name: formData.name,
        organizationId: ORG_ID,
        language: formData.language as AgentLanguage,
        voice: formData.voice as AgentVoice,
        aiPersonaName: formData.aiPersonaName,
        systemPrompt: formData.systemPrompt,
        greeting: formData.greeting,
        farewell: formData.farewell,
        phoneCountryCode: formData.phoneCountryCode,
        phoneNumber: formData.phoneNumber,
        phoneLocation: formData.phoneLocation,
      });

      if (agent) {
        // Navigate immediately - store already updated
        router.push(`/agents/${agent.id}`);
      } else {
        // Navigate back to agents list if creation failed
        router.push('/agents');
      }
    } catch (error) {
      console.error("Failed to create agent:", error);
      // Navigate back to agents list on error
      router.push('/agents');
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
      case 5:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Create New Agent</h1>
          <p className="text-muted-foreground">
            Step {step} of 4: {STEPS[step - 1].title}
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <div
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full text-sm font-medium transition-colors",
                step > s.id
                  ? "bg-green-500 text-white"
                  : step === s.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-gray-200 text-gray-500"
              )}
            >
              {step > s.id ? <CheckCircle className="h-5 w-5" /> : s.id}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-1 rounded",
                  step > s.id ? "bg-green-500" : "bg-gray-200"
                )}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step - 1].title}</CardTitle>
          <CardDescription>{STEPS[step - 1].description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Agent Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Customer Support Agent"
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Choose a descriptive name for your agent
                </p>
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
                <Label htmlFor="voice">Voice *</Label>
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
                <Label htmlFor="language">Primary Language *</Label>
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
                <Label htmlFor="greeting">Greeting Message *</Label>
                <Textarea
                  id="greeting"
                  placeholder="Hello! Welcome to our service. How can I assist you today?"
                  value={formData.greeting}
                  onChange={(e) => updateField("greeting", e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  This message will be spoken when the call begins
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="farewell">Farewell Message</Label>
                <Textarea
                  id="farewell"
                  placeholder="Thank you for calling. Have a wonderful day!"
                  value={formData.farewell}
                  onChange={(e) => updateField("farewell", e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  This message will be spoken when the call ends
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
            <div className="space-y-2">
              <Label htmlFor="systemPrompt">System Prompt *</Label>
              <Textarea
                id="systemPrompt"
                placeholder={`You are a helpful voice assistant for [Company Name]. Your role is to:
- Answer customer questions about our products and services
- Help with appointment scheduling
- Provide information about pricing and availability
- Transfer complex queries to human agents when needed

Always be polite, professional, and concise. If you don't know the answer, offer to connect the caller with a human representative.`}
                value={formData.systemPrompt}
                onChange={(e) => updateField("systemPrompt", e.target.value)}
                rows={12}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Define the agent's personality, capabilities, and behavior guidelines
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Name</p>
                  <p className="text-lg font-semibold">{formData.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Language</p>
                  <p>{SUPPORTED_LANGUAGES[formData.language as AgentLanguage]}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Greeting</p>
                  <p className="text-sm italic">"{formData.greeting}"</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Farewell</p>
                  <p className="text-sm italic">
                    {formData.farewell ? `"${formData.farewell}"` : "(Not set)"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">System Prompt</p>
                  <pre className="text-sm bg-white p-3 rounded border mt-1 whitespace-pre-wrap">
                    {formData.systemPrompt}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handleBack} disabled={step === 1}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          {step < 5 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Bot className="mr-2 h-4 w-4" />
              Create Agent
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
