"use client";

import React, { useCallback, useState, useEffect } from "react";
import { Upload, File, Trash2, CheckCircle, XCircle, Loader2, Eye, X, Check, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { KnowledgeBaseDoc, KBUploadPayload } from "@/types";
import { formatFileSize, formatDate } from "@/lib/utils";
import { useKBStore } from "@/store";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { ChunkPreviewModal } from "./ChunkPreviewModal";

interface KBUploaderProps {
  agentId: string;
  documents: KnowledgeBaseDoc[];
  onUploadComplete?: (doc: KnowledgeBaseDoc) => void;
}

export function KBUploader({ agentId, documents, onUploadComplete }: KBUploaderProps) {
  const { uploadDocument, deleteDocument, confirmDocument, cancelDocument, fetchDocsByAgent, getSessionStatus, isLoading: _isLoading } = useKBStore();
  const [isDragging, setIsDragging] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<KnowledgeBaseDoc | null>(null);
  const [uploadNotification, setUploadNotification] = useState<{ fileName: string; progress: number } | null>(null);
  const confirm = useConfirmDialog();

  // Auto-refresh processing documents every 3 seconds
  useEffect(() => {
    const processingDocs = documents.filter(
      (doc) => doc.status === 'processing' || doc.status === 'uploading'
    );

    if (processingDocs.length === 0) return;

    const interval = setInterval(async () => {
      for (const doc of processingDocs) {
        await getSessionStatus(doc.id, agentId);
      }
    }, 10000); // Poll every 10 seconds (reduced from 3s)

    return () => clearInterval(interval);
  }, [documents, agentId, getSessionStatus]);

  // Refresh documents list only when there are active processing/preview documents
  useEffect(() => {
    // Check if there are any active documents that need polling
    const hasActiveDocuments = documents.some(
      (doc) => doc.status === 'processing' || doc.status === 'uploading' || doc.status === 'preview'
    );

    if (!hasActiveDocuments) return; // Don't poll if no active documents

    const interval = setInterval(async () => {
      await fetchDocsByAgent(agentId);
    }, 30000); // Refresh every 30 seconds (reduced from 5s)

    return () => clearInterval(interval);
  }, [agentId, fetchDocsByAgent, documents]);

  // Hide upload notification after completion
  useEffect(() => {
    if (uploadNotification && uploadNotification.progress >= 100) {
      const timer = setTimeout(() => {
        setUploadNotification(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [uploadNotification]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = useCallback(async (file: File) => {
    setUploadNotification({ fileName: file.name, progress: 10 });
    
    const payload: KBUploadPayload = {
      agentId,
      file,
      title: file.name,
    };

    const result = await uploadDocument(payload);
    if (result) {
      setUploadNotification({ fileName: file.name, progress: 100 });
      if (onUploadComplete) {
        onUploadComplete(result);
      }
    } else {
      setUploadNotification(null);
    }
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
    e.target.value = ""; // Reset input
  };

  const handleConfirmPreview = async () => {
    if (!previewDoc?.previewData?.sessionId) return;
    
    const success = await confirmDocument(previewDoc.previewData.sessionId);
    if (success) {
      setPreviewDoc(null);
      // Refresh to show completed document
      setTimeout(() => fetchDocsByAgent(agentId), 1000);
    }
  };

  const handleCancelPreview = async () => {
    if (!previewDoc?.previewData?.sessionId) return;
    
    const success = await cancelDocument(previewDoc.previewData.sessionId);
    if (success) {
      setPreviewDoc(null);
    }
  };

  const handleDelete = async (docId: string, fileName?: string) => {
    const confirmed = await confirm.show({
      title: "Delete Document",
      description: (
        <>
          Are you sure you want to delete{" "}
          <strong>{fileName || "this document"}</strong>?
          <br />
          <span className="text-xs text-muted-foreground mt-2 block">
            This will remove the document and its embeddings from the knowledge base.
          </span>
        </>
      ),
      confirmText: "Delete",
      variant: "destructive",
    });
    
    if (confirmed) {
      await deleteDocument(docId);
    }
  };

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
          chunks={(previewDoc.previewData.chunks || []).map(chunk => ({
            chunkIndex: chunk.index,
            text: chunk.preview,
            metadata: chunk.metadata,
          }))}
          onConfirm={handleConfirmPreview}
          onCancel={handleCancelPreview}
        />
      )}
      
      <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <File className="h-5 w-5" />
          Knowledge Base
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

        {/* Upload Notification - Toast Style */}
        {uploadNotification && (
          <div className="fixed top-4 right-4 z-50 bg-white shadow-xl rounded-lg border-2 border-blue-200 p-4 min-w-[340px] animate-in slide-in-from-top">
            <div className="flex items-center gap-3 mb-3">
              {uploadNotification.progress >= 100 ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{uploadNotification.fileName}</p>
                <p className="text-xs text-blue-600 font-medium mt-0.5">
                  {uploadNotification.progress >= 100 ? 'Upload complete! Processing in background...' : 'Uploading...'}
                </p>
              </div>
            </div>
            <Progress value={uploadNotification.progress} className="h-2" />
          </div>
        )}

        {/* Document List */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground">
            Uploaded Documents ({documents.length})
          </h4>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No documents uploaded yet
            </p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <DocumentItem 
                  key={doc.id} 
                  document={doc} 
                  onDelete={handleDelete}
                  onPreview={setPreviewDoc}
                  onConfirm={async (sessionId) => {
                    const success = await confirmDocument(sessionId);
                    if (success) setTimeout(() => fetchDocsByAgent(agentId), 1000);
                  }}
                  onCancel={async (sessionId) => {
                    await cancelDocument(sessionId);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </>
  );
}

interface DocumentItemProps {
  document: KnowledgeBaseDoc;
  onDelete: (id: string, fileName?: string) => void;
  onPreview?: (doc: KnowledgeBaseDoc) => void;
  onConfirm?: (sessionId: string) => void;
  onCancel?: (sessionId: string) => void;
}

function DocumentItem({ document, onDelete, onPreview, onConfirm, onCancel }: DocumentItemProps) {
  const getFileIcon = (type: string) => {
    switch (type) {
      case "pdf": return "📄";
      case "txt": return "📝";
      case "docx": return "📃";
      case "md": return "📋";
      case "json": return "📊";
      default: return "📁";
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const badges = {
      completed: { icon: <CheckCircle className="h-3.5 w-3.5" />, label: "Completed", className: "bg-green-50 text-green-700 border-green-200" },
      failed: { icon: <XCircle className="h-3.5 w-3.5" />, label: "Failed", className: "bg-red-50 text-red-700 border-red-200" },
      processing: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: "Processing", className: "bg-blue-50 text-blue-700 border-blue-200" },
      uploading: { icon: <Upload className="h-3.5 w-3.5" />, label: "Uploading", className: "bg-blue-50 text-blue-700 border-blue-200" },
      preview: { icon: <Clock className="h-3.5 w-3.5" />, label: "Ready for Review", className: "bg-amber-50 text-amber-700 border-amber-200" },
    };
    const badge = badges[status as keyof typeof badges] || badges.processing;
    return (
      <Badge variant="outline" className={cn("text-xs flex items-center gap-1 px-2 py-0.5", badge.className)}>
        {badge.icon}
        <span>{badge.label}</span>
      </Badge>
    );
  };

  return (
    <div className={cn(
      "flex items-center justify-between p-4 border rounded-lg transition-all",
      document.status === 'preview' ? "bg-amber-50 border-amber-200 shadow-sm" : "hover:bg-gray-50"
    )}>
      <div className="flex items-center gap-3 flex-1">
        <span className="text-2xl">{getFileIcon(document.type)}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{document.title}</span>
            <StatusBadge status={document.status} />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatFileSize(document.size)}</span>
            <span>•</span>
            <span>{formatDate(document.uploadedAt)}</span>
            {document.chunksCount && (
              <>
                <span>•</span>
                <span className="font-medium text-blue-600">{document.chunksCount} chunks</span>
              </>
            )}
            {/* Show expiration for preview documents */}
            {document.status === 'preview' && document.expiresInHours !== undefined && (
              <>
                <span>•</span>
                <span className="font-medium text-amber-600">
                  Expires in {document.expiresInHours > 0 
                    ? `${document.expiresInHours}h ${document.expiresInMinutes}m` 
                    : `${document.expiresInMinutes}m`}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Preview Actions */}
        {document.status === 'preview' && document.previewData && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 border-blue-200 hover:bg-blue-50"
              onClick={() => onPreview?.(document)}
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700"
              onClick={() => onConfirm?.(document.id)}
            >
              <Check className="h-3.5 w-3.5" />
              Confirm
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 border-red-200 hover:bg-red-50"
              onClick={() => onCancel?.(document.id)}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </>
        )}
        
        {/* Delete Button */}
        {document.status !== 'processing' && document.status !== 'uploading' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={() => onDelete(document.id, document.title)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
