"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface CallVolumeData {
  date: string;
  total: number;
  completed: number;
  failed: number;
  avgDuration: number;
}

interface CallVolumeChartProps {
  data: CallVolumeData[];
  isLoading?: boolean;
  title?: string;
  showLegend?: boolean;
}

export function CallVolumeChart({
  data,
  isLoading,
  title = "Call Volume",
  showLegend = true,
}: CallVolumeChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full animate-pulse bg-gray-100 rounded" />
        </CardContent>
      </Card>
    );
  }

  // Calculate trend
  const calculateTrend = () => {
    if (data.length < 2) return { value: 0, direction: "neutral" as const };
    const recent = data.slice(-3).reduce((acc, d) => acc + d.total, 0) / 3;
    const previous = data.slice(-6, -3).reduce((acc, d) => acc + d.total, 0) / 3;
    if (previous === 0) return { value: 0, direction: "neutral" as const };
    const change = ((recent - previous) / previous) * 100;
    return {
      value: Math.abs(Math.round(change)),
      direction: change > 5 ? "up" : change < -5 ? "down" : "neutral",
    };
  };

  const trend = calculateTrend();
  const totalCalls = data.reduce((acc, d) => acc + d.total, 0);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold">{totalCalls.toLocaleString()}</span>
            <span className="text-sm text-muted-foreground">total calls</span>
            {trend.direction !== "neutral" && (
              <span
                className={`flex items-center text-sm ${
                  trend.direction === "up" ? "text-green-600" : "text-red-600"
                }`}
              >
                {trend.direction === "up" ? (
                  <TrendingUp className="h-4 w-4 mr-1" />
                ) : (
                  <TrendingDown className="h-4 w-4 mr-1" />
                )}
                {trend.value}%
              </span>
            )}
            {trend.direction === "neutral" && (
              <span className="flex items-center text-sm text-gray-500">
                <Minus className="h-4 w-4 mr-1" />
                Stable
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                className="text-xs"
                tick={{ fill: "#888" }}
              />
              <YAxis className="text-xs" tick={{ fill: "#888" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                labelFormatter={(value) => formatDate(value as string)}
              />
              {showLegend && <Legend />}
              <Area
                type="monotone"
                dataKey="total"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#colorTotal)"
                name="Total Calls"
              />
              <Area
                type="monotone"
                dataKey="completed"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#colorCompleted)"
                name="Completed"
              />
              <Area
                type="monotone"
                dataKey="failed"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#colorFailed)"
                name="Failed"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
