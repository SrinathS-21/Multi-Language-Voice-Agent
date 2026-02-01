/**
 * EXAMPLE: Complete Document Upload Workflow Integration
 * 
 * This file demonstrates how to use the enhanced document upload system
 * with all features: status tracking, 24hr expiration, preview, push to RAG
 */

import { useState, useEffect } from "react";
import { EnhancedKBUploader } from "@/components/knowledge/EnhancedKBUploader";
import { useKBStore } from "@/store";
import type { KnowledgeBaseDoc } from "@/types";

export function KnowledgeBaseManagementPage() {
  const agentId = "your-agent-id"; // Replace with actual agent ID
  const { documents, fetchDocsByAgent, isLoading, error } = useKBStore();
  const [selectedDoc] = useState<KnowledgeBaseDoc | null>(null);

  // Initial fetch
  useEffect(() => {
    fetchDocsByAgent(agentId);
  }, [agentId, fetchDocsByAgent]);

  // Handle upload completion
  const handleUploadComplete = (doc: KnowledgeBaseDoc) => {
    console.log("✅ Upload complete:", doc);
    
    // Example: Auto-navigate based on status
    if (doc.status === "preview") {
      console.log("📋 Document is in preview mode");
    } else if (doc.status === "pending_push") {
      console.log("⏰ Document is pending push (24hr window)");
    } else if (doc.status === "pushed") {
      console.log("🎯 Document pushed to RAG successfully");
    }
  };

  if (isLoading) {
    return <div>Loading documents...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">
          Knowledge Base Management
        </h1>
        <p className="text-muted-foreground">
          Upload, preview, and manage documents with 24-hour push window
        </p>
      </div>

      {/* Main Component */}
      <EnhancedKBUploader
        agentId={agentId}
        documents={documents}
        onUploadComplete={handleUploadComplete}
      />

      {/* Example: Selected Document Details */}
      {selectedDoc && (
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold mb-2">Selected Document</h3>
          <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
            {JSON.stringify(selectedDoc, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EXAMPLE: Custom Hooks for Document Management
// ============================================================================

/**
 * Hook to track expiring documents
 */
export function useExpiringDocuments(_agentId: string) {
  const { documents } = useKBStore();
  const [expiringSoon, setExpiringSoon] = useState<KnowledgeBaseDoc[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
      const expiring = documents.filter(
        (doc) =>
          doc.status === "pending_push" &&
          doc.expiresAt &&
          new Date(doc.expiresAt).getTime() < twoHoursFromNow
      );
      setExpiringSoon(expiring);
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [documents]);

  return expiringSoon;
}

/**
 * Hook to auto-push documents before expiration
 */
export function useAutoPush(enabled: boolean = false) {
  const { documents, confirmDocument } = useKBStore();
  const [autoPushed, setAutoPushed] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(async () => {
      const oneHourFromNow = Date.now() + 60 * 60 * 1000;
      const aboutToExpire = documents.filter(
        (doc) =>
          doc.status === "pending_push" &&
          doc.expiresAt &&
          new Date(doc.expiresAt).getTime() < oneHourFromNow &&
          !autoPushed.includes(doc.id)
      );

      for (const doc of aboutToExpire) {
        const success = await confirmDocument(doc.id);
        if (success) {
          setAutoPushed(prev => [...prev, doc.id]);
          console.log("🤖 Auto-pushed document:", doc.title);
        }
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    return () => clearInterval(interval);
  }, [enabled, documents, confirmDocument, autoPushed]);

  return { autoPushed };
}

// ============================================================================
// EXAMPLE: Testing Utilities
// ============================================================================

/**
 * Mock data for testing
 */
export const mockDocuments: KnowledgeBaseDoc[] = [
  {
    id: "doc-1",
    agentId: "agent-123",
    title: "test-document.pdf",
    type: "pdf",
    size: 1024 * 1024 * 2, // 2MB
    uploadedAt: new Date().toISOString(),
    status: "uploading",
    chunksCount: 0,
  },
  {
    id: "doc-2",
    agentId: "agent-123",
    title: "knowledge-base.txt",
    type: "txt",
    size: 1024 * 50, // 50KB
    uploadedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
    status: "pending_push",
    chunksCount: 15,
    expiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(), // 23 hours remaining
  },
  {
    id: "doc-3",
    agentId: "agent-123",
    title: "completed-doc.md",
    type: "md",
    size: 1024 * 20,
    uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    status: "pushed",
    chunksCount: 8,
    embedCode: `<iframe src="http://localhost:3000/embed/doc-3" width="100%" height="600"></iframe>`,
  },
  {
    id: "doc-4",
    agentId: "agent-123",
    title: "failed-upload.docx",
    type: "docx",
    size: 1024 * 100,
    uploadedAt: new Date().toISOString(),
    status: "failed",
    lastError: "Failed to parse document",
    retryCount: 2,
  },
];

/**
 * Time-travel testing for expiration
 */
export function createDocumentWithCustomExpiry(hoursRemaining: number): KnowledgeBaseDoc {
  return {
    id: `test-doc-${Date.now()}`,
    agentId: "test-agent",
    title: `expiring-in-${hoursRemaining}h.pdf`,
    type: "pdf",
    size: 1024 * 1024,
    uploadedAt: new Date().toISOString(),
    status: "pending_push",
    chunksCount: 10,
    expiresAt: new Date(Date.now() + hoursRemaining * 60 * 60 * 1000).toISOString(),
  };
}

// ============================================================================
// EXAMPLE: Programmatic Upload
// ============================================================================

/**
 * Upload a document programmatically
 */
export async function uploadDocumentExample(
  agentId: string,
  file: File
): Promise<KnowledgeBaseDoc | null> {
  const { uploadDocument } = useKBStore.getState();
  
  try {
    console.log("📤 Starting upload:", file.name);
    
    const result = await uploadDocument({
      agentId,
      file,
      title: file.name,
    });

    if (result) {
      console.log("✅ Upload successful:", result);
      
      // Handle different statuses
      switch (result.status) {
        case "preview":
          console.log("👀 Preview ready - user must confirm");
          break;
        case "pending_push":
          console.log("⏰ Waiting for push (24hr window)");
          console.log(`⏱️ Expires at: ${result.expiresAt}`);
          break;
        case "pushed":
          console.log("🎯 Successfully pushed to RAG");
          break;
        default:
          console.log(`📊 Status: ${result.status}`);
      }
      
      return result;
    }
    
    return null;
  } catch (error) {
    console.error("❌ Upload failed:", error);
    return null;
  }
}

// ============================================================================
// EXAMPLE: Batch Operations
// ============================================================================

/**
 * Push multiple documents to RAG
 */
export async function batchPushToRAG(docIds: string[]): Promise<{
  success: string[];
  failed: string[];
}> {
  const { confirmDocument } = useKBStore.getState();
  const results: { success: string[]; failed: string[] } = { success: [], failed: [] };

  for (const docId of docIds) {
    const success = await confirmDocument(docId);
    if (success) {
      results.success.push(docId);
    } else {
      results.failed.push(docId);
    }
  }

  console.log(`✅ Pushed ${results.success.length}/${docIds.length} documents`);
  return results;
}

/**
 * Delete expired documents
 */
export async function cleanupExpiredDocuments(): Promise<number> {
  const { documents, deleteDocument } = useKBStore.getState();
  
  const expired = documents.filter(
    (doc) =>
      doc.status === "pending_push" &&
      doc.expiresAt &&
      new Date(doc.expiresAt).getTime() < Date.now()
  );

  let deleted = 0;
  for (const doc of expired) {
    const success = await deleteDocument(doc.id);
    if (success) deleted++;
  }

  console.log(`🗑️ Deleted ${deleted} expired documents`);
  return deleted;
}
