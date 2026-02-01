/**
 * Document Status Dashboard
 * Global overview showing document counts by status with real-time updates
 */

"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Database,
  AlertCircle 
} from "lucide-react";
import type { KnowledgeBaseDoc, KBUploadStatus } from "@/types";
import { cn } from "@/lib/utils";

interface DocumentStatusDashboardProps {
  documents: KnowledgeBaseDoc[];
  className?: string;
}

interface StatusConfig {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
}

const STATUS_CONFIGS: Record<KBUploadStatus, StatusConfig> = {
  uploading: {
    label: "Uploading",
    icon: Upload,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    description: "Files currently being uploaded",
  },
  processing: {
    label: "Processing",
    icon: Clock,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    description: "Files being parsed and chunked",
  },
  preview: {
    label: "Preview Ready",
    icon: Eye,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    description: "Awaiting user confirmation",
  },
  pending_push: {
    label: "Need to Push",
    icon: AlertCircle,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    description: "Ready to push to RAG (24hr window)",
  },
  pushed: {
    label: "Pushed to RAG",
    icon: Database,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    description: "Successfully embedded in knowledge base",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-50",
    description: "Successfully uploaded and embedded",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    description: "Upload or processing failed",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    description: "Queued for upload",
  },
};

export function DocumentStatusDashboard({ documents, className }: DocumentStatusDashboardProps) {
  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts: Partial<Record<KBUploadStatus, number>> = {};
    documents.forEach((doc) => {
      counts[doc.status] = (counts[doc.status] || 0) + 1;
    });
    return counts;
  }, [documents]);

  // Calculate expiring soon count (pending_push docs with < 2 hours remaining)
  const expiringSoonCount = useMemo(() => {
    const twoHoursFromNow = Date.now() + 2 * 60 * 60 * 1000;
    return documents.filter(
      (doc) =>
        doc.status === "pending_push" &&
        doc.expiresAt &&
        new Date(doc.expiresAt).getTime() < twoHoursFromNow
    ).length;
  }, [documents]);

  // Status cards to display (prioritized order)
  const priorityStatuses: KBUploadStatus[] = [
    "uploading",
    "processing",
    "preview",
    "pending_push",
    "pushed",
    "completed",
    "failed",
  ];

  return (
    <div className={cn("space-y-4", className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Document Status Overview</span>
            <Badge variant="outline" className="text-sm font-normal">
              {documents.length} Total
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {priorityStatuses.map((status) => {
              const count = statusCounts[status] || 0;
              if (count === 0) return null;

              const config = STATUS_CONFIGS[status];
              const Icon = config.icon;

              return (
                <Card
                  key={status}
                  className={cn(
                    "transition-all hover:shadow-md cursor-pointer",
                    config.bgColor
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="text-2xl font-bold">{count}</p>
                        <p className={cn("text-sm font-medium", config.color)}>
                          {config.label}
                        </p>
                      </div>
                      <Icon className={cn("h-5 w-5", config.color)} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {config.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Expiring soon alert */}
          {expiringSoonCount > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-900">
                  {expiringSoonCount} document{expiringSoonCount > 1 ? "s" : ""} expiring soon
                </p>
                <p className="text-xs text-amber-700">
                  Push to RAG within 2 hours to prevent automatic removal
                </p>
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {((statusCounts.completed || 0) + (statusCounts.pushed || 0))}
              </p>
              <p className="text-xs text-muted-foreground">Success Rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {statusCounts.pending_push || 0}
              </p>
              <p className="text-xs text-muted-foreground">Pending Push</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {statusCounts.failed || 0}
              </p>
              <p className="text-xs text-muted-foreground">Failed</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
