/**
 * SessionProgressModal Component
 * Real-time ingestion progress tracking with visual stages
 */

"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileSearch,
  Split,
  Eye,
  CheckCircle2,
  Database,
  GitBranch,
  XCircle,
  Loader2,
} from "lucide-react";
import { useSessionStatus } from "@/hooks/useKnowledge";
import { cn } from "@/lib/utils";
import type { IngestionStage } from "@/types/knowledge";

interface SessionProgressModalProps {
  sessionId: string | null;
  fileName: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
  onPreviewReady?: () => void;
  autoCloseOnComplete?: boolean;
}

// Stage icons mapping
const STAGE_ICONS: Record<IngestionStage, any> = {
  uploading: Upload,
  parsing: FileSearch,
  chunking: Split,
  preview_ready: Eye,
  confirming: CheckCircle2,
  persisting: Database,
  embedding: GitBranch,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: XCircle,
};

// Stage labels
const STAGE_LABELS: Record<IngestionStage, string> = {
  uploading: "Uploading",
  parsing: "Parsing",
  chunking: "Chunking",
  preview_ready: "Preview Ready",
  confirming: "Confirming",
  persisting: "Persisting",
  embedding: "Embedding",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

// Stage descriptions
const STAGE_DESCRIPTIONS: Record<IngestionStage, string> = {
  uploading: "Uploading file to server...",
  parsing: "Extracting text from document...",
  chunking: "Splitting content into segments...",
  preview_ready: "Chunks ready for preview",
  confirming: "Starting persistence...",
  persisting: "Saving to database...",
  embedding: "Generating vector embeddings...",
  completed: "Successfully ingested!",
  failed: "An error occurred",
  cancelled: "Process cancelled",
};

// Calculate progress percentage for each stage
const STAGE_PROGRESS: Record<IngestionStage, number> = {
  uploading: 10,
  parsing: 25,
  chunking: 40,
  preview_ready: 50,
  confirming: 60,
  persisting: 75,
  embedding: 90,
  completed: 100,
  failed: 0,
  cancelled: 0,
};

export function SessionProgressModal({
  sessionId,
  fileName,
  isOpen,
  onClose,
  onComplete,
  onPreviewReady,
  autoCloseOnComplete = false,
}: SessionProgressModalProps) {
  // Poll session status every 2 seconds
  const { data: status } = useSessionStatus(sessionId, {
    refetchInterval: (isOpen && sessionId ? 2000 : undefined) as number | undefined,
  });

  const currentStage = status?.status as IngestionStage || "uploading";
  const progress = STAGE_PROGRESS[currentStage] || 0;
  const StageIcon = STAGE_ICONS[currentStage];

  // Handle stage changes
  useEffect(() => {
    if (!status) return;

    // Preview ready - notify parent
    // Note: status.status can be "processing" while stage transitions through preview_ready
    if ((status.status as any) === "preview_ready" && onPreviewReady) {
      onPreviewReady();
    }

    // Completed - notify parent and auto-close if enabled
    if (status.status === "completed") {
      if (onComplete) {
        onComplete();
      }
      
      if (autoCloseOnComplete) {
        setTimeout(() => {
          onClose();
        }, 2000); // Close after 2 seconds
      }
    }

    // Failed - keep modal open to show error
  }, [status, onComplete, onPreviewReady, autoCloseOnComplete, onClose]);

  // Don't render if no session
  if (!sessionId) return null;

  const isTerminalState = currentStage === "completed" || currentStage === "failed" || currentStage === "cancelled";
  const isSuccess = currentStage === "completed";
  const isError = currentStage === "failed" || currentStage === "cancelled";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSuccess && <CheckCircle2 className="h-5 w-5 text-green-600" />}
            {isError && <XCircle className="h-5 w-5 text-red-600" />}
            {!isTerminalState && <Loader2 className="h-5 w-5 animate-spin" />}
            {isSuccess ? "Upload Complete" : isError ? "Upload Failed" : "Processing Document"}
          </DialogTitle>
          <DialogDescription>
            {fileName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{STAGE_LABELS[currentStage]}</span>
              <span className="text-muted-foreground">{progress}%</span>
            </div>
            <Progress 
              value={progress} 
              className={cn(
                "h-2",
                isSuccess && "bg-green-100",
                isError && "bg-red-100"
              )}
            />
          </div>

          {/* Current Stage */}
          <div className={cn(
            "flex items-center gap-3 rounded-lg p-4",
            isSuccess && "bg-green-50",
            isError && "bg-red-50",
            !isTerminalState && "bg-blue-50"
          )}>
            <div className={cn(
              "flex-shrink-0",
              isSuccess && "text-green-600",
              isError && "text-red-600",
              !isTerminalState && "text-blue-600"
            )}>
              <StageIcon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className={cn(
                "font-medium text-sm",
                isSuccess && "text-green-900",
                isError && "text-red-900",
                !isTerminalState && "text-blue-900"
              )}>
                {STAGE_LABELS[currentStage]}
              </p>
              <p className={cn(
                "text-sm mt-0.5",
                isSuccess && "text-green-700",
                isError && "text-red-700",
                !isTerminalState && "text-blue-700"
              )}>
                {status?.error || STAGE_DESCRIPTIONS[currentStage]}
              </p>
            </div>
          </div>

          {/* Stage Checklist */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Pipeline Stages</p>
            <div className="space-y-1.5">
              {Object.entries(STAGE_LABELS)
                .filter(([stage]) => 
                  !["failed", "cancelled", "preview_ready", "confirming"].includes(stage)
                )
                .map(([stage, label]) => {
                  const stageEnum = stage as IngestionStage;
                  const stageProgress = STAGE_PROGRESS[stageEnum];
                  const StageIcon = STAGE_ICONS[stageEnum];
                  
                  const isComplete = progress > stageProgress;
                  const isCurrent = currentStage === stageEnum;
                  const isPending = progress < stageProgress;

                  return (
                    <div
                      key={stage}
                      className={cn(
                        "flex items-center gap-2 text-sm py-1.5 px-2 rounded",
                        isCurrent && "bg-blue-50",
                        isComplete && "text-green-700",
                        isPending && "text-muted-foreground"
                      )}
                    >
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : isCurrent ? (
                        <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
                      ) : (
                        <StageIcon className="h-4 w-4" />
                      )}
                      <span className={cn(
                        isCurrent && "font-medium",
                        isComplete && "line-through"
                      )}>
                        {label}
                      </span>
                      {isCurrent && (
                        <Badge variant="secondary" className="ml-auto">
                          In Progress
                        </Badge>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Chunk Count */}
          {status?.chunkCount && status.chunkCount > 0 && (
            <div className="flex items-center justify-between text-sm border-t pt-3">
              <span className="text-muted-foreground">Chunks Created</span>
              <Badge variant="secondary">{status.chunkCount} chunks</Badge>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
