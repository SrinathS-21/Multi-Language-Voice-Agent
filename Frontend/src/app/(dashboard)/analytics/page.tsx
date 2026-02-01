"use client";

import React, { useState } from "react";
import {
  Phone,
  Clock,
  CheckCircle,
  Bot,
  Activity,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  useAnalytics,
  useAgents,
  useCallVolumeChart,
  useStatusDistribution,
  useAgentComparison,
  useLatencyTrends,
  useDurationDistribution,
  useFunctionCalls,
  useSentimentAnalytics,
  useHeatmapData,
  useSystemHealth,
} from "@/api/hooks";

// Import all chart components
import { CallVolumeChart } from "@/components/analytics/CallVolumeChart";
import { LatencyTrendsChart } from "@/components/analytics/LatencyTrendsChart";
import { CallStatusPieChart } from "@/components/analytics/CallStatusPieChart";
import { AgentComparisonChart } from "@/components/analytics/AgentComparisonChart";
import { CallDurationHistogram } from "@/components/analytics/CallDurationHistogram";
import { FunctionCallsChart } from "@/components/analytics/FunctionCallsChart";
import { SentimentChart } from "@/components/analytics/SentimentChart";
import { HeatmapChart } from "@/components/analytics/HeatmapChart";
import { StatsCard } from "@/components/analytics/StatsCard";
import { SystemHealthGauge } from "@/components/analytics/SystemHealthGauge";

