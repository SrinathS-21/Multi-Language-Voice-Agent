"use client";

import React, { useState } from "react";
import { FileText, Search, ChevronDown, ChevronRight, Eye, Trash2, Upload, BookOpen } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChunkPreviewModal } from "@/components/knowledge/ChunkPreviewModal";
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
import { useToast } from "@/components/ui/use-toast";
import { useAgents } from "@/api/hooks";
import { useDocuments } from "@/hooks/useKnowledge";
import { formatFileSize, formatTimestamp } from "@/types/knowledge";
import { knowledgeAPI } from "@/api/knowledge";
import type { Document, Chunk } from "@/types/knowledge";

export default function KnowledgeBasePage() {
  const ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || process.env.DEFAULT_ORGANIZATION_ID || '';
  const { data: agentsResponse } = useAgents(ORG_ID);
  const agents = agentsResponse?.agents || [];
  
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [chunkPreviewOpen, setChunkPreviewOpen] = useState(false);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  console.log("Agents from Convex:", agents);

  // Filter agents based on search
  const filteredAgents = agents.filter((agent: any) =>
    agent.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleAgentExpansion = (agentId: string) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
    }
    setExpandedAgents(newExpanded);
  };

  // Fetch chunks for a document
  const handleViewChunks = async (document: Document) => {
    setSelectedDocument(document);
    setLoadingChunks(true);
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      // Fetch chunks from API
      const response = await fetch(
        `${API_BASE_URL}/api/v1/documents/${document.documentId}/chunks`
      );
      if (!response.ok) throw new Error("Failed to fetch chunks");
      const data = await response.json();
      setChunks(data.chunks || []);
    } catch (error) {
      console.error("Error fetching chunks:", error);
      setChunks([
        {
          chunkIndex: 0,
          text: "Unable to load chunks. Please try again.",
          metadata: {},
        },
      ]);
    } finally {
      setLoadingChunks(false);
      setChunkPreviewOpen(true);
    }
  };

  // Handle delete document
  const handleDeleteDocument = async () => {
    if (!documentToDelete) return;

    setIsDeleting(true);
    console.log("=== DELETE HANDLER START ===");
    console.log("Document to delete:", documentToDelete);
    console.log("Document status value:", `"${documentToDelete.status}"`);
    console.log("Document status type:", typeof documentToDelete.status);
    console.log("Document status length:", documentToDelete.status?.length);
    console.log("Document status charCodes:", documentToDelete.status?.split('').map(c => c.charCodeAt(0)));
    
    try {
      // Normalize status for comparison
      const normalizedStatus = documentToDelete.status?.trim?.()?.toLowerCase?.() || '';
      const isPending = normalizedStatus === 'processing' || normalizedStatus === 'preview';
      
      console.log("Normalized status:", `"${normalizedStatus}"`);
      console.log("Is pending?", isPending);
      
      if (isPending) {
        console.log("✓ USING CANCEL ENDPOINT for pending ingestion");
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const endpoint = `${API_BASE_URL}/api/v1/documents/${documentToDelete.documentId}/cancel`;
        console.log("POST", endpoint);
        const cancelResponse = await fetch(endpoint, { method: 'POST' });
        const cancelData = await cancelResponse.json();
        
        if (!cancelResponse.ok) {
          throw new Error(cancelData.error || `Cancel failed: ${cancelResponse.status}`);
        }
        
        toast({
          title: "Document cancelled",
          description: `${documentToDelete.fileName} ingestion has been cancelled.`,
        });
      } else {
        console.log("✓ USING DELETE ENDPOINT for confirmed document");
        console.log(`Status "${documentToDelete.status}" does not match 'processing' or 'preview'`);
        await knowledgeAPI.deleteDocument(documentToDelete.documentId);
        
        toast({
          title: "Document deleted",
          description: `${documentToDelete.fileName} has been deleted successfully.`,
        });
      }
      
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    } catch (error) {
      console.error("Error deleting document:", error);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete document",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Agent Card Component with expandable documents
  const AgentCard = ({ agent }: { agent: any }) => {
    const isExpanded = expandedAgents.has(agent.id);
    const { data: documentsResponse, isLoading } = useDocuments(agent.id);
    const documents = documentsResponse?.documents || [];

    return (
      <Card className="border border-border/50 hover:border-border transition-colors">
        <Collapsible open={isExpanded} onOpenChange={() => toggleAgentExpansion(agent.id)}>
          <CollapsibleTrigger asChild>
            <CardHeader className="hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <CardTitle className="text-lg font-semibold">{agent.name}</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {documents.length} docs
                  </Badge>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link href={`/agents/${agent.id}?tab=knowledge`}>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Link href={`/agents/${agent.id}`}>
                      Configure
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-sm text-muted-foreground">Loading documents...</div>
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
                  <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
                  <Button variant="outline" size="sm" className="mt-2" asChild>
                    <Link href={`/agents/${agent.id}?tab=knowledge`}>
                      Upload Document
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((document) => (
                    <DocumentRow key={document.documentId} document={document} />
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  // Document Row Component 
  const DocumentRow = ({ document }: { document: Document }) => {
    const getStatusBadge = (status: string) => {
      const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
        uploading: { variant: "outline", label: "Uploading" },
        processing: { variant: "outline", label: "Processing" },
        completed: { variant: "default", label: "Ready" },
        failed: { variant: "destructive", label: "Failed" },
      };
      
      const config = variants[status] || variants.completed;
      return (
        <Badge variant={config.variant} className="text-xs">
          {config.label}
        </Badge>
      );
    };

    return (
      <div className="flex items-center justify-between p-3 border border-border/50 rounded-lg hover:bg-muted/30 transition-colors">
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{document.fileName}</p>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {formatFileSize(document.fileSize)}
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">
                {document.chunkCount || 0} chunks
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(document.uploadedAt)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          {getStatusBadge(document.status)}
          {document.status === 'completed' && document.chunkCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => handleViewChunks(document)}
            >
              <Eye className="h-3 w-3 mr-1" />
              View Chunks
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs text-destructive hover:text-destructive"
            onClick={() => {
              setDocumentToDelete(document);
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base Management</h1>
          <p className="text-muted-foreground">
            Manage documents and knowledge for all your agents
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search agents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Enhanced Agent Cards */}
      <div className="space-y-4">
        {filteredAgents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
      
      {/* No Search Results */}
      {filteredAgents.length === 0 && search && (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
          <Search className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">
            No agents found matching "{search}"
          </p>
        </div>
      )}

      {/* Empty State */}
      {agents.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-lg">
          <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No agents found</h3>
          <p className="text-muted-foreground mb-4">
            Create an agent first to add documents to its knowledge base.
          </p>
          <Button asChild>
            <Link href="/agents/new">Create Agent</Link>
          </Button>
        </div>
      )}

      {/* Chunk Preview Modal */}
      {selectedDocument && (
        <ChunkPreviewModal
          open={chunkPreviewOpen}
          onOpenChange={setChunkPreviewOpen}
          sessionId={selectedDocument.documentId}
          fileName={selectedDocument.fileName}
          chunks={chunks}
          viewOnly={true}
          isLoading={loadingChunks}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{documentToDelete?.fileName}</strong>? 
              {documentToDelete?.status === 'processing' || documentToDelete?.status === 'preview' 
                ? ' This will cancel the ingestion and discard the document.' 
                : ' This will permanently delete the document and all its chunks from the knowledge base.'}
              {' '}This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDocument}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
