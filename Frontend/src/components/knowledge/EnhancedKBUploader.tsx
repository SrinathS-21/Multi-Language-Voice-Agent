/**
 * Enhanced Knowledge Base Uploader
 * Complete document lifecycle management with status tracking
 * Features: Upload → Preview → Push to RAG with 24hr expiration window
 */

"use client";

import React, { useCallback, useState, useEffect } from "react";
import { Upload, File } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgeBaseDoc, KBUploadPayload } from "@/types";
import { useKBStore } from "@/store";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { ChunkPreviewModal } from "./ChunkPreviewModal";
import { DocumentStatusDashboard } from "./DocumentStatusDashboard";
import { EnhancedDocumentItem } from "./EnhancedDocumentItem";
import { useToast } from "@/components/ui/use-toast";

interface EnhancedKBUploaderProps {
  agentId: string;
  documents: KnowledgeBaseDoc[];
  onUploadComplete?: (doc: KnowledgeBaseDoc) => void;
}

export function EnhancedKBUploader({ 
  agentId, 
  documents, 
  onUploadComplete 
}: EnhancedKBUploaderProps) {
  const { 
    uploadDocument, 
    deleteDocument, 
    confirmDocument, 
    cancelDocument, 
    fetchDocsByAgent,
    uploadProgress, 
    uploadStage, 
    uploadMessage 
  } = useKBStore();
  
  const [isDragging, setIsDragging] = useState(false);
  const [currentUpload, setCurrentUpload] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<KnowledgeBaseDoc | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const confirm = useConfirmDialog();
  const { toast } = useToast();

  // Auto-refresh to check for expiring documents
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDocsByAgent(agentId);
    }, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, [agentId, fetchDocsByAgent]);

  // Categorize documents by status
  const categorizedDocs = {
    all: documents,
    uploading: documents.filter(d => ["uploading", "processing"].includes(d.status)),
    pending_push: documents.filter(d => d.status === "pending_push"),
    completed: documents.filter(d => ["pushed", "completed"].includes(d.status)),
    failed: documents.filter(d => d.status === "failed"),
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    setCurrentUpload(file.name);
    const payload: KBUploadPayload = {
      agentId,
      file,
      title: file.name,
    };

    const result = await uploadDocument(payload);
    if (result) {
      if (result.status === "preview" && result.previewData) {
        setPreviewDoc(result);
      } else if (onUploadComplete) {
        onUploadComplete(result);
      }
    }
    setCurrentUpload(null);
  }, [agentId, uploadDocument, onUploadComplete]);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        await handleUpload(file);
      }
    },
    [handleUpload]
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (const file of Array.from(files)) {
        await handleUpload(file);
      }
    }
    e.target.value = "";
  };

  const handlePreview = (doc: KnowledgeBaseDoc) => {
    if (doc.previewData) {
      setPreviewDoc(doc);
    } else {
      toast({
        title: "Preview not available",
        description: "This document doesn't have preview data",
        variant: "destructive",
      });
    }
  };

  const handleCancelUpload = async (docId: string) => {
    const confirmed = await confirm.show({
      title: "Cancel Upload",
      description: "Are you sure you want to cancel this upload?",
      confirmText: "Cancel Upload",
      variant: "destructive",
    });

    if (confirmed) {
      await cancelDocument(docId);
      toast({
        title: "Upload cancelled",
        description: "The upload has been cancelled successfully",
      });
    }
  };

  const handlePushToRAG = async (docId: string) => {
    const confirmed = await confirm.show({
      title: "Push to RAG",
      description: "This will embed the document in the knowledge base. Continue?",
      confirmText: "Push to RAG",
    });

    if (confirmed) {
      const success = await confirmDocument(docId);
      if (success) {
        toast({
          title: "Pushed to RAG",
          description: "Document is being embedded in the knowledge base",
        });
        await fetchDocsByAgent(agentId);
      }
    }
  };

  const handleDelete = async (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    const confirmed = await confirm.show({
      title: "Delete Document",
      description: `Are you sure you want to delete "${doc?.title}"? This action cannot be undone.`,
      confirmText: "Delete",
      variant: "destructive",
    });

    if (confirmed) {
      await deleteDocument(docId);
      toast({
        title: "Document deleted",
        description: "The document has been deleted successfully",
      });
    }
  };

  const handleRetry = async (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    // Re-upload the document (would need to store original file or fetch it)
    toast({
      title: "Retry not implemented",
      description: "Please re-upload the document manually",
    });
  };

  const handleConfirmPreview = async () => {
    if (!previewDoc?.previewData?.sessionId) return;

    const success = await confirmDocument(previewDoc.previewData.sessionId);
    if (success) {
      setPreviewDoc(null);
      await fetchDocsByAgent(agentId);
      toast({
        title: "Document confirmed",
        description: "Document is being pushed to knowledge base",
      });
    }
  };

  const handleCancelPreview = async () => {
    if (!previewDoc?.previewData?.sessionId) return;

    const success = await cancelDocument(previewDoc.previewData.sessionId);
    if (success) {
      setPreviewDoc(null);
      toast({
        title: "Preview cancelled",
        description: "The document upload has been cancelled",
      });
    }
  };

  const currentProgress = Object.values(uploadProgress)[0] || 0;

  return (
    <>
      {confirm.dialog}

      {/* Preview Modal */}
      {previewDoc && previewDoc.previewData && (
        <ChunkPreviewModal
          open={true}
          onOpenChange={(open) => !open && setPreviewDoc(null)}
          sessionId={previewDoc.previewData.sessionId}
          fileName={previewDoc.title}
          chunks={previewDoc.previewData.chunks?.map(chunk => ({
            chunkIndex: chunk.index,
            text: chunk.preview,
            metadata: chunk.metadata,
          })) || []}
          onConfirm={handleConfirmPreview}
          onCancel={handleCancelPreview}
        />
      )}

      <div className="space-y-6">
        {/* Status Dashboard */}
        <DocumentStatusDashboard documents={documents} />

        {/* Main Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <File className="h-5 w-5" />
              Document Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-gray-300 hover:border-gray-400"
              )}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag and drop files here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Supports PDF, TXT, DOCX, MD, JSON
              </p>
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".pdf,.txt,.docx,.md,.json"
                multiple
                onChange={handleFileSelect}
              />
              <Button asChild variant="outline">
                <label htmlFor="file-upload" className="cursor-pointer">
                  Select Files
                </label>
              </Button>
            </div>

            {/* Upload Progress Notification */}
            {currentUpload && (
              <div className="fixed top-4 right-4 z-50 bg-white shadow-lg rounded-lg border border-gray-200 p-4 min-w-[320px] animate-in slide-in-from-top">
                <div className="flex items-center gap-3 mb-3">
                  <Upload className="h-5 w-5 text-blue-600" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">{currentUpload}</p>
                    <p className="text-xs text-blue-600 font-medium mt-0.5">
                      {uploadMessage || "Processing..."}
                    </p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${currentProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 capitalize">
                    {uploadStage?.replace("_", " ") || "Processing"}
                  </span>
                  <span className="font-semibold text-blue-600">
                    {currentProgress}%
                  </span>
                </div>
              </div>
            )}

            {/* Document Lists with Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="all">
                  All ({categorizedDocs.all.length})
                </TabsTrigger>
                <TabsTrigger value="uploading">
                  Uploading ({categorizedDocs.uploading.length})
                </TabsTrigger>
                <TabsTrigger value="pending_push">
                  Need Push ({categorizedDocs.pending_push.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({categorizedDocs.completed.length})
                </TabsTrigger>
                <TabsTrigger value="failed">
                  Failed ({categorizedDocs.failed.length})
                </TabsTrigger>
              </TabsList>

              {(Object.keys(categorizedDocs) as Array<keyof typeof categorizedDocs>).map((key) => (
                <TabsContent key={key} value={key} className="space-y-2">
                  {categorizedDocs[key].length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No documents in this category
                    </p>
                  ) : (
                    categorizedDocs[key].map((doc) => (
                      <EnhancedDocumentItem
                        key={doc.id}
                        document={doc}
                        onPreview={handlePreview}
                        onCancel={handleCancelUpload}
                        onPushToRAG={handlePushToRAG}
                        onDelete={handleDelete}
                        onRetry={handleRetry}
                      />
                    ))
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
