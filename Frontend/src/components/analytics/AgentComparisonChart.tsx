"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Trophy } from "lucide-react";

interface AgentData {
  agentId: string;
  agentName: string;
  language: string;
  status: string;
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  completionRate: number;
  avgDuration: number;
  avgLatency: number;
}

interface AgentComparisonChartProps {
  data: AgentData[];
  isLoading?: boolean;
  title?: string;
  metric?: "calls" | "duration" | "completion" | "latency";
}

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];

export function AgentComparisonChart({
  data,
  isLoading,
  title = "Agent Performance Comparison",
  metric: _metric = "calls",
}: AgentComparisonChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] w-full animate-pulse bg-gray-100 rounded" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[350px] flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No agent data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const topAgent = data.reduce((best, agent) =>
    agent.totalCalls > (best?.totalCalls || 0) ? agent : best
  , data[0]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const agent = data.find(a => a.agentName === label);
      if (!agent) return null;

      return (
        <div className="bg-card border rounded-lg shadow-lg p-3 min-w-[200px]">
          <div className="font-medium mb-2">{agent.agentName}</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Calls:</span>
              <span className="font-medium">{agent.totalCalls}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completed:</span>
              <span className="font-medium text-green-600">{agent.completedCalls}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Failed:</span>
              <span className="font-medium text-red-600">{agent.failedCalls}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completion Rate:</span>
              <span className="font-medium">{agent.completionRate}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Duration:</span>
              <span className="font-medium">{formatDuration(agent.avgDuration)}</span>
            </div>
            {agent.avgLatency > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Latency:</span>
                <span className="font-medium">{agent.avgLatency}ms</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Bot className="h-5 w-5 text-blue-500" />
            {title}
          </CardTitle>
          {topAgent && topAgent.totalCalls > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span className="text-muted-foreground">Top:</span>
              <span className="font-medium">{topAgent.agentName}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis type="number" className="text-xs" tick={{ fill: "#888" }} />
              <YAxis
                type="category"
                dataKey="agentName"
                className="text-xs"
                tick={{ fill: "#888" }}
                width={100}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="completedCalls" stackId="a" fill="#22c55e" name="Completed" radius={[0, 0, 0, 0]} />
              <Bar dataKey="failedCalls" stackId="a" fill="#ef4444" name="Failed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Agent Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t">
          {data.slice(0, 4).map((agent, index) => (
            <div
              key={agent.agentId}
              className="p-3 rounded-lg bg-muted/50 border"
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span className="text-sm font-medium truncate">{agent.agentName}</span>
              </div>
              <div className="text-2xl font-bold">{agent.totalCalls}</div>
              <div className="text-xs text-muted-foreground">
                {agent.completionRate}% completion rate
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
