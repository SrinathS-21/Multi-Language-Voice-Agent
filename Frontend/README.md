# Voice Agent Dashboard

A production-ready frontend UI for managing and using voice agents, built with Next.js 14, React, TypeScript, Tailwind CSS, and Shadcn UI.

## 🚀 Features

### MVP (Phase 1)
- **Dashboard** - Overview cards displaying agents with status, calls stats, and quick actions
- **Agent Management** - Create, edit, view, and delete voice agents
- **Outbound Calls** - Select agent, enter phone numbers, initiate calls with live status
- **Knowledge Base** - Upload documents with progress bar, manage agent KB content
- **Call History** - View all calls with metadata and transcripts

### Phase 2 Enhancements
- Real-time call status updates via WebSocket
- Advanced analytics and reporting
- Bulk document upload
- Agent templates and cloning
- Dark mode support
- Multi-language UI

## 📁 Project Structure

```
Frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── (dashboard)/        # Dashboard layout group
│   │   │   ├── dashboard/      # Main dashboard
│   │   │   ├── agents/         # Agent list & details
│   │   │   │   ├── [id]/       # Agent detail page
│   │   │   │   └── new/        # Create new agent
│   │   │   ├── calls/          # Call history
│   │   │   ├── kb/             # Knowledge base
│   │   │   │   └── upload/     # KB upload page
│   │   │   └── settings/       # User settings
│   │   ├── globals.css         # Global styles
│   │   └── layout.tsx          # Root layout
│   │
│   ├── components/
│   │   ├── ui/                 # Shadcn UI components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   └── ...
│   │   ├── agents/             # Agent-specific components
│   │   │   └── AgentCard.tsx
│   │   ├── calls/              # Call-related components
│   │   │   └── CallList.tsx
│   │   ├── knowledge/          # KB components
│   │   │   └── KBUploader.tsx
│   │   ├── layout/             # Layout components
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   └── modals/             # Modal dialogs
│   │       ├── NewAgentModal.tsx
│   │       └── OutboundCallModal.tsx
│   │
│   ├── api/                    # API layer
│   │   └── mockApi.ts          # Mock API for MVP
│   │
│   ├── store/                  # State management
│   │   └── index.ts            # Zustand stores
│   │
│   ├── types/                  # TypeScript types
│   │   └── index.ts
│   │
│   └── lib/                    # Utilities
│       └── utils.ts
│
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

## 🛠 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Shadcn UI / Radix UI
- **State Management**: Zustand
- **Icons**: Lucide React

## 📦 Installation

```bash
cd Frontend
npm install
```

## 🏃 Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔌 API Integration

The MVP uses a mock API layer (`src/api/mockApi.ts`). To connect to your backend:

1. Create a new API client in `src/api/client.ts`
2. Update the store actions to use real API calls
3. Add environment variables for API endpoints

### Expected API Endpoints

```typescript
// Agents
GET    /api/agents           // List all agents
GET    /api/agents/:id       // Get agent details
POST   /api/agents           // Create agent
PUT    /api/agents/:id       // Update agent
DELETE /api/agents/:id       // Delete agent

// Calls
GET    /api/calls            // List all calls
GET    /api/calls/:id        // Get call details
POST   /api/calls/outbound   // Initiate outbound call
POST   /api/calls/:id/end    // End call

// Knowledge Base
GET    /api/agents/:id/kb    // Get agent's KB documents
POST   /api/agents/:id/kb    // Upload document
DELETE /api/kb/:id           // Delete document
```

## 📊 Data Models

### Agent
```typescript
interface Agent {
  id: string;
  name: string;
  language: AgentLanguage;
  status: "active" | "inactive" | "busy" | "error";
  systemPrompt: string;
  greeting: string;
  farewell: string;
  numberOfCalls: number;
  callQuota: number;
  createdAt: string;
  updatedAt: string;
  knowledgeBaseIds: string[];
}
```

### Call
```typescript
interface Call {
  id: string;
  agentId: string;
  fromNumber: string;
  toNumber: string;
  status: CallStatus;
  duration?: number;
  timestamp: string;
  endedAt?: string;
  transcript?: TranscriptEntry[];
}
```

### KnowledgeBaseDoc
```typescript
interface KnowledgeBaseDoc {
  id: string;
  agentId: string;
  title: string;
  type: "pdf" | "txt" | "docx" | "md" | "json";
  size: number;
  uploadedAt: string;
  status: "pending" | "uploading" | "processing" | "completed" | "failed";
  chunksCount?: number;
}
```

## 🎨 UI Components

### Core Components
- `AgentCard` - Displays agent info with status indicator
- `CallList` - Renders call history with metadata
- `KBUploader` - Drag-and-drop document uploader with progress
- `NewAgentModal` - Multi-step agent creation wizard
- `OutboundCallModal` - Call initiation form with live status

### UI Primitives (Shadcn)
- Button, Input, Textarea, Label
- Card, Dialog, Select, Tabs
- Progress, Badge, Skeleton

## 🔒 Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

## 📝 Implementation Plan

### Phase 1: MVP (Current)
- [x] Project scaffold and configuration
- [x] Type definitions and data models
- [x] Mock API layer
- [x] Zustand state management
- [x] Dashboard with stats and agent cards
- [x] Agent list with filtering
- [x] Agent detail/edit page
- [x] New agent creation wizard
- [x] Outbound call modal with live status
- [x] Knowledge base upload with progress
- [x] Call history page
- [x] Settings page

### Phase 2: Enhancements
- [ ] Real backend API integration
- [ ] WebSocket for real-time updates
- [ ] Advanced analytics dashboard
- [ ] Agent performance metrics
- [ ] Bulk operations (delete, activate)
- [ ] Export call transcripts
- [ ] Dark mode theme
- [ ] Internationalization (i18n)

### Phase 3: Advanced Features
- [ ] Agent templates marketplace
- [ ] A/B testing for prompts
- [ ] Voice recording playback
- [ ] Custom reporting builder
- [ ] Team collaboration features
- [ ] Webhooks configuration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details
