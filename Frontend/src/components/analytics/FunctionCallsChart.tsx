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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";

interface FunctionData {
  name: string;
  count: number;
  avgLatency: number;
}

interface FunctionCallsChartProps {
  data: FunctionData[];
  totalCalls: number;
  uniqueFunctions: number;
  isLoading?: boolean;
  title?: string;
}

export function FunctionCallsChart({
  data,
  totalCalls,
  uniqueFunctions,
  isLoading,
  title = "Function Call Analytics",
}: FunctionCallsChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full animate-pulse bg-gray-100 rounded" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No function calls recorded</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const func = data.find(f => f.name === label);
      return (
        <div className="bg-card border rounded-lg shadow-lg p-3">
          <div className="font-medium font-mono text-sm">{label}</div>
          <div className="space-y-1 mt-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Calls:</span>
              <span className="font-medium">{payload[0].value.toLocaleString()}</span>
            </div>
            {func && func.avgLatency > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Avg Latency:</span>
                <span className="font-medium">{func.avgLatency}ms</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const topFunctions = data.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Zap className="h-5 w-5 text-yellow-500" />
            {title}
          </CardTitle>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total:</span>{" "}
              <span className="font-medium">{totalCalls.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Unique:</span>{" "}
              <span className="font-medium">{uniqueFunctions}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={topFunctions}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis type="number" className="text-xs" tick={{ fill: "#888" }} />
              <YAxis
                type="category"
                dataKey="name"
                className="text-xs"
                tick={{ fill: "#888" }}
                width={120}
                tickFormatter={(value: string) =>
                  value.length > 15 ? `${value.substring(0, 15)}...` : value
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Function List */}
        <div className="mt-4 pt-4 border-t">
          <div className="text-sm font-medium mb-2">Top Functions</div>
          <div className="space-y-2">
            {topFunctions.slice(0, 5).map((func, index) => (
              <div key={func.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{index + 1}.</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded">{func.name}</code>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span>{func.count.toLocaleString()} calls</span>
                  {func.avgLatency > 0 && (
                    <span className="text-muted-foreground">{func.avgLatency}ms</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
