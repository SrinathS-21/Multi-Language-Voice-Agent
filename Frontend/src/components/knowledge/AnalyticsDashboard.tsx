/**
 * Analytics Dashboard Component
 * Visual analytics and insights for knowledge base
 */

"use client";

import { useDocuments, useAgentStats, useChunksAnalytics, useHotChunks } from "@/hooks/useKnowledge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Database,
  CheckCircle,
  AlertCircle,

  Clock,
  Loader2,
  Zap,
  BarChart3,
  Code,
  Table2,
  Image as ImageIcon,
  Star,
} from "lucide-react";
import { formatFileSize, formatTimestamp } from "@/types/knowledge";
import type { DocumentStatus } from "@/types/knowledge";

interface AnalyticsDashboardProps {
  agentId: string;
}

export function AnalyticsDashboard({ agentId }: AnalyticsDashboardProps) {
  const { data: documentsResponse, isLoading: isLoadingDocs } = useDocuments(agentId);
  const documents = documentsResponse?.documents || [];
  const { data: stats, isLoading: isLoadingStats } = useAgentStats(agentId);
  const { data: chunksAnalytics, isLoading: isLoadingChunks } = useChunksAnalytics(agentId);
  const { data: hotChunks = [], isLoading: isLoadingHotChunks } = useHotChunks(agentId, 10);

  // Calculate status distribution
  const statusCounts = documents.reduce(
    (acc, doc) => {
      acc[doc.status] = (acc[doc.status] || 0) + 1;
      return acc;
    },
    {} as Record<DocumentStatus, number>
  );

  const totalDocuments = documents.length;
  const completedDocs = statusCounts.completed || 0;
  const failedDocs = statusCounts.failed || 0;
  const processingDocs =
    totalDocuments - completedDocs - failedDocs;

  // Calculate file type distribution
  const fileTypeCounts = documents.reduce(
    (acc, doc) => {
      const ext = doc.fileType.toLowerCase();
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Top file types
  const topFileTypes = Object.entries(fileTypeCounts)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5);

  // Recent uploads (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentUploads = documents.filter(
    (doc) => new Date(doc.uploadedAt) > sevenDaysAgo
  ).length;

  // Average chunk count
  const avgChunkCount =
    documents.length > 0
      ? Math.round(
          documents.reduce((sum, doc) => sum + (doc.chunkCount || 0), 0) / documents.length
        )
      : 0;

  if (isLoadingDocs || isLoadingStats) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isLoadingAnalytics = isLoadingChunks || isLoadingHotChunks;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.documentCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              {recentUploads} uploaded this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Chunks</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalChunks || 0}</div>
            <p className="text-xs text-muted-foreground">
              Avg {avgChunkCount} chunks per doc
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {chunksAnalytics?.totalTokens.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all chunks
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Quality</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {chunksAnalytics?.avgQualityScore 
                ? (chunksAnalytics.avgQualityScore * 100).toFixed(0) + '%'
                : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              Chunk quality score
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chunk Analytics Row */}
      {!isLoadingAnalytics && chunksAnalytics && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Content Type Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Content Types</CardTitle>
              <CardDescription>Distribution of content types in chunks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span>Text</span>
                  </div>
                  <span className="font-medium">{chunksAnalytics.contentTypeDistribution.text}</span>
                </div>
                <Progress
                  value={chunksAnalytics.totalChunks > 0 
                    ? (chunksAnalytics.contentTypeDistribution.text / chunksAnalytics.totalChunks) * 100 
                    : 0}
                  className="h-2"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Code className="h-4 w-4 text-green-600" />
                    <span>Code</span>
                  </div>
                  <span className="font-medium">{chunksAnalytics.contentTypeDistribution.code}</span>
                </div>
                <Progress
                  value={chunksAnalytics.totalChunks > 0 
                    ? (chunksAnalytics.contentTypeDistribution.code / chunksAnalytics.totalChunks) * 100 
                    : 0}
                  className="h-2"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Table2 className="h-4 w-4 text-yellow-600" />
                    <span>Tables</span>
                  </div>
                  <span className="font-medium">{chunksAnalytics.contentTypeDistribution.table}</span>
                </div>
                <Progress
                  value={chunksAnalytics.totalChunks > 0 
                    ? (chunksAnalytics.contentTypeDistribution.table / chunksAnalytics.totalChunks) * 100 
                    : 0}
                  className="h-2"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-purple-600" />
                    <span>Images</span>
                  </div>
                  <span className="font-medium">{chunksAnalytics.contentTypeDistribution.image}</span>
                </div>
                <Progress
                  value={chunksAnalytics.totalChunks > 0 
                    ? (chunksAnalytics.contentTypeDistribution.image / chunksAnalytics.totalChunks) * 100 
                    : 0}
                  className="h-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Quality Score Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Quality Distribution</CardTitle>
              <CardDescription>Chunk quality scores breakdown</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-green-600" />
                    <span>Excellent (80-100%)</span>
                  </div>
                  <span className="font-medium">{chunksAnalytics.qualityScoreDistribution.excellent}</span>
                </div>
                <Progress
                  value={chunksAnalytics.totalChunks > 0 
                    ? (chunksAnalytics.qualityScoreDistribution.excellent / chunksAnalytics.totalChunks) * 100 
                    : 0}
                  className="h-2"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-blue-600" />
                    <span>Good (60-80%)</span>
                  </div>
                  <span className="font-medium">{chunksAnalytics.qualityScoreDistribution.good}</span>
                </div>
                <Progress
                  value={chunksAnalytics.totalChunks > 0 
                    ? (chunksAnalytics.qualityScoreDistribution.good / chunksAnalytics.totalChunks) * 100 
                    : 0}
                  className="h-2"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-yellow-600" />
                    <span>Average (40-60%)</span>
                  </div>
                  <span className="font-medium">{chunksAnalytics.qualityScoreDistribution.average}</span>
                </div>
                <Progress
                  value={chunksAnalytics.totalChunks > 0 
                    ? (chunksAnalytics.qualityScoreDistribution.average / chunksAnalytics.totalChunks) * 100 
                    : 0}
                  className="h-2"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-600" />
                    <span>Poor (0-40%)</span>
                  </div>
                  <span className="font-medium">{chunksAnalytics.qualityScoreDistribution.poor}</span>
                </div>
                <Progress
                  value={chunksAnalytics.totalChunks > 0 
                    ? (chunksAnalytics.qualityScoreDistribution.poor / chunksAnalytics.totalChunks) * 100 
                    : 0}
                  className="h-2"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Hot Chunks */}
      {!isLoadingAnalytics && hotChunks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              Hot Chunks
            </CardTitle>
            <CardDescription>Most frequently accessed chunks (top 10)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {hotChunks.map((chunk, index) => (
                <div
                  key={chunk.chunkId}
                  className="flex items-start gap-3 border-b pb-3 last:border-0"
                >
                  <Badge variant="secondary" className="mt-1 flex-shrink-0">
                    #{index + 1}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-clamp-2 mb-1">{chunk.text}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {chunk.documentFileName && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {chunk.documentFileName}
                        </span>
                      )}
                      {chunk.pageNumber && (
                        <span>Page {chunk.pageNumber}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        {(chunk.qualityScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-medium">{chunk.accessCount}</p>
                    <p className="text-xs text-muted-foreground">accesses</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Distribution */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Document Status</CardTitle>
            <CardDescription>Current processing status of all documents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Completed</span>
                </div>
                <span className="font-medium">{completedDocs}</span>
              </div>
              <Progress
                value={totalDocuments > 0 ? (completedDocs / totalDocuments) * 100 : 0}
                className="h-2"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span>Processing</span>
                </div>
                <span className="font-medium">{processingDocs}</span>
              </div>
              <Progress
                value={totalDocuments > 0 ? (processingDocs / totalDocuments) * 100 : 0}
                className="h-2"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span>Failed</span>
                </div>
                <span className="font-medium">{failedDocs}</span>
              </div>
              <Progress
                value={totalDocuments > 0 ? (failedDocs / totalDocuments) * 100 : 0}
                className="h-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* File Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Top File Types</CardTitle>
            <CardDescription>Most common document formats</CardDescription>
          </CardHeader>
          <CardContent>
            {topFileTypes.length > 0 ? (
              <div className="space-y-4">
                {topFileTypes.map(([type, count]) => {
                  const countNum = count as number;
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {type.toUpperCase()}
                        </code>
                        <span className="font-medium">
                          {countNum} ({Math.round((countNum / totalDocuments) * 100)}%)
                        </span>
                      </div>
                      <Progress
                        value={(countNum / totalDocuments) * 100}
                        className="h-2"
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No file type data available
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Uploads</CardTitle>
          <CardDescription>Latest documents added to the knowledge base</CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length > 0 ? (
            <div className="space-y-3">
              {documents
                .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
                .slice(0, 5)
                .map((doc) => (
                  <div
                    key={doc.documentId}
                    className="flex items-center justify-between border-b pb-3 last:border-0"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{doc.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(doc.uploadedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{doc.chunkCount || 0} chunks</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(doc.fileSize)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No recent uploads
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
