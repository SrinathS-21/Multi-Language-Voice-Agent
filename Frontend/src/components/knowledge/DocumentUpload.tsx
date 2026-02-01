/**
 * Knowledge Base Upload Component
 * Production-grade file upload with drag-and-drop, progress tracking, and preview
 */

"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X, CheckCircle2, XCircle, Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { useUploadDocument, usePollSessionStatus } from "@/hooks/useKnowledge";
import { cn, formatFileSize, STAGE_METADATA } from "@/lib/utils";
import { SessionProgressModal } from "./SessionProgressModal";
import type { IngestionStage } from "@/types/knowledge";

// ============================================================================
// TYPES
// ============================================================================

interface DocumentUploadProps {
  agentId: string;
  organizationId: string;
  onUploadComplete?: (sessionId: string) => void;
  onPreviewReady?: (sessionId: string, chunks: any[]) => void;
}

interface UploadState {
  file: File | null;
  uploading: boolean;
  sessionId: string | null;
  stage: IngestionStage | null;
  progress: number;
  error: string | null;
  previewEnabled: boolean;
}

// ============================================================================
// ACCEPTED FILE TYPES
// ============================================================================

const ACCEPTED_FILE_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "text/csv": [".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "application/json": [".json"],
  "text/html": [".html", ".htm"],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ============================================================================
// COMPONENT
// ============================================================================

export function DocumentUpload({
  agentId,
  organizationId,
  onUploadComplete,
  onPreviewReady,
}: DocumentUploadProps) {
  const { toast } = useToast();
  const uploadMutation = useUploadDocument();

  const [uploadState, setUploadState] = useState<UploadState>({
    file: null,
    uploading: false,
    sessionId: null,
    stage: null,
    progress: 0,
    error: null,
    previewEnabled: false,
  });

  const [showProgressModal, setShowProgressModal] = useState(false);

  // Poll session status when uploading
  usePollSessionStatus(
    uploadState.sessionId,
    (status) => {
      if (status) {
        // Update progress based on stage
        const stageProgress = getProgressForStage(status.status as IngestionStage);
        setUploadState((prev) => ({
          ...prev,
          stage: status.status as IngestionStage,
          progress: stageProgress,
        }));

        // Handle completion
        if (status.status === "completed") {
          setUploadState((prev) => ({ ...prev, uploading: false }));
          toast({
            title: "Upload complete",
            description: `${uploadState.file?.name} has been successfully uploaded`,
          });
          if (onUploadComplete) {
            onUploadComplete(uploadState.sessionId!);
          }
        }

        // Handle failure
        if (status.status === "failed") {
          setUploadState((prev) => ({
            ...prev,
            uploading: false,
            error: status.error || "Upload failed",
          }));
          toast({
            title: "Upload failed",
            description: status.error || "An error occurred during upload",
            variant: "destructive",
          });
        }

        // Handle preview ready
        if (status.status === "processing" && status.metadata?.chunks) {
          setUploadState((prev) => ({
            ...prev,
            stage: "preview_ready",
            progress: 60,
          }));
          if (onPreviewReady && uploadState.previewEnabled) {
            onPreviewReady(uploadState.sessionId!, status.metadata.chunks);
          }
        }
      }
    }
  );

  // Helper to map stage to progress percentage
  const getProgressForStage = (stage: IngestionStage): number => {
    const progressMap: Record<IngestionStage, number> = {
      uploading: 10,
      parsing: 25,
      chunking: 40,
      preview_ready: 60,
      confirming: 70,
      persisting: 85,
      embedding: 95,
      completed: 100,
      failed: 0,
      cancelled: 0,
    };
    return progressMap[stage] || 0;
  };

  // ==========================================================================
  // FILE UPLOAD HANDLER
  // ==========================================================================

  const handleFileUpload = useCallback(
    async (file: File) => {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: `Maximum file size is ${formatFileSize(MAX_FILE_SIZE)}`,
          variant: "destructive",
        });
        return;
      }

      // Reset state
      setUploadState({
        file,
        uploading: true,
        sessionId: null,
        stage: "uploading",
        progress: 10,
        error: null,
        previewEnabled: false,
      });

      // Show progress modal
      setShowProgressModal(true);

      try {
        // Upload document
        const response = await uploadMutation.mutateAsync({
          agentId,
          organizationId,
          file,
        });

        setUploadState((prev) => ({
          ...prev,
          sessionId: response.sessionId,
          stage: response.stage,
          progress: 20,
          previewEnabled: response.previewEnabled,
        }));

        // Polling will now automatically start via usePollSessionStatus
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Upload failed";

        setUploadState((prev) => ({
          ...prev,
          stage: "failed",
          error: errorMessage,
          uploading: false,
        }));

        toast({
          title: "Upload failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
    [agentId, organizationId, toast, uploadMutation]
  );

  // ==========================================================================
  // DROPZONE
  // ==========================================================================

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        handleFileUpload(acceptedFiles[0]);
      }
    },
    [handleFileUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxFiles: 1,
    disabled: uploadState.uploading,
  });

  // ==========================================================================
  // RESET HANDLER
  // ==========================================================================

  const handleReset = () => {
    setUploadState({
      file: null,
      uploading: false,
      sessionId: null,
      stage: null,
      progress: 0,
      error: null,
      previewEnabled: false,
    });
    setShowProgressModal(false);
  };

  // ==========================================================================
  // RETRY HANDLER
  // ==========================================================================

  const handleRetry = () => {
    if (uploadState.file) {
      handleFileUpload(uploadState.file);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Show upload area when no file is selected
  if (!uploadState.file) {
    return (
      <Card className="border-2 border-dashed">
        <CardContent className="p-10">
          <div
            {...getRootProps()}
            className={cn(
              "flex flex-col items-center justify-center space-y-4 cursor-pointer transition-colors",
              isDragActive && "bg-accent"
            )}
          >
            <input {...getInputProps()} />
            <div className="rounded-full bg-primary/10 p-6">
              <Upload className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">
                {isDragActive ? "Drop file here" : "Upload Knowledge Base Document"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Drag & drop or click to select a file
              </p>
              <p className="text-xs text-muted-foreground">
                Supported: PDF, DOCX, TXT, MD, CSV, JSON, HTML (max {formatFileSize(MAX_FILE_SIZE)})
              </p>
            </div>
            <Button>Select File</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show progress when uploading
  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        {/* File info */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="rounded-lg bg-primary/10 p-3">
              <File className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{uploadState.file.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(uploadState.file.size)}
              </p>
            </div>
          </div>
          {!uploadState.uploading && (
            <Button variant="ghost" size="icon" onClick={handleReset}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Progress bar */}
        {uploadState.uploading && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {uploadState.stage && STAGE_METADATA[uploadState.stage]?.label}
              </span>
              <span className="text-muted-foreground">{uploadState.progress}%</span>
            </div>
            <Progress value={uploadState.progress} className="h-2" />
            {uploadState.stage && (
              <p className="text-xs text-muted-foreground">
                {STAGE_METADATA[uploadState.stage]?.description}
              </p>
            )}
          </div>
        )}

        {/* Status */}
        {uploadState.stage === "completed" && (
          <div className="flex items-center space-x-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Upload completed successfully</span>
          </div>
        )}

        {uploadState.error && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-destructive">
              <XCircle className="h-5 w-5" />
              <span className="text-sm">{uploadState.error}</span>
            </div>
            <Button variant="outline" onClick={handleRetry} disabled={uploadMutation.isPending}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Upload
            </Button>
          </div>
        )}

        {/* Actions */}
        {uploadState.stage === "preview_ready" && uploadState.previewEnabled && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Chunks ready for preview
            </p>
            <Button onClick={() => onPreviewReady?.(uploadState.sessionId!, [])}>
              <Eye className="h-4 w-4 mr-2" />
              Preview Chunks
            </Button>
          </div>
        )}
      </CardContent>

      {/* Session Progress Modal */}
      <SessionProgressModal
        sessionId={uploadState.sessionId}
        fileName={uploadState.file?.name || ""}
        isOpen={showProgressModal}
        onClose={() => setShowProgressModal(false)}
        onComplete={() => {
          if (onUploadComplete && uploadState.sessionId) {
            onUploadComplete(uploadState.sessionId);
          }
        }}
        onPreviewReady={() => {
          if (onPreviewReady && uploadState.sessionId) {
            onPreviewReady(uploadState.sessionId, []);
          }
        }}
        autoCloseOnComplete={false}
      />
    </Card>
  );
}