// Organization ID from environment
const ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || process.env.DEFAULT_ORGANIZATION_ID || '';

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<number>(7);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch agents list
  const { data: agents } = useAgents(ORG_ID);

  // Fetch data from API
  const { data: analyticsData } = useAnalytics({
    tenantId: ORG_ID,
    agentId: selectedAgentId,
  });

  // Fetch chart data from API
  const { data: callVolumeData } = useCallVolumeChart({
    tenantId: ORG_ID,
    agentId: selectedAgentId,
    days: timeRange,
  }) as { data: any };

  const { data: statusDistribution } = useStatusDistribution({
    tenantId: ORG_ID,
    agentId: selectedAgentId,
    days: timeRange,
  }) as { data: any };

  const { data: agentComparison } = useAgentComparison({
    tenantId: ORG_ID,
    days: timeRange,
  }) as { data: any };

  const { data: latencyTrends } = useLatencyTrends({
    tenantId: ORG_ID,
    agentId: selectedAgentId,
    days: timeRange,
  }) as { data: any };

  const { data: durationDistribution } = useDurationDistribution({
    tenantId: ORG_ID,
    agentId: selectedAgentId,
    days: timeRange,
  }) as { data: any };

  const { data: functionCalls } = useFunctionCalls({
    tenantId: ORG_ID,
    agentId: selectedAgentId,
    days: timeRange,
  }) as { data: any };

  const { data: sentimentData } = useSentimentAnalytics({
    tenantId: ORG_ID,
    agentId: selectedAgentId,
    days: timeRange,
  }) as { data: any };

  const { data: heatmapData } = useHeatmapData({
    tenantId: ORG_ID,
    agentId: selectedAgentId,
    days: timeRange,
  }) as { data: any };

  const { data: healthData } = useSystemHealth({
    tenantId: ORG_ID,
  }) as { data: any };

  // Debug logging
  React.useEffect(() => {
    console.log('[Analytics] Data:', {
      analyticsData,
      callVolumeData,
      statusDistribution,
      latencyTrends,
      durationDistribution,
      functionCalls,
      sentimentData,
      heatmapData,
      healthData,
    });
  }, [analyticsData, callVolumeData, statusDistribution, latencyTrends, durationDistribution, functionCalls, sentimentData, heatmapData, healthData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // API queries auto-refresh, but we can show a visual indication
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const isLoading = !analyticsData;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7 text-blue-500" />
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground">
            Comprehensive insights into your voice agent performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time Range Selector */}
          <Select
            value={timeRange.toString()}
            onValueChange={(v) => setTimeRange(parseInt(v))}
          >
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 Hours</SelectItem>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="14">Last 14 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>

          {/* Agent Filter */}
          <Select
            value={selectedAgentId || "all"}
            onValueChange={(v) => setSelectedAgentId(v === "all" ? undefined : v)}
          >
            <SelectTrigger className="w-[160px]">
              <Bot className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents?.agents?.map((agent: any) => (
                <SelectItem key={agent._id} value={agent._id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Calls"
          value={analyticsData?.data?.today?.total_calls?.toLocaleString() || "0"}
          subtitle={`${analyticsData?.data?.today?.completed_calls || 0} completed`}
          icon={Phone}
          color="blue"
          isLoading={isLoading}
        />
        <StatsCard
          title="Completed"
          value={analyticsData?.data?.today?.completed_calls?.toLocaleString() || "0"}
          subtitle={`${analyticsData?.data?.today ? Math.round((analyticsData.data.today.completed_calls / analyticsData.data.today.total_calls) * 100) : 0}% success rate`}
          icon={CheckCircle}
          color="green"
          isLoading={isLoading}
        />
        <StatsCard
          title="Avg Duration"
          value={formatDuration(analyticsData?.data?.today?.avg_duration_seconds || 0)}
          subtitle="per call"
          icon={Clock}
          color="purple"
          isLoading={isLoading}
        />
        <StatsCard
          title="Active Calls"
          value={analyticsData?.data?.today ? (analyticsData.data.today.total_calls - analyticsData.data.today.completed_calls).toString() : "0"}
          subtitle="in progress"
          icon={Bot}
          color="yellow"
          isLoading={isLoading}
        />
      </div>

      {/* No Data Message */}
      {!isLoading && analyticsData?.data?.today?.total_calls === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <Activity className="h-12 w-12 text-blue-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-blue-900 mb-2">No Call Data Available</h3>
          <p className="text-blue-700 mb-4">
            There are no call sessions recorded yet. Analytics will appear here once your agents start handling calls.
          </p>
          <div className="text-sm text-blue-600">
            <p>To see analytics data:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Make sure your agents are configured and active</li>
              <li>Receive inbound calls or make test outbound calls</li>
              <li>Analytics update in real-time as calls are completed</li>
            </ul>
          </div>
        </div>
      )}

      {/* Main Charts with Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Call Volume Chart */}
            <CallVolumeChart
              data={callVolumeData?.data || []}
              isLoading={!callVolumeData}
              title="Call Volume Trend"
            />

            {/* Status Distribution */}
            <CallStatusPieChart
              data={statusDistribution?.statusDistribution || []}
              totalCalls={statusDistribution?.totalCalls || 0}
              isLoading={!statusDistribution}
              title="Call Status Distribution"
            />
          </div>

          {/* Heatmap */}
          <HeatmapChart
            data={heatmapData?.heatmap || []}
            maxValue={heatmapData?.maxValue || 0}
            totalCalls={heatmapData?.totalCalls || 0}
            isLoading={!heatmapData}
            title="Call Activity by Time"
          />

          {/* Call Type Distribution */}
          <div className="grid gap-6 lg:grid-cols-2">
            <CallStatusPieChart
              data={statusDistribution?.typeDistribution || []}
              totalCalls={statusDistribution?.totalCalls || 0}
              isLoading={!statusDistribution}
              title="Call Type Distribution"
              variant="type"
            />
            <CallDurationHistogram
              data={durationDistribution?.distribution || []}
              stats={durationDistribution?.stats}
              isLoading={!durationDistribution}
              title="Call Duration Distribution"
            />
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <LatencyTrendsChart
                data={latencyTrends?.data || []}
                summary={latencyTrends?.summary}
                isLoading={!latencyTrends}
                title="Latency Trends (STT/TTS/LLM)"
              />
            </div>
            <SystemHealthGauge
              health={healthData?.health ? {
                ...healthData.health,
                status: healthData.health.status as "healthy" | "warning" | "critical"
              } : undefined}
              metrics={healthData?.metrics}
              isLoading={!healthData}
              title="System Health"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <FunctionCallsChart
              data={functionCalls?.functions || []}
              totalCalls={functionCalls?.totalCalls || 0}
              uniqueFunctions={functionCalls?.uniqueFunctions || 0}
              isLoading={!functionCalls}
              title="Function Call Analytics"
            />
            <SentimentChart
              data={sentimentData?.distribution || []}
              total={sentimentData?.total || 0}
              sentimentScore={sentimentData?.sentimentScore || 0}
              isLoading={!sentimentData}
              title="Sentiment Analysis"
            />
          </div>
        </TabsContent>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-6">
          <AgentComparisonChart
            data={agentComparison?.agents || []}
            isLoading={!agentComparison}
            title="Agent Performance Comparison"
          />

          {/* Agent Details Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agentComparison?.agents?.map((agent: any) => (
              <div
                key={agent.agentId}
                className="p-4 border rounded-lg bg-card hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">{agent.agentName}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      agent.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {agent.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">Total Calls</div>
                    <div className="font-bold text-lg">{agent.totalCalls}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Completion</div>
                    <div className="font-bold text-lg text-green-600">
                      {agent.completionRate}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Avg Duration</div>
                    <div className="font-medium">{formatDuration(agent.avgDuration)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Avg Latency</div>
                    <div className="font-medium">
                      {agent.avgLatency > 0 ? `${agent.avgLatency}ms` : "N/A"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <SentimentChart
              data={sentimentData?.distribution || []}
              total={sentimentData?.total || 0}
              sentimentScore={sentimentData?.sentimentScore || 0}
              isLoading={!sentimentData}
              title="Customer Sentiment"
            />
            <FunctionCallsChart
              data={functionCalls?.functions || []}
              totalCalls={functionCalls?.totalCalls || 0}
              uniqueFunctions={functionCalls?.uniqueFunctions || 0}
              isLoading={!functionCalls}
              title="Tool Usage"
            />
          </div>

          {/* Key Insights */}
          <div className="p-6 border rounded-lg bg-card">
            <h3 className="text-lg font-semibold mb-4">📊 Key Insights</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-600 font-medium">Peak Activity</div>
                <div className="text-lg font-bold mt-1">
                  {heatmapData?.totalCalls ? "Weekday afternoons" : "No data yet"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Based on {timeRange}-day analysis
                </div>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-sm text-green-600 font-medium">Best Performing</div>
                <div className="text-lg font-bold mt-1">
                  {agentComparison?.agents?.[0]?.agentName || "N/A"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {agentComparison?.agents?.[0]?.completionRate || 0}% completion rate
                </div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="text-sm text-purple-600 font-medium">Avg Response Time</div>
                <div className="text-lg font-bold mt-1">
                  {latencyTrends?.summary?.avgStt
                    ? `${latencyTrends.summary.avgStt + latencyTrends.summary.avgTts + latencyTrends.summary.avgLlm}ms`
                    : "N/A"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  STT + LLM + TTS combined
                </div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
