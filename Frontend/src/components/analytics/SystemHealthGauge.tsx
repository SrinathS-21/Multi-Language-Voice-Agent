"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthData {
  status: "healthy" | "warning" | "critical";
  error_rate_24h: number;
  error_rate_1h: number;
  active_sessions: number;
  avg_duration_24h: number;
}

interface MetricsData {
  calls_last_24h: number;
  calls_last_1h: number;
  failed_last_24h: number;
  failed_last_1h: number;
}

interface SystemHealthGaugeProps {
  health?: HealthData;
  metrics?: MetricsData;
  isLoading?: boolean;
  title?: string;
}

export function SystemHealthGauge({
  health,
  metrics,
  isLoading,
  title = "System Health",
}: SystemHealthGaugeProps) {
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
          <div className="h-[200px] w-full animate-pulse bg-gray-100 rounded" />
        </CardContent>
      </Card>
    );
  }

  const status = health?.status || "healthy";
  const errorRate = health?.error_rate_1h || 0;

  const getStatusColor = () => {
    switch (status) {
      case "healthy":
        return "text-green-500";
      case "warning":
        return "text-yellow-500";
      case "critical":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusBg = () => {
    switch (status) {
      case "healthy":
        return "bg-green-100";
      case "warning":
        return "bg-yellow-100";
      case "critical":
        return "bg-red-100";
      default:
        return "bg-gray-100";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case "warning":
        return <AlertTriangle className="h-8 w-8 text-yellow-500" />;
      case "critical":
        return <XCircle className="h-8 w-8 text-red-500" />;
      default:
        return <Activity className="h-8 w-8 text-gray-500" />;
    }
  };

  // Calculate gauge angle (0-180 degrees)
  const gaugeAngle = Math.min(errorRate * 1.8, 180); // 100% = 180 degrees

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Activity className="h-5 w-5 text-blue-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Gauge Display */}
        <div className="flex flex-col items-center">
          <div className="relative w-48 h-24 overflow-hidden">
            {/* Background arc */}
            <div className="absolute w-48 h-48 rounded-full border-[16px] border-gray-200" />
            
            {/* Status indicator arc */}
            <div
              className={cn(
                "absolute w-48 h-48 rounded-full border-[16px] border-t-transparent border-r-transparent",
                status === "healthy" && "border-green-500",
                status === "warning" && "border-yellow-500",
                status === "critical" && "border-red-500"
              )}
              style={{
                transform: `rotate(${135 + gaugeAngle}deg)`,
                transition: "transform 1s ease-out",
              }}
            />
            
            {/* Center icon */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
              <div className={cn("p-3 rounded-full", getStatusBg())}>
                {getStatusIcon()}
              </div>
            </div>
          </div>

          {/* Status Label */}
          <div className="text-center mt-6">
            <div className={cn("text-2xl font-bold capitalize", getStatusColor())}>
              {status}
            </div>
            <div className="text-sm text-muted-foreground">
              {errorRate}% error rate (1h)
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mt-6 pt-4 border-t">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground">Active Sessions</div>
            <div className="text-xl font-bold">{health?.active_sessions || 0}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground">Avg Duration</div>
            <div className="text-xl font-bold">
              {health?.avg_duration_24h ? `${Math.round(health.avg_duration_24h / 60)}m` : "0m"}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground">Calls (24h)</div>
            <div className="text-xl font-bold">{metrics?.calls_last_24h || 0}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground">Failed (24h)</div>
            <div className="text-xl font-bold text-red-600">{metrics?.failed_last_24h || 0}</div>
          </div>
        </div>

        {/* Error Rate Comparison */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Error Rate (24h)</span>
            <span className={cn(
              "font-medium",
              (health?.error_rate_24h || 0) > 10 ? "text-red-600" : "text-green-600"
            )}>
              {health?.error_rate_24h || 0}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full mt-2 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                (health?.error_rate_24h || 0) > 20 ? "bg-red-500" :
                (health?.error_rate_24h || 0) > 10 ? "bg-yellow-500" : "bg-green-500"
              )}
              style={{ width: `${Math.min(health?.error_rate_24h || 0, 100)}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
