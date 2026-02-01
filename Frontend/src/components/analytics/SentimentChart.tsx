"use client";

import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Smile, Meh, Frown, TrendingUp, TrendingDown } from "lucide-react";

interface SentimentData {
  name: string;
  value: number;
  percentage: number;
}

interface SentimentChartProps {
  data: SentimentData[];
  total: number;
  sentimentScore: number;
  isLoading?: boolean;
  title?: string;
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#22c55e",
  neutral: "#f59e0b",
  negative: "#ef4444",
};

const SENTIMENT_ICONS: Record<string, React.ReactNode> = {
  positive: <Smile className="h-5 w-5 text-green-500" />,
  neutral: <Meh className="h-5 w-5 text-yellow-500" />,
  negative: <Frown className="h-5 w-5 text-red-500" />,
};

export function SentimentChart({
  data,
  total,
  sentimentScore,
  isLoading,
  title = "Sentiment Analysis",
}: SentimentChartProps) {
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

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smile className="h-5 w-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[300px] flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Meh className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No sentiment data available</p>
            <p className="text-xs mt-1">Sentiment analysis requires interaction data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-card border rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-2">
            {SENTIMENT_ICONS[item.name]}
            <span className="font-medium capitalize">{item.name}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {item.value.toLocaleString()} interactions ({item.percentage}%)
          </div>
        </div>
      );
    }
    return null;
  };

  const getScoreColor = (score: number) => {
    if (score > 20) return "text-green-500";
    if (score < -20) return "text-red-500";
    return "text-yellow-500";
  };

  const getScoreIcon = (score: number) => {
    if (score > 20) return <TrendingUp className="h-5 w-5 text-green-500" />;
    if (score < -20) return <TrendingDown className="h-5 w-5 text-red-500" />;
    return <Meh className="h-5 w-5 text-yellow-500" />;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Smile className="h-5 w-5 text-green-500" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            {getScoreIcon(sentimentScore)}
            <span className={`text-2xl font-bold ${getScoreColor(sentimentScore)}`}>
              {sentimentScore > 0 ? "+" : ""}
              {sentimentScore}
            </span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {total.toLocaleString()} total interactions analyzed
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.filter(d => d.value > 0)}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                paddingAngle={5}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={SENTIMENT_COLORS[entry.name] || "#888"}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Sentiment Breakdown */}
        <div className="space-y-3 mt-4">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-3">
              {SENTIMENT_ICONS[item.name]}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm capitalize">{item.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {item.value.toLocaleString()} ({item.percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: SENTIMENT_COLORS[item.name],
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
