"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

interface LatencyData {
  date: string;
  stt: number;
  tts: number;
  llm: number;
  total: number;
}

interface LatencySummary {
  avgStt: number;
  avgTts: number;
  avgLlm: number;
}

interface LatencyTrendsChartProps {
  data: LatencyData[];
  summary?: LatencySummary;
  isLoading?: boolean;
  title?: string;
}

export function LatencyTrendsChart({
  data,
  summary,
  isLoading,
  title = "Latency Trends",
}: LatencyTrendsChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full animate-pulse bg-gray-100 rounded" />
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatLatency = (value: number) => `${value}ms`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Activity className="h-5 w-5 text-blue-500" />
            {title}
          </CardTitle>
          {summary && (
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-muted-foreground">STT:</span>
                <span className="font-medium">{summary.avgStt}ms</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-muted-foreground">TTS:</span>
                <span className="font-medium">{summary.avgTts}ms</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="text-muted-foreground">LLM:</span>
                <span className="font-medium">{summary.avgLlm}ms</span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                className="text-xs"
                tick={{ fill: "#888" }}
              />
              <YAxis
                className="text-xs"
                tick={{ fill: "#888" }}
                tickFormatter={formatLatency}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                labelFormatter={(value) => formatDate(value as string)}
                formatter={(value) => [`${value}ms`]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="stt"
                stroke="#a855f7"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="STT Latency"
              />
              <Line
                type="monotone"
                dataKey="tts"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="TTS Latency"
              />
              <Line
                type="monotone"
                dataKey="llm"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="LLM Latency"
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name="Total (E2E)"
                strokeDasharray="5 5"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
