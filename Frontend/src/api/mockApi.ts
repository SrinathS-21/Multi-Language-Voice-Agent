// ============================================
// MOCK API - Agent Management
// ============================================

import {
  Agent,
  Call,
  KnowledgeBaseDoc,
  CreateAgentPayload,
  UpdateAgentPayload,
  OutboundCallPayload,
  KBUploadPayload,
  ApiResponse,
  DashboardStats,
  AgentStatus,
} from "@/types";

// Simulated delay for realistic API behavior
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================
// MOCK DATA STORE
// ============================================

const mockAgents: Agent[] = [
  {
    id: "agent-1",
    name: "Customer Support Assistant",
    language: "en-IN",
    voice: "anushka",
    status: "active",
    systemPrompt:
      "You are a helpful customer support assistant. Help customers with their inquiries and provide information about services.",
    greeting: "Hello! How can I assist you today?",
    farewell: "Thank you for calling. Have a great day!",
    numberOfCalls: 156,
    createdAt: "2025-01-15T10:00:00Z",
    updatedAt: "2025-01-24T08:30:00Z",
    knowledgeBaseIds: ["kb-1", "kb-2"],
  },
  {
    id: "agent-2",
    name: "Sales Assistant",
    language: "hi-IN",
    voice: "vidya",
    status: "active",
    systemPrompt:
      "You are a sales assistant. Help customers understand products and services.",
    greeting: "नमस्ते! आज मैं आपकी कैसे मदद कर सकता हूं?",
    farewell: "धन्यवाद! अपना ख्याल रखें।",
    numberOfCalls: 89,
    createdAt: "2025-01-18T14:00:00Z",
    updatedAt: "2025-01-23T16:45:00Z",
    knowledgeBaseIds: ["kb-3"],
  },
  {
    id: "agent-3",
    name: "General Inquiry Bot",
    language: "en-IN",
    voice: "abhilash",
    status: "inactive",
    systemPrompt: "Handle general inquiries about services and business hours.",
    greeting: "Hi there! I'm here to help with any general questions.",
    farewell: "Goodbye! Feel free to call back anytime.",
    numberOfCalls: 42,
    createdAt: "2025-01-20T09:00:00Z",
    updatedAt: "2025-01-22T11:00:00Z",
    knowledgeBaseIds: [],
  },
];

const mockCalls: Call[] = [
  {
    id: "call-1",
    agentId: "agent-1",
    fromNumber: "+919876543210",
    toNumber: "+911234567890",
    status: "completed",
    duration: 245,
    timestamp: "2025-01-24T09:30:00Z",
    endedAt: "2025-01-24T09:34:05Z",
    transcript: [
      { role: "agent", content: "Hello! How can I help you today?", timestamp: "2025-01-24T09:30:05Z" },
      { role: "user", content: "I have a question about your services.", timestamp: "2025-01-24T09:30:12Z" },
      { role: "agent", content: "I'd be happy to help. What would you like to know?", timestamp: "2025-01-24T09:30:18Z" },
    ],
  },
  {
    id: "call-2",
    agentId: "agent-1",
    fromNumber: "+919876543210",
    toNumber: "+911234567891",
    status: "in-progress",
    timestamp: "2025-01-24T10:15:00Z",
  },
  {
    id: "call-3",
    agentId: "agent-2",
    fromNumber: "+919876543211",
    toNumber: "+911234567892",
    status: "completed",
    duration: 180,
    timestamp: "2025-01-24T08:00:00Z",
    endedAt: "2025-01-24T08:03:00Z",
  },
  {
    id: "call-4",
    agentId: "agent-1",
    fromNumber: "+919876543210",
    toNumber: "+911234567893",
    status: "failed",
    timestamp: "2025-01-24T07:45:00Z",
  },
];

const mockKnowledgeBase: KnowledgeBaseDoc[] = [
  {
    id: "kb-1",
    agentId: "agent-1",
    title: "Services Guide",
    type: "pdf",
    size: 2456789,
    uploadedAt: "2025-01-15T11:00:00Z",
    status: "completed",
    chunksCount: 45,
  },
  {
    id: "kb-2",
    agentId: "agent-1",
    title: "FAQ Document",
    type: "txt",
    size: 45678,
    uploadedAt: "2025-01-16T14:30:00Z",
    status: "completed",
    chunksCount: 12,
  },
  {
    id: "kb-3",
    agentId: "agent-2",
    title: "Product Knowledge Base",
    type: "docx",
    size: 1234567,
    uploadedAt: "2025-01-18T15:00:00Z",
    status: "completed",
    chunksCount: 78,
  },
];

