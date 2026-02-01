/**
 * 🎨 Document Upload Workflow - Visual Demo
 * 
 * This file demonstrates all the features of the new non-blocking upload system.
 * Use this as a reference for integration and testing.
 */

import { KBUploader } from '@/components/knowledge/KBUploader';
import { useKBStore } from '@/store';
import { KnowledgeBaseDoc } from '@/types';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ============================================================================
// EXAMPLE 1: Basic Usage
// ============================================================================

export function BasicUploadExample() {
  const { documents } = useKBStore();
  const agentId = 'agent-123';

  return (
    <KBUploader
      agentId={agentId}
      documents={documents}
      onUploadComplete={(doc) => {
        console.log('✅ Upload complete:', doc.title);
        // Document is already in the list, auto-refreshing!
      }}
    />
  );
}

// ============================================================================
// EXAMPLE 2: With Statistics Dashboard
// ============================================================================

export function UploadWithStats() {
  const { documents } = useKBStore();
  const agentId = 'agent-123';

  const stats = {
    total: documents.length,
    processing: documents.filter(d => d.status === 'processing' || d.status === 'uploading').length,
    preview: documents.filter(d => d.status === 'preview').length,
    completed: documents.filter(d => d.status === 'completed').length,
    failed: documents.filter(d => d.status === 'failed').length,
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard label="Total" value={stats.total} color="gray" />
        <StatCard label="Processing" value={stats.processing} color="blue" />
        <StatCard label="Need Review" value={stats.preview} color="amber" />
        <StatCard label="Completed" value={stats.completed} color="green" />
        <StatCard label="Failed" value={stats.failed} color="red" />
      </div>

      {/* Uploader */}
      <KBUploader
        agentId={agentId}
        documents={documents}
      />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-center">
          <div className={`text-3xl font-bold ${colors[color as keyof typeof colors]}`}>
            {value}
          </div>
          <div className="text-sm text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// EXAMPLE 3: Programmatic Upload
// ============================================================================

export function ProgrammaticUploadExample() {
  const { uploadDocument } = useKBStore();
  const [uploading, setUploading] = useState(false);

  const handleProgrammaticUpload = async () => {
    setUploading(true);

    // Create a File object (in real app, this comes from user input)
    const blob = new Blob(['Sample document content'], { type: 'text/plain' });
    const file = new File([blob], 'sample.txt', { type: 'text/plain' });

    // Upload
    const result = await uploadDocument({
      agentId: 'agent-123',
      file,
      title: 'Programmatic Upload',
    });

    if (result) {
      console.log('✅ Document uploaded:', result.id);
      console.log('Status:', result.status); // Will be "processing"
      // Auto-refresh will handle status updates!
    }

    setUploading(false);
  };

  return (
    <button
      onClick={handleProgrammaticUpload}
      disabled={uploading}
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {uploading ? 'Uploading...' : 'Upload Sample Document'}
    </button>
  );
}

// ============================================================================
// EXAMPLE 4: Custom Event Handlers
// ============================================================================

export function CustomHandlersExample() {
  const { documents } = useKBStore();
  const [notifications, setNotifications] = useState<string[]>([]);

  const addNotification = (message: string) => {
    setNotifications(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <KBUploader
          agentId="agent-123"
          documents={documents}
          onUploadComplete={(doc) => {
            addNotification(`✅ ${doc.title} uploaded (${doc.status})`);
          }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {notifications.map((msg, i) => (
              <div key={i} className="text-xs text-muted-foreground font-mono">
                {msg}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// EXAMPLE 5: Mock Data for Testing
// ============================================================================

export const MOCK_DOCUMENTS: KnowledgeBaseDoc[] = [
  {
    id: 'session-1',
    agentId: 'agent-123',
    title: 'Processing Document.pdf',
    type: 'pdf',
    size: 2458624,
    status: 'processing',
    uploadedAt: new Date(Date.now() - 30000).toISOString(),
  },
  {
    id: 'session-2',
    agentId: 'agent-123',
    title: 'Ready for Review.txt',
    type: 'txt',
    size: 15234,
    status: 'preview',
    uploadedAt: new Date(Date.now() - 120000).toISOString(),
    chunksCount: 10,
    previewData: {
      sessionId: 'session-2',
      fileName: 'Ready for Review.txt',
      chunkCount: 10,
      chunks: [
        {
          index: 0,
          preview: 'This is the first chunk of the document...',
          characterCount: 384,
          metadata: { type: 'paragraph' },
        },
        {
          index: 1,
          preview: 'This is the second chunk with more content...',
          characterCount: 421,
          metadata: { type: 'paragraph' },
        },
      ],
    },
  },
  {
    id: 'doc-3',
    agentId: 'agent-123',
    title: 'Completed Document.docx',
    type: 'docx',
    size: 1048576,
    status: 'completed',
    uploadedAt: new Date(Date.now() - 3600000).toISOString(),
    chunksCount: 15,
  },
  {
    id: 'session-4',
    agentId: 'agent-123',
    title: 'Failed Upload.pdf',
    type: 'pdf',
    size: 5242880,
    status: 'failed',
    uploadedAt: new Date(Date.now() - 1800000).toISOString(),
  },
];

// ============================================================================
// EXAMPLE 6: Testing Utilities
// ============================================================================

/**
 * Simulate document status progression
 * Useful for testing UI without backend
 */
export function useDocumentSimulator(agentId: string) {
  const { documents: _documents } = useKBStore();
  const [isSimulating, setIsSimulating] = useState(false);

  const simulateUpload = async () => {
    if (isSimulating) return;
    setIsSimulating(true);

    // Simulate upload stages
    const stages = ['uploading', 'processing', 'preview', 'processing', 'completed'];
    const doc: KnowledgeBaseDoc = {
      id: `sim-${Date.now()}`,
      agentId,
      title: 'Simulated Upload.txt',
      type: 'txt',
      size: 1024,
      status: 'uploading' as any,
      uploadedAt: new Date().toISOString(),
    };

    // Add to list
    // (In real app, this would be done via uploadDocument)

    // Progress through stages
    for (const stage of stages) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      doc.status = stage as any;
      if (stage === 'preview') {
        doc.chunksCount = 5;
      }
    }

    setIsSimulating(false);
  };

  return { simulateUpload, isSimulating };
}

// ============================================================================
// EXAMPLE 7: Status Badge Reference
// ============================================================================

export function StatusBadgeShowcase() {
  const statuses = ['uploading', 'processing', 'preview', 'completed', 'failed'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status Badge Variants</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {statuses.map(status => (
          <div key={status} className="flex items-center justify-between">
            <span className="text-sm font-medium capitalize">{status}</span>
            <StatusBadgeDemo status={status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StatusBadgeDemo({ status }: { status: string }) {
  // This would use the actual StatusBadge component from DocumentItem
  return <Badge variant="outline">{status}</Badge>;
}

// ============================================================================
// EXAMPLE 8: Bulk Operations
// ============================================================================

export function BulkOperationsExample() {
  const { documents, confirmDocument, cancelDocument } = useKBStore();

  const confirmAllPreviews = async () => {
    const previewDocs = documents.filter(d => d.status === 'preview');
    
    for (const doc of previewDocs) {
      await confirmDocument(doc.id);
    }
    
    console.log(`✅ Confirmed ${previewDocs.length} documents`);
  };

  const cancelAllPreviews = async () => {
    const previewDocs = documents.filter(d => d.status === 'preview');
    
    for (const doc of previewDocs) {
      await cancelDocument(doc.id);
    }
    
    console.log(`❌ Cancelled ${previewDocs.length} documents`);
  };

  const previewCount = documents.filter(d => d.status === 'preview').length;

  return (
    <div className="flex gap-2">
      <button
        onClick={confirmAllPreviews}
        disabled={previewCount === 0}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
      >
        Confirm All ({previewCount})
      </button>
      <button
        onClick={cancelAllPreviews}
        disabled={previewCount === 0}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
      >
        Cancel All ({previewCount})
      </button>
    </div>
  );
}

// ============================================================================
// EXPORT ALL EXAMPLES
// ============================================================================

const UploadWorkflowExamples = {
  BasicUploadExample,
  UploadWithStats,
  ProgrammaticUploadExample,
  CustomHandlersExample,
  StatusBadgeShowcase,
  BulkOperationsExample,
  MOCK_DOCUMENTS,
};

export default UploadWorkflowExamples;
