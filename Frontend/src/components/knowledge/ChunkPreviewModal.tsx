/**
 * Chunk Preview Modal
 * Production-grade preview interface for reviewing parsed chunks before confirmation
 */

"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Eye, ChevronDown, ChevronUp, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import { useConfirmIngestion, useCancelIngestion } from "@/hooks/useKnowledge";
import type { Chunk } from "@/types/knowledge";

// ============================================================================
// TYPES
// ============================================================================

interface ChunkPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  fileName: string;
  chunks: Chunk[];
  onConfirm?: () => void;
  onCancel?: () => void;
  viewOnly?: boolean;
  isLoading?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ChunkPreviewModal({
  open,
  onOpenChange,
  sessionId,
  fileName,
  chunks,
  onConfirm,
  onCancel,
  viewOnly = false,
  isLoading = false,
}: ChunkPreviewModalProps) {
  const { toast } = useToast();
  const confirmMutation = useConfirmIngestion();
  const cancelMutation = useCancelIngestion();

  const [expandedChunks, setExpandedChunks] = useState<Set<number>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);
  const [viewMode, setViewMode] = useState<'text' | 'json'>('text'); // Add view mode toggle

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const toggleChunk = (index: number) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedChunks(new Set(chunks.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedChunks(new Set());
  };

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await confirmMutation.mutateAsync({ sessionId });
      
      toast({
        title: "Chunks confirmed",
        description: "Your document is being processed and will be added to the knowledge base",
      });

      onOpenChange(false);
      if (onConfirm) {
        onConfirm();
      }
    } catch (error) {
      toast({
        title: "Confirmation failed",
        description: error instanceof Error ? error.message : "Failed to confirm chunks",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(sessionId);
      
      toast({
        title: "Upload cancelled",
        description: "The document upload has been cancelled",
      });

      onOpenChange(false);
      if (onCancel) {
        onCancel();
      }
    } catch (error) {
      toast({
        title: "Cancellation failed",
        description: error instanceof Error ? error.message : "Failed to cancel upload",
        variant: "destructive",
      });
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Eye className="h-5 w-5" />
            <span>{viewOnly ? 'View Document Chunks' : 'Preview Chunks'}</span>
          </DialogTitle>
          <DialogDescription>
            {viewOnly 
              ? `View the parsed chunks from <strong>${fileName}</strong>`
              : `Review the parsed chunks from <strong>${fileName}</strong> before adding to knowledge base`
            }
          </DialogDescription>
        </DialogHeader>

        {/* Stats */}
        <div className="flex items-center justify-between p-4 bg-accent rounded-lg">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{chunks?.length || 0} chunks</span>
            </div>
            <Badge variant="outline">
              {chunks?.reduce((sum, c) => sum + (c?.text?.length || 0), 0).toLocaleString() || 0} characters
            </Badge>
          </div>
          <div className="flex space-x-2">
            {/* View Mode Toggle */}
            <div className="flex items-center border rounded-md">
              <Button 
                variant={viewMode === 'text' ? 'default' : 'ghost'} 
                size="sm"
                className="rounded-r-none"
                onClick={() => setViewMode('text')}
              >
                Text
              </Button>
              <Button 
                variant={viewMode === 'json' ? 'default' : 'ghost'} 
                size="sm"
                className="rounded-l-none"
                onClick={() => setViewMode('json')}
              >
                JSON
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        </div>

        {/* Chunks list */}
        {isLoading ? (
          <div className="h-[60vh] flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading chunks...</p>
            </div>
          </div>
        ) : viewMode === 'json' ? (
          /* JSON View - Contained with proper indentation */
          <div className="h-[60vh] overflow-auto border rounded-lg bg-slate-950">
            <pre className="p-4 text-xs text-slate-50 font-mono">
              {JSON.stringify(chunks, null, 2)}
            </pre>
          </div>
        ) : (
          /* Text View - Use ScrollArea for vertical scroll only */
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-3">
              {chunks.map((chunk, index) => {
                if (!chunk) return null;
                
                const text = chunk.text || '';
                const isExpanded = expandedChunks.has(index);
                const preview = text.slice(0, 200);
                const hasMore = text.length > 200;

                return (
                  <Card key={index} className="overflow-hidden hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <Badge variant="secondary" className="font-mono">#{index + 1}</Badge>
                          {chunk.metadata?.title && (
                            <span className="text-sm font-medium text-muted-foreground">
                              {chunk.metadata.title}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          {chunk.metadata?.pageNumber && (
                            <Badge variant="outline">Page {chunk.metadata.pageNumber}</Badge>
                          )}
                          <Badge variant="outline" className="font-mono text-xs">
                            {text.length} chars
                          </Badge>
                        </div>
                      </div>

                      {/* Content - Simple editor-like display */}
                      <div className="relative">
                        <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-md border font-mono text-sm">
                          <pre className="whitespace-pre-wrap leading-relaxed overflow-x-auto">
                            {isExpanded ? text : preview}
                            {!isExpanded && hasMore && <span className="text-muted-foreground">...</span>}
                          </pre>
                        </div>
                        
                        {hasMore && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 w-full"
                            onClick={() => toggleChunk(index)}
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="h-4 w-4 mr-1" />
                                Show Less
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-4 w-4 mr-1" />
                                Show More ({text.length - preview.length} more characters)
                              </>
                            )}
                          </Button>
                        )}
                      </div>

                      {/* Metadata */}
                      {chunk.metadata && Object.keys(chunk.metadata).length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                              Metadata
                            </summary>
                            <pre className="mt-2 p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs overflow-x-auto font-mono">
                              {JSON.stringify(chunk.metadata, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {/* Footer */}
        <DialogFooter className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {isLoading ? "Loading chunks..." : `${chunks.length} chunks ${viewOnly ? 'in this document' : 'will be added to the knowledge base'}`}
          </div>
          {!viewOnly && (
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={cancelMutation.isPending || isConfirming}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isConfirming || confirmMutation.isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {isConfirming ? "Confirming..." : "Confirm & Store"}
              </Button>
            </div>
          )}
          {viewOnly && (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