// ============================================
// AGENT API
// ============================================

export const agentApi = {
  // Get all agents
  async getAll(): Promise<ApiResponse<Agent[]>> {
    await delay(300);
    return { success: true, data: [...mockAgents] };
  },

  // Get single agent
  async getById(id: string): Promise<ApiResponse<Agent>> {
    await delay(200);
    const agent = mockAgents.find((a) => a.id === id);
    if (!agent) {
      return { success: false, error: "Agent not found" };
    }
    return { success: true, data: { ...agent } };
  },

  // Create agent
  async create(payload: CreateAgentPayload): Promise<ApiResponse<Agent>> {
    await delay(500);
    const newAgent: Agent = {
      id: `agent-${Date.now()}`,
      name: payload.name,
      organizationId: payload.organizationId,
      language: payload.language,
      voice: payload.voice,
      systemPrompt: payload.systemPrompt,
      aiPersonaName: payload.aiPersonaName,
      greeting: payload.greeting,
      farewell: payload.farewell,
      phoneCountryCode: payload.phoneCountryCode,
      phoneNumber: payload.phoneNumber,
      phoneLocation: payload.phoneLocation,
      enableContextualEnrichment: payload.enableContextualEnrichment,
      status: "inactive",
      numberOfCalls: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      knowledgeBaseIds: [],
    };
    mockAgents.push(newAgent);
    return { success: true, data: newAgent, message: "Agent created successfully" };
  },

  // Update agent
  async update(id: string, payload: UpdateAgentPayload): Promise<ApiResponse<Agent>> {
    await delay(400);
    const index = mockAgents.findIndex((a) => a.id === id);
    if (index === -1) {
      return { success: false, error: "Agent not found" };
    }
    mockAgents[index] = {
      ...mockAgents[index],
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    return { success: true, data: mockAgents[index], message: "Agent updated successfully" };
  },

  // Delete agent
  async delete(id: string): Promise<ApiResponse<void>> {
    await delay(300);
    const index = mockAgents.findIndex((a) => a.id === id);
    if (index === -1) {
      return { success: false, error: "Agent not found" };
    }
    mockAgents.splice(index, 1);
    return { success: true, message: "Agent deleted successfully" };
  },

  // Toggle agent status
  async toggleStatus(id: string): Promise<ApiResponse<Agent>> {
    await delay(200);
    const agent = mockAgents.find((a) => a.id === id);
    if (!agent) {
      return { success: false, error: "Agent not found" };
    }
    const newStatus: AgentStatus = agent.status === "active" ? "inactive" : "active";
    return this.update(id, { status: newStatus });
  },
};

// ============================================
// CALL API
// ============================================

export const callApi = {
  // Get calls for agent
  async getByAgentId(agentId: string): Promise<ApiResponse<Call[]>> {
    await delay(300);
    const calls = mockCalls.filter((c) => c.agentId === agentId);
    return { success: true, data: calls };
  },

  // Get all calls
  async getAll(): Promise<ApiResponse<Call[]>> {
    await delay(300);
    return { success: true, data: [...mockCalls] };
  },

  // Get single call
  async getById(id: string): Promise<ApiResponse<Call>> {
    await delay(200);
    const call = mockCalls.find((c) => c.id === id);
    if (!call) {
      return { success: false, error: "Call not found" };
    }
    return { success: true, data: { ...call } };
  },

  // Initiate outbound call
  async initiateOutbound(payload: OutboundCallPayload): Promise<ApiResponse<Call>> {
    await delay(800);
    const newCall: Call = {
      id: `call-${Date.now()}`,
      ...payload,
      status: "ringing",
      timestamp: new Date().toISOString(),
    };
    mockCalls.unshift(newCall);

    // Simulate call progression
    setTimeout(() => {
      const call = mockCalls.find((c) => c.id === newCall.id);
      if (call) {
        call.status = "in-progress";
      }
    }, 3000);

    return { success: true, data: newCall, message: "Call initiated" };
  },

  // End call
  async endCall(id: string): Promise<ApiResponse<Call>> {
    await delay(300);
    const call = mockCalls.find((c) => c.id === id);
    if (!call) {
      return { success: false, error: "Call not found" };
    }
    call.status = "completed";
    call.endedAt = new Date().toISOString();
    call.duration = Math.floor((new Date(call.endedAt).getTime() - new Date(call.timestamp).getTime()) / 1000);
    return { success: true, data: call };
  },
};

// ============================================
// KNOWLEDGE BASE API
// ============================================

export const knowledgeBaseApi = {
  // Get docs for agent
  async getByAgentId(agentId: string): Promise<ApiResponse<KnowledgeBaseDoc[]>> {
    await delay(300);
    const docs = mockKnowledgeBase.filter((d) => d.agentId === agentId);
    return { success: true, data: docs };
  },

  // Get single doc
  async getById(id: string): Promise<ApiResponse<KnowledgeBaseDoc>> {
    await delay(200);
    const doc = mockKnowledgeBase.find((d) => d.id === id);
    if (!doc) {
      return { success: false, error: "Document not found" };
    }
    return { success: true, data: { ...doc } };
  },

  // Upload document with progress callback
  async upload(
    payload: KBUploadPayload,
    onProgress?: (progress: number, stage?: string, message?: string) => void
  ): Promise<ApiResponse<KnowledgeBaseDoc>> {
    const { agentId, file, title } = payload;

    // Simulate upload progress with stages
    const stages = [
      { progress: 10, stage: 'uploading', message: 'Uploading file...' },
      { progress: 30, stage: 'parsing', message: 'Parsing document...' },
      { progress: 60, stage: 'chunking', message: 'Creating chunks...' },
      { progress: 100, stage: 'completed', message: 'Upload complete!' },
    ];

    for (const { progress, stage, message } of stages) {
      await delay(500);
      onProgress?.(progress, stage, message);
    }

    const fileType = file.name.split(".").pop()?.toLowerCase() || "txt";
    const newDoc: KnowledgeBaseDoc = {
      id: `kb-${Date.now()}`,
      agentId,
      title: title || file.name,
      type: fileType as KnowledgeBaseDoc["type"],
      size: file.size,
      uploadedAt: new Date().toISOString(),
      status: "completed",
      chunksCount: Math.floor(Math.random() * 50) + 10,
    };

    mockKnowledgeBase.push(newDoc);

    // Update agent's knowledgeBaseIds
    const agent = mockAgents.find((a) => a.id === agentId);
    if (agent) {
      agent.knowledgeBaseIds.push(newDoc.id);
    }

    return { success: true, data: newDoc, message: "Document uploaded successfully" };
  },

  // Delete document
  async delete(id: string): Promise<ApiResponse<void>> {
    await delay(300);
    const index = mockKnowledgeBase.findIndex((d) => d.id === id);
    if (index === -1) {
      return { success: false, error: "Document not found" };
    }

    const doc = mockKnowledgeBase[index];
    // Remove from agent's knowledgeBaseIds
    const agent = mockAgents.find((a) => a.id === doc.agentId);
    if (agent) {
      agent.knowledgeBaseIds = agent.knowledgeBaseIds.filter((kbId) => kbId !== id);
    }

    mockKnowledgeBase.splice(index, 1);
    return { success: true, message: "Document deleted successfully" };
  },
};

// ============================================
// DASHBOARD API
// ============================================

export const dashboardApi = {
  async getStats(): Promise<ApiResponse<DashboardStats>> {
    await delay(400);
    const stats: DashboardStats = {
      totalAgents: mockAgents.length,
      activeAgents: mockAgents.filter((a) => a.status === "active").length,
      totalCalls: mockCalls.length,
      callsToday: mockCalls.filter((c) => {
        const today = new Date().toDateString();
        return new Date(c.timestamp).toDateString() === today;
      }).length,
      averageCallDuration: 185,
      successRate: 87.5,
    };
    return { success: true, data: stats };
  },
};
