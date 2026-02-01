/**
 * DocumentList Component
 * Displays uploaded documents in a sortable, filterable table
 */

"use client";

import { useState } from "react";
import { useDocuments, useSoftDeleteDocument, useChunksByDocument } from "@/hooks/useKnowledge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  FileText,
  MoreVertical,
  Trash2,
  Search,
  Loader2,
  AlertCircle,
  Clock,
  Info,
  Eye,
} from "lucide-react";
import { formatFileSize, formatTimestamp, getFileTypeIcon } from "@/types/knowledge";
import type { Document, DocumentStatus } from "@/types/knowledge";
import { toast } from "@/components/ui/use-toast";
import { ChunkPreviewModal } from "./ChunkPreviewModal";

interface DocumentListProps {
  agentId: string;
  organizationId: string;
}

export function DocumentList({ agentId, organizationId: _organizationId }: DocumentListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    document: Document | null;
  }>({
    isOpen: false,
    document: null,
  });
  const [deletionReason, setDeletionReason] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [viewChunksDialog, setViewChunksDialog] = useState(false);

  // Fetch documents
  const { data: documentsResponse, isLoading, error, refetch } = useDocuments(agentId);
  const documents = documentsResponse?.documents || [];
  
  // Fetch chunks for selected document
  const { data: chunks, isLoading: chunksLoading } = useChunksByDocument(selectedDocumentId);
  
  const softDeleteMutation = useSoftDeleteDocument();

  // Filter documents based on search
  const filteredDocuments = documents.filter((doc) => {
    const query = searchQuery.toLowerCase();
    return (
      doc.fileName.toLowerCase().includes(query) ||
      doc.fileType.toLowerCase().includes(query) ||
      doc.status.toLowerCase().includes(query)
    );
  });

  // Handle view chunks
  const handleViewChunks = async (document: Document) => {
    setSelectedDocumentId(document.documentId);
    setViewChunksDialog(true);
  };

  // Handle delete
  const handleDeleteClick = (document: Document) => {
    setDeleteDialog({
      isOpen: true,
      document,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.document) return;

    try {
      await softDeleteMutation.mutateAsync({
        documentId: deleteDialog.document.documentId,
        reason: deletionReason || undefined,
      });

      toast({
        title: "Document deleted",
        description: `${deleteDialog.document.fileName} has been moved to deleted files. You can recover it within 30 days.`,
      });

      setDeleteDialog({ isOpen: false, document: null });
      setDeletionReason("");
      refetch();
    } catch (error) {
      toast({
        title: "Deletion failed",
        description: error instanceof Error ? error.message : "Failed to delete document",
        variant: "destructive",
      });
    }
  };

  // Status badge styling
  const getStatusBadge = (status: DocumentStatus, document?: Document) => {
    const variants: Record<DocumentStatus, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      uploading: { variant: "outline", label: "Uploading" },
      processing: { variant: "outline", label: "Processing" },
      preview: { variant: "secondary", label: "Ready for Review" },
      completed: { variant: "default", label: "Completed" },
      failed: { variant: "destructive", label: "Failed" },
    };

    const config = variants[status];
    
    // Show expiration info for preview documents
    if (status === "preview" && document?.expiresInHours !== undefined) {
      const timeLeft = document.expiresInHours > 0 
        ? `${document.expiresInHours}h ${document.expiresInMinutes}m`
        : `${document.expiresInMinutes}m`;
        
      return (
        <div className="flex flex-col gap-1">
          <Badge variant={config.variant} className="text-xs w-fit">
            {config.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Expires in {timeLeft}
          </span>
        </div>
      );
    }
    
    return (
      <Badge variant={config.variant} className="text-xs">
        {config.label}
      </Badge>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <div>
            <p className="font-semibold">Failed to load documents</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm" className="mt-4">
          Retry
        </Button>
      </Card>
    );
  }

  // Empty state
  if (documents.length === 0) {
    return (
      <Card className="p-12">
        <div className="flex flex-col items-center justify-center text-center space-y-3">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <div>
            <p className="font-semibold">No documents uploaded yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload your first document using the Upload tab above
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Search bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredDocuments.length} {filteredDocuments.length === 1 ? "document" : "documents"}
          </div>
        </div>

        {/* Documents table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Chunks</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No documents match your search
                  </TableCell>
                </TableRow>
              ) : (
                filteredDocuments.map((document) => {
                  const FileIcon = getFileTypeIcon(document.fileType);
                  return (
                    <TableRow key={document.documentId}>
                      <TableCell>
                        {/* @ts-expect-error - lucide-react icon type issue */}
                        <FileIcon className="h-5 w-5 text-muted-foreground" />
                      </TableCell>
                      <TableCell className="font-medium max-w-xs truncate">
                        {document.fileName}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {document.fileType.toUpperCase()}
                        </code>
                      </TableCell>
                      <TableCell>{getStatusBadge(document.status, document)}</TableCell>
                      <TableCell className="text-right">
                        {document.chunkCount || 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatFileSize(document.fileSize)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatTimestamp(document.uploadedAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {document.status === 'completed' && document.chunkCount > 0 && (
                              <DropdownMenuItem onClick={() => handleViewChunks(document)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Chunks
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteClick(document)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialog.isOpen} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialog({ isOpen: false, document: null });
          setDeletionReason("");
        }
      }}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteDialog.document?.fileName}</strong>?
              This will remove it from your active knowledge base.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            {/* 30-day retention info */}
            <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-3 text-sm">
              <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-blue-900">
                <p className="font-medium">30-Day Recovery Period</p>
                <p className="mt-1 text-blue-700">
                  Deleted documents can be recovered for 30 days. After this period, they are permanently purged.
                </p>
              </div>
            </div>

            {/* Deletion reason */}
            <div className="space-y-2">
              <label htmlFor="deletion-reason" className="text-sm font-medium">
                Reason for deletion (optional)
              </label>
              <Textarea
                id="deletion-reason"
                placeholder="e.g., Outdated information, duplicate content, incorrect data..."
                value={deletionReason}
                onChange={(e) => setDeletionReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Adding a reason helps track why documents were removed
              </p>
            </div>

            {/* Summary */}
            <div className="flex items-start gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <p className="text-muted-foreground">
                This document will be recoverable until{" "}
                <span className="font-medium text-foreground">
                  {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                </span>
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={softDeleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
              disabled={softDeleteMutation.isPending}
            >
              {softDeleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Document
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Chunks Modal */}
      {selectedDocumentId && (
        <ChunkPreviewModal
          open={viewChunksDialog}
          onOpenChange={setViewChunksDialog}
          sessionId={selectedDocumentId}
          fileName={documents.find(d => d.documentId === selectedDocumentId)?.fileName || ""}
          chunks={chunks?.map(chunk => ({
            chunkIndex: chunk.chunkIndex,
            text: chunk.text,
            metadata: chunk.pageNumber ? { pageNumber: chunk.pageNumber } : undefined,
          })) || []}
          onConfirm={() => {
            setViewChunksDialog(false);
            setSelectedDocumentId(null);
          }}
          onCancel={() => {
            setViewChunksDialog(false);
            setSelectedDocumentId(null);
          }}
          viewOnly={true}
          isLoading={chunksLoading}
        />
      )}
    </>
  );
}
