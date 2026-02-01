"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    direction: "up" | "down" | "neutral";
  };
  color?: "default" | "green" | "red" | "blue" | "yellow" | "purple";
  isLoading?: boolean;
}

const colorClasses = {
  default: "text-gray-600",
  green: "text-green-600",
  red: "text-red-600",
  blue: "text-blue-600",
  yellow: "text-yellow-600",
  purple: "text-purple-600",
};

const iconBgClasses = {
  default: "bg-gray-100",
  green: "bg-green-100",
  red: "bg-red-100",
  blue: "bg-blue-100",
  yellow: "bg-yellow-100",
  purple: "bg-purple-100",
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = "default",
  isLoading,
}: StatsCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
              <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
            </div>
            <div className="h-12 w-12 bg-gray-200 rounded-full animate-pulse" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="flex items-baseline gap-2">
              <p className={cn("text-2xl font-bold", colorClasses[color])}>{value}</p>
              {trend && (
                <span
                  className={cn(
                    "flex items-center text-xs font-medium",
                    trend.direction === "up" && "text-green-600",
                    trend.direction === "down" && "text-red-600",
                    trend.direction === "neutral" && "text-gray-500"
                  )}
                >
                  {trend.direction === "up" && <TrendingUp className="h-3 w-3 mr-0.5" />}
                  {trend.direction === "down" && <TrendingDown className="h-3 w-3 mr-0.5" />}
                  {trend.direction === "neutral" && <Minus className="h-3 w-3 mr-0.5" />}
                  {trend.value}%
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={cn("p-3 rounded-full", iconBgClasses[color])}>
            <Icon className={cn("h-6 w-6", colorClasses[color])} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
