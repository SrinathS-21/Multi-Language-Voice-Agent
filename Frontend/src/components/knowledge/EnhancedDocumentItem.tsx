/**
 * Enhanced Document Item Component
 * Displays document with per-document actions: Preview, Cancel, Embed, Push
 */

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Eye,
  X,
  Code,
  Upload,
  MoreVertical,
  Trash2,
  Clock,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import type { KnowledgeBaseDoc } from "@/types";
import { formatFileSize, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface EnhancedDocumentItemProps {
  document: KnowledgeBaseDoc;
  onPreview: (doc: KnowledgeBaseDoc) => void;
  onCancel: (docId: string) => void;
  onPushToRAG: (docId: string) => void;
  onDelete: (docId: string) => void;
  onRetry: (docId: string) => void;
}

export function EnhancedDocumentItem({
  document,
  onPreview,
  onCancel,
  onPushToRAG,
  onDelete,
  onRetry,
}: EnhancedDocumentItemProps) {
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);

  // Calculate time remaining for pending_push docs
  const getTimeRemaining = () => {
    if (document.status !== "pending_push" || !document.expiresAt) return null;
    
    const now = Date.now();
    const expiry = new Date(document.expiresAt).getTime();
    const remaining = expiry - now;
    
    if (remaining <= 0) return "Expired";
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    return `${minutes}m remaining`;
  };

  // Generate embed code for iframe
  const generateEmbedCode = () => {
    const baseUrl = window.location.origin;
    return `<iframe
  src="${baseUrl}/embed/document/${document.id}"
  width="100%"
  height="600"
  frameborder="0"
  allowfullscreen>
</iframe>`;
  };

  const copyEmbedCode = () => {
    const code = generateEmbedCode();
    navigator.clipboard.writeText(code);
    // Toast notification would go here
  };

  // Get status badge styling
  const getStatusBadge = () => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
      uploading: { variant: "outline", className: "bg-blue-50 text-blue-700 border-blue-200" },
      processing: { variant: "outline", className: "bg-purple-50 text-purple-700 border-purple-200" },
      preview: { variant: "outline", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
      pending_push: { variant: "outline", className: "bg-amber-50 text-amber-700 border-amber-200" },
      pushed: { variant: "default", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
      completed: { variant: "default", className: "bg-green-50 text-green-700 border-green-200" },
      failed: { variant: "destructive" },
    };

    const config = variants[document.status] || { variant: "outline" };
    
    return (
      <Badge 
        variant={config.variant} 
        className={cn("text-xs uppercase", config.className)}
      >
        {document.status.replace("_", " ")}
      </Badge>
    );
  };

  // Determine available actions
  const canPreview = ["preview", "pending_push", "pushed", "completed"].includes(document.status);
  const canCancel = ["uploading", "processing"].includes(document.status);
  const canPush = document.status === "pending_push";
  const canRetry = document.status === "failed";
  const canEmbed = ["pushed", "completed"].includes(document.status);

  const timeRemaining = getTimeRemaining();
  const isExpiringSoon = timeRemaining && !timeRemaining.includes("h") && !timeRemaining.includes("Expired");

  return (
    <>
      <div className={cn(
        "flex items-center justify-between p-4 border rounded-lg transition-all",
        "hover:bg-gray-50 hover:shadow-sm",
        isExpiringSoon && "border-amber-300 bg-amber-50/30"
      )}>
        <div className="flex items-center gap-4 flex-1">
          {/* File icon */}
          <div className="text-3xl">
            {document.type === "pdf" && "📄"}
            {document.type === "txt" && "📝"}
            {document.type === "docx" && "📃"}
            {document.type === "md" && "📋"}
            {document.type === "json" && "📊"}
          </div>

          {/* Document info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{document.title}</span>
              {getStatusBadge()}
            </div>
            
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span>{formatFileSize(document.size)}</span>
              <span>•</span>
              <span>{formatDate(document.uploadedAt)}</span>
              {document.chunksCount && (
                <>
                  <span>•</span>
                  <span>{document.chunksCount} chunks</span>
                </>
              )}
              {timeRemaining && (
                <>
                  <span>•</span>
                  <span className={cn(
                    "flex items-center gap-1",
                    isExpiringSoon && "text-amber-600 font-medium"
                  )}>
                    <Clock className="h-3 w-3" />
                    {timeRemaining}
                  </span>
                </>
              )}
            </div>

            {document.lastError && (
              <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3" />
                <span>{document.lastError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Quick action buttons */}
          {canPush && (
            <Button
              size="sm"
              onClick={() => onPushToRAG(document.id)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Upload className="h-4 w-4 mr-1" />
              Push to RAG
            </Button>
          )}

          {canPreview && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPreview(document)}
            >
              <Eye className="h-4 w-4 mr-1" />
              Preview
            </Button>
          )}

          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancel(document.id)}
              className="text-red-600 hover:text-red-700"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}

          {canRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRetry(document.id)}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          )}

          {/* More actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEmbed && (
                <DropdownMenuItem onClick={() => setEmbedDialogOpen(true)}>
                  <Code className="h-4 w-4 mr-2" />
                  Get Embed Code
                </DropdownMenuItem>
              )}
              {canPreview && (
                <DropdownMenuItem onClick={() => onPreview(document)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Chunks
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(document.id)}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Embed Code Dialog */}
      <Dialog open={embedDialogOpen} onOpenChange={setEmbedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Embed Document</DialogTitle>
            <DialogDescription>
              Copy the code below to embed this document in your website
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg border">
              <code className="text-sm text-gray-800 whitespace-pre-wrap break-all">
                {generateEmbedCode()}
              </code>
            </div>
            <Button onClick={copyEmbedCode} className="w-full">
              <Code className="h-4 w-4 mr-2" />
              Copy Embed Code
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
