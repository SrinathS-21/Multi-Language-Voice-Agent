/**
 * Integration Example
 *
 * This file demonstrates how to integrate the real backend API
 * with the Frontend components. Use this as a reference when
 * replacing the mock API with real endpoints.
 */

'use client';

import React, { useEffect, useState } from 'react';
import {
  useAgents,
  useAgent,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useCallTranscript,
  useInitiateOutboundCall,
  useDocuments,
  useUploadDocument,
  useDeleteDocument,
  useDashboard,
  useHealthCheck,
} from '@/api/hooks';
import { ApiError } from '@/api/client';

// =============================================================================
// Example 1: Dashboard with Real Data
// =============================================================================

export function DashboardExample() {
  const { agents, calls: _calls, stats, isLoading, error, refetch } = useDashboard();

  if (isLoading) {
    return <div>Loading dashboard...</div>;
  }

  if (error) {
    return (
      <div className="text-red-500">
        Error loading dashboard: {error.message}
        <button onClick={refetch} className="ml-2 text-blue-500">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded shadow">
          <h2>Total Agents</h2>
          <p className="text-3xl font-bold">{agents.length}</p>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <h2>Total Calls Today</h2>
          <p className="text-3xl font-bold">{stats?.total_calls || 0}</p>
        </div>
        <div className="p-4 bg-white rounded shadow">
          <h2>Avg Duration</h2>
          <p className="text-3xl font-bold">
            {stats?.avg_duration_seconds || 0}s
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Example 2: Agent List with CRUD Operations
// =============================================================================

export function AgentListExample() {
  const { data, isLoading, error, refetch } = useAgents();
  const createAgent = useCreateAgent();
  const deleteAgent = useDeleteAgent();

  const handleCreate = async () => {
    try {
      await createAgent.mutate({
        name: 'New Agent',
        language: 'en',
        aiPersonaName: 'Assistant',
        systemPrompt: 'You are a helpful voice assistant.',
        greeting: 'Hello! How can I help you today?',
        farewell: 'Thank you for calling. Goodbye!',
      });
      // Refetch list after creation
      await refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        console.error('Create failed:', err.message);
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAgent.mutate(id);
      await refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        console.error('Delete failed:', err.message);
      }
    }
  };

  if (isLoading) return <div>Loading agents...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>Agents</h1>
      <button
        onClick={handleCreate}
        disabled={createAgent.isLoading}
        className="mb-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        {createAgent.isLoading ? 'Creating...' : 'Create Agent'}
      </button>

      <ul className="space-y-2">
        {data?.agents.map((agent) => (
          <li key={agent.id} className="flex items-center justify-between p-4 bg-white rounded shadow">
            <div>
              <h3 className="font-bold">{agent.name}</h3>
              <p className="text-gray-500">{agent.role}</p>
            </div>
            <button
              onClick={() => handleDelete(agent.id)}
              disabled={deleteAgent.isLoading}
              className="px-3 py-1 bg-red-500 text-white rounded"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// Example 3: Agent Detail with Edit Form
// =============================================================================

export function AgentDetailExample({ agentId }: { agentId: string }) {
  const { data: agent, isLoading, error, refetch } = useAgent(agentId);
  const updateAgent = useUpdateAgent();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setSystemPrompt(agent.system_prompt);
    }
  }, [agent]);

  const handleSave = async () => {
    try {
      await updateAgent.mutate({
        id: agentId,
        data: { name, system_prompt: systemPrompt },
      });
      setIsEditing(false);
      await refetch();
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  if (isLoading) return <div>Loading agent...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!agent) return <div>Agent not found</div>;

  return (
    <div className="p-4 bg-white rounded shadow">
      {isEditing ? (
        <div className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border rounded"
          />
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full p-2 border rounded h-32"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={updateAgent.isLoading}
              className="px-4 py-2 bg-green-500 text-white rounded"
            >
              {updateAgent.isLoading ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-gray-300 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-bold">{agent.name}</h1>
          <p className="text-gray-500">{agent.role}</p>
          <p className="mt-4">{agent.system_prompt}</p>
          <button
            onClick={() => setIsEditing(true)}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Example 4: Call Transcript
// =============================================================================

export function CallTranscriptExample({ sessionId }: { sessionId: string }) {
  const { data, isLoading, error } = useCallTranscript(sessionId);

  if (isLoading) return <div>Loading transcript...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!data) return <div>No transcript found</div>;

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Call Transcript</h2>
      <div className="space-y-3">
        {data.conversation.map((message, index) => (
          <div
            key={index}
            className={`p-3 rounded ${
              message.role === 'user'
                ? 'bg-blue-100 ml-8'
                : message.role === 'assistant'
                ? 'bg-gray-100 mr-8'
                : 'bg-yellow-100'
            }`}
          >
            <div className="text-xs text-gray-500 mb-1">
              {message.role.toUpperCase()}
              {message.name && ` (${message.name})`}
            </div>
            <div>{message.content || JSON.stringify(message.result)}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-gray-500">
        Total messages: {data.total_messages}
      </p>
    </div>
  );
}

// =============================================================================
// Example 5: Outbound Call
// =============================================================================

export function OutboundCallExample({ agentId }: { agentId: string }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const initiateCall = useInitiateOutboundCall();

  const handleCall = async () => {
    try {
      const result = await initiateCall.mutate({
        organizationId: 'default',
        agentId,
        phoneNumber,
      });

      if (result.success) {
        alert(`Call initiated! Call ID: ${result.callId}`);
      } else {
        alert(`Call failed: ${result.error}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        alert(`Error: ${err.message}`);
      }
    }
  };

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Make Outbound Call</h2>
      <div className="flex gap-2">
        <input
          type="tel"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+14155551234"
          className="flex-1 p-2 border rounded"
        />
        <button
          onClick={handleCall}
          disabled={initiateCall.isLoading || !phoneNumber}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
        >
          {initiateCall.isLoading ? 'Calling...' : 'Call'}
        </button>
      </div>
      {initiateCall.error && (
        <p className="mt-2 text-red-500">{initiateCall.error.message}</p>
      )}
    </div>
  );
}

// =============================================================================
// Example 6: Document Upload
// =============================================================================

export function DocumentUploadExample({ agentId }: { agentId: string }) {
  const { data: documents, refetch } = useDocuments(agentId);
  const uploadDocument = useUploadDocument();
  const deleteDocument = useDeleteDocument();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadDocument.mutate({ agentId, file });
      await refetch();
    } catch (err) {
      console.error('Upload failed:', err);
    }
  };

  const handleDelete = async (documentId: string) => {
    try {
      await deleteDocument.mutate(documentId);
      await refetch();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Knowledge Base</h2>

      <div className="mb-4">
        <input
          type="file"
          onChange={handleFileChange}
          accept=".txt,.pdf,.doc,.docx,.md"
          disabled={uploadDocument.isLoading}
        />
        {uploadDocument.isLoading && <span className="ml-2">Uploading...</span>}
      </div>

      <ul className="space-y-2">
        {documents?.documents.map((doc) => (
          <li key={doc.documentId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <div>
              <span className="font-medium">{doc.fileName}</span>
              <span className="ml-2 text-gray-500 text-sm">
                ({doc.chunkCount} chunks)
              </span>
            </div>
            <button
              onClick={() => handleDelete(doc.documentId)}
              className="text-red-500 hover:text-red-700"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// Example 7: Health Check with Connection Status
// =============================================================================

export function ConnectionStatusExample() {
  const { data, isLoading, error, refetch } = useHealthCheck();

  const getStatusColor = () => {
    if (isLoading) return 'bg-yellow-500';
    if (error) return 'bg-red-500';
    if (data?.status === 'healthy') return 'bg-green-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
      <span className="text-sm text-gray-600">
        {isLoading ? 'Connecting...' : error ? 'Disconnected' : 'Connected'}
      </span>
      {error && (
        <button onClick={refetch} className="text-xs text-blue-500 underline">
          Retry
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Example 8: Error Boundary Pattern
// =============================================================================

export function withErrorHandling<T extends object>(
  Component: React.ComponentType<T>
) {
  return function WrappedComponent(props: T) {
    const [error, setError] = useState<Error | null>(null);

    if (error) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <h3 className="text-red-700 font-bold">Something went wrong</h3>
          <p className="text-red-600">{error.message}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-blue-500 underline"
          >
            Try again
          </button>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
