/**
 * DeletedDocumentsList Component
 * View and recover soft-deleted documents
 * Shows 30-day retention period with countdown
 */

"use client";

import { useState } from "react";
import { useDeletedDocuments, useRecoverDocument } from "@/hooks/useKnowledge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  RotateCcw,
  Search,
  Loader2,
  AlertCircle,
  Clock,
  Trash2,
  Info,
} from "lucide-react";
import { formatFileSize } from "@/types/knowledge";
import type { DeletedDocument } from "@/types/knowledge";
import { toast } from "@/components/ui/use-toast";

interface DeletedDocumentsListProps {
  agentId: string;
  organizationId: string;
}

export function DeletedDocumentsList({ agentId, organizationId: _organizationId }: DeletedDocumentsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [recoverDialog, setRecoverDialog] = useState<{
    isOpen: boolean;
    document: DeletedDocument | null;
  }>({
    isOpen: false,
    document: null,
  });

  // Fetch deleted documents
  const { data: deletedResponse, isLoading, error, refetch } = useDeletedDocuments(agentId);
  const deletedFiles = deletedResponse?.deletedFiles || [];
  const recoverDocumentMutation = useRecoverDocument();

  // Filter non-purged documents
  const activeDeletedFiles = deletedFiles.filter((doc) => !doc.isPurged);

  // Filter documents based on search
  const filteredDocuments = activeDeletedFiles.filter((doc) => {
    const query = searchQuery.toLowerCase();
    return (
      doc.fileName.toLowerCase().includes(query) ||
      doc.fileType.toLowerCase().includes(query) ||
      doc.deletionReason?.toLowerCase().includes(query)
    );
  });

  // Calculate days until purge
  const getDaysUntilPurge = (purgeAt: number): number => {
    const now = Date.now();
    const diff = purgeAt - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  // Format deleted timestamp
  const formatDeletedAt = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  // Handle recover click
  const handleRecoverClick = (document: DeletedDocument) => {
    setRecoverDialog({
      isOpen: true,
      document,
    });
  };

  // Handle recover confirm
  const handleRecoverConfirm = async () => {
    if (!recoverDialog.document) return;

    try {
      await recoverDocumentMutation.mutateAsync(recoverDialog.document.documentId);

      toast({
        title: "Document recovered",
        description: `${recoverDialog.document.fileName} has been restored to your knowledge base.`,
      });

      setRecoverDialog({ isOpen: false, document: null });
      refetch();
    } catch (error: any) {
      toast({
        title: "Recovery failed",
        description: error.message || "Failed to recover document. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-3 text-gray-600">Loading deleted documents...</span>
        </CardContent>
      </Card>
    );
  }

  // Render error state
  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <span className="ml-3 text-red-600">Failed to load deleted documents</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Deleted Documents
              </CardTitle>
              <CardDescription className="mt-1.5">
                Documents are recoverable for 30 days before permanent deletion
              </CardDescription>
            </div>
            <Badge variant="secondary" className="ml-auto">
              {activeDeletedFiles.length} deleted
            </Badge>
          </div>

          {/* Info banner */}
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-blue-50 p-3 text-sm">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-blue-900">
              <p className="font-medium">30-Day Retention Policy</p>
              <p className="mt-1 text-blue-700">
                Deleted documents are retained for 30 days. After this period, they are permanently purged
                and cannot be recovered. Recover documents before the deadline to restore them.
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search deleted documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>

        <CardContent>
          {filteredDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Trash2 className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-gray-600 font-medium">
                {searchQuery ? "No matching deleted documents" : "No deleted documents"}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {searchQuery
                  ? "Try a different search term"
                  : "Deleted documents will appear here for 30 days"}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Deleted</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Purge In</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => {
                    const daysUntilPurge = getDaysUntilPurge(doc.purgeAt);
                    const isUrgent = daysUntilPurge <= 7;

                    return (
                      <TableRow key={doc._id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-400" />
                            <span>{doc.fileName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{doc.fileType}</Badge>
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {formatFileSize(doc.fileSize)}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {formatDeletedAt(doc.deletedAt)}
                        </TableCell>
                        <TableCell className="text-gray-600 max-w-[200px] truncate">
                          {doc.deletionReason || "No reason provided"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isUrgent ? "destructive" : "secondary"}
                            className="flex items-center gap-1 w-fit"
                          >
                            <Clock className="h-3 w-3" />
                            {daysUntilPurge} day{daysUntilPurge !== 1 ? "s" : ""}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRecoverClick(doc)}
                            disabled={recoverDocumentMutation.isPending}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Recover
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recover Confirmation Dialog */}
      <Dialog open={recoverDialog.isOpen} onOpenChange={(open) => !open && setRecoverDialog({ isOpen: false, document: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recover Document?</DialogTitle>
            <DialogDescription>
              This will restore the document to your active knowledge base.
            </DialogDescription>
          </DialogHeader>

          {recoverDialog.document && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{recoverDialog.document.fileName}</span>
              </div>
              <div className="text-sm text-gray-600">
                <p>
                  <span className="font-medium">Deleted:</span>{" "}
                  {formatDeletedAt(recoverDialog.document.deletedAt)}
                </p>
                {recoverDialog.document.deletionReason && (
                  <p className="mt-1">
                    <span className="font-medium">Reason:</span>{" "}
                    {recoverDialog.document.deletionReason}
                  </p>
                )}
                <p className="mt-1">
                  <span className="font-medium">Purges in:</span>{" "}
                  {getDaysUntilPurge(recoverDialog.document.purgeAt)} day
                  {getDaysUntilPurge(recoverDialog.document.purgeAt) !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
                <p className="font-medium">✓ Document will be restored</p>
                <p className="mt-1 text-green-700">
                  The document will be immediately available in your knowledge base after recovery.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRecoverDialog({ isOpen: false, document: null })}
              disabled={recoverDocumentMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRecoverConfirm}
              disabled={recoverDocumentMutation.isPending}
            >
              {recoverDocumentMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Recover Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
