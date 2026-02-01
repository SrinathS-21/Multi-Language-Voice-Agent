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
import { Clock } from "lucide-react";

interface DurationData {
  label: string;
  count: number;
}

interface DurationStats {
  totalCalls: number;
  avgDuration: number;
  maxDuration: number;
  minDuration: number;
  medianDuration: number;
}

interface CallDurationHistogramProps {
  data: DurationData[];
  stats?: DurationStats;
  isLoading?: boolean;
  title?: string;
}

export function CallDurationHistogram({
  data,
  stats,
  isLoading,
  title = "Call Duration Distribution",
}: CallDurationHistogramProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full animate-pulse bg-gray-100 rounded" />
        </CardContent>
      </Card>
    );
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border rounded-lg shadow-lg p-3">
          <div className="font-medium">{label}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {payload[0].value.toLocaleString()} calls
          </div>
        </div>
      );
    }
    return null;
  };

  const maxCount = Math.max(...data.map(d => d.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Clock className="h-5 w-5 text-blue-500" />
          {title}
        </CardTitle>
        {stats && (
          <div className="flex flex-wrap gap-4 mt-2 text-sm">
            <div>
              <span className="text-muted-foreground">Average:</span>{" "}
              <span className="font-medium">{formatDuration(stats.avgDuration)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Median:</span>{" "}
              <span className="font-medium">{formatDuration(stats.medianDuration)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Max:</span>{" "}
              <span className="font-medium">{formatDuration(stats.maxDuration)}</span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" className="text-xs" tick={{ fill: "#888" }} />
              <YAxis className="text-xs" tick={{ fill: "#888" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <rect
                    key={`bar-${index}`}
                    fill={`rgba(59, 130, 246, ${0.3 + (entry.count / maxCount) * 0.7})`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribution Summary */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t">
          {data.slice(0, 3).map((bucket, _index) => {
            const total = data.reduce((acc, d) => acc + d.count, 0);
            const percentage = total > 0 ? Math.round((bucket.count / total) * 100) : 0;
            return (
              <div key={bucket.label} className="text-center">
                <div className="text-lg font-bold">{percentage}%</div>
                <div className="text-xs text-muted-foreground">{bucket.label}</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
