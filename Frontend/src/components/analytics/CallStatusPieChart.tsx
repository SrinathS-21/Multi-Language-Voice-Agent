"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

interface StatusData {
  name: string;
  value: number;
  percentage: number;
}

interface CallStatusPieChartProps {
  data: StatusData[];
  totalCalls: number;
  isLoading?: boolean;
  title?: string;
  variant?: "status" | "type";
}

const STATUS_COLORS: Record<string, string> = {
  completed: "#22c55e",
  failed: "#ef4444",
  active: "#3b82f6",
  expired: "#f59e0b",
  inbound: "#8b5cf6",
  outbound: "#06b6d4",
  web: "#ec4899",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  active: <Clock className="h-4 w-4 text-blue-500" />,
  expired: <AlertCircle className="h-4 w-4 text-yellow-500" />,
};

export function CallStatusPieChart({
  data,
  totalCalls,
  isLoading,
  title = "Call Status Distribution",
  variant = "status",
}: CallStatusPieChartProps) {
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

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
    if (cx === undefined || cy === undefined || midAngle === undefined) return null;
    
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.05) return null;

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        className="text-xs font-medium"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-card border rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[data.name] || "#888" }}
            />
            <span className="font-medium capitalize">{data.name}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {data.value.toLocaleString()} calls ({data.percentage}%)
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {totalCalls.toLocaleString()} total calls
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={100}
                innerRadius={variant === "type" ? 60 : 0}
                fill="#8884d8"
                dataKey="value"
                animationDuration={500}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={STATUS_COLORS[entry.name] || `hsl(${index * 45}, 70%, 60%)`}
                    stroke="white"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(value: string) => (
                  <span className="text-sm capitalize">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Status Legend with counts */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t">
          {data.filter(d => d.value > 0).map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              {variant === "status" && STATUS_ICONS[item.name]}
              <div
                className={`w-3 h-3 rounded-full ${variant !== "status" ? "" : "hidden"}`}
                style={{ backgroundColor: STATUS_COLORS[item.name] || "#888" }}
              />
              <span className="text-sm capitalize">{item.name}</span>
              <span className="text-sm text-muted-foreground ml-auto">
                {item.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
