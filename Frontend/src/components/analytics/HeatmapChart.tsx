"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";

interface HourData {
  hour: number;
  count: number;
}

interface DayData {
  day: string;
  dayIndex: number;
  hours: HourData[];
}

interface HeatmapChartProps {
  data: DayData[];
  maxValue: number;
  totalCalls: number;
  isLoading?: boolean;
  title?: string;
}

export function HeatmapChart({
  data,
  maxValue,
  totalCalls,
  isLoading,
  title = "Call Activity Heatmap",
}: HeatmapChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full animate-pulse bg-gray-100 rounded" />
        </CardContent>
      </Card>
    );
  }

  const getColor = (count: number) => {
    if (count === 0) return "bg-gray-100";
    const intensity = Math.min(count / maxValue, 1);
    if (intensity < 0.25) return "bg-blue-100";
    if (intensity < 0.5) return "bg-blue-200";
    if (intensity < 0.75) return "bg-blue-400";
    return "bg-blue-600";
  };

  const getTextColor = (count: number) => {
    if (count === 0) return "text-gray-400";
    const intensity = Math.min(count / maxValue, 1);
    if (intensity > 0.5) return "text-white";
    return "text-gray-700";
  };

  // Find peak hour
  let peakDay = "";
  let peakHour = 0;
  let peakCount = 0;
  data.forEach((day) => {
    day.hours.forEach((hour) => {
      if (hour.count > peakCount) {
        peakCount = hour.count;
        peakHour = hour.hour;
        peakDay = day.day;
      }
    });
  });

  const formatHour = (hour: number) => {
    if (hour === 0) return "12am";
    if (hour === 12) return "12pm";
    if (hour < 12) return `${hour}am`;
    return `${hour - 12}pm`;
  };

  // Reorder to start from Monday
  const orderedDays = [...data.slice(1), data[0]]; // Move Sunday to end

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <CalendarDays className="h-5 w-5 text-blue-500" />
            {title}
          </CardTitle>
          {peakCount > 0 && (
            <div className="text-sm text-muted-foreground">
              Peak: <span className="font-medium">{peakDay} {formatHour(peakHour)}</span>{" "}
              ({peakCount} calls)
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {totalCalls.toLocaleString()} total calls • Calls by hour and day of week
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Hour labels */}
            <div className="flex mb-1">
              <div className="w-12" /> {/* Day label space */}
              {Array.from({ length: 24 }, (_, i) => (
                <div
                  key={i}
                  className="flex-1 text-center text-xs text-muted-foreground"
                  style={{ minWidth: "24px" }}
                >
                  {i % 3 === 0 ? formatHour(i) : ""}
                </div>
              ))}
            </div>

            {/* Heatmap grid */}
            <div className="space-y-1">
              {orderedDays.map((day) => (
                <div key={day.day} className="flex items-center">
                  <div className="w-12 text-xs text-muted-foreground font-medium">
                    {day.day}
                  </div>
                  <div className="flex flex-1 gap-[2px]">
                    {day.hours.map((hour) => (
                      <div
                        key={hour.hour}
                        className={`flex-1 h-6 rounded-sm flex items-center justify-center cursor-default transition-colors ${getColor(
                          hour.count
                        )} hover:ring-2 hover:ring-blue-300`}
                        style={{ minWidth: "24px" }}
                        title={`${day.day} ${formatHour(hour.hour)}: ${hour.count} calls`}
                      >
                        {hour.count > 0 && maxValue > 10 && hour.count >= maxValue * 0.5 && (
                          <span className={`text-[10px] font-medium ${getTextColor(hour.count)}`}>
                            {hour.count}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-2 mt-4">
              <span className="text-xs text-muted-foreground">Less</span>
              <div className="flex gap-1">
                <div className="w-4 h-4 rounded-sm bg-gray-100" />
                <div className="w-4 h-4 rounded-sm bg-blue-100" />
                <div className="w-4 h-4 rounded-sm bg-blue-200" />
                <div className="w-4 h-4 rounded-sm bg-blue-400" />
                <div className="w-4 h-4 rounded-sm bg-blue-600" />
              </div>
              <span className="text-xs text-muted-foreground">More</span>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-lg font-bold">
              {orderedDays.reduce(
                (max, day) => Math.max(max, day.hours.reduce((sum, h) => sum + h.count, 0)),
                0
              )}
            </div>
            <div className="text-xs text-muted-foreground">Busiest Day</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{formatHour(peakHour)}</div>
            <div className="text-xs text-muted-foreground">Peak Hour</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">
              {Math.round(totalCalls / 7)}
            </div>
            <div className="text-xs text-muted-foreground">Daily Average</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
