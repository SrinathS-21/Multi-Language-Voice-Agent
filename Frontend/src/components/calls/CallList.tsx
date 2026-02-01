"use client";

import React from "react";
import { Phone, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Call, CallStatus } from "@/types";
import { formatDateTime, formatDuration, formatPhoneNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface CallListProps {
  calls: Call[];
  isLoading?: boolean;
  onViewDetails?: (call: Call) => void;
}

export function CallList({ calls, isLoading, onViewDetails }: CallListProps) {
  if (isLoading) {
    return <CallListSkeleton />;
  }

  if (calls.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No calls yet</h3>
          <p className="text-muted-foreground">
            Call history will appear here once you start making calls.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Call History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {calls.map((call) => (
            <CallItem key={call.id} call={call} onViewDetails={onViewDetails} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface CallItemProps {
  call: Call;
  onViewDetails?: (call: Call) => void;
}

function CallItem({ call, onViewDetails }: CallItemProps) {
  const statusIcon = getStatusIcon(call.status);
  const statusColor = getStatusTextColor(call.status);

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-4">
        <div className={cn("p-2 rounded-full", getStatusBgColor(call.status))}>
          {statusIcon}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{formatPhoneNumber(call.toNumber)}</span>
            <Badge variant="outline" className={cn("text-xs capitalize", statusColor)}>
              {call.status.replace("-", " ")}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDateTime(call.timestamp)}
            </span>
            {call.duration && (
              <span>Duration: {formatDuration(call.duration)}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {call.transcript && call.transcript.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {call.transcript.length} messages
          </Badge>
        )}
        {onViewDetails && (
          <Button variant="ghost" size="sm" onClick={() => onViewDetails(call)}>
            View Details
          </Button>
        )}
      </div>
    </div>
  );
}

function getStatusIcon(status: CallStatus) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "in-progress":
      return <Phone className="h-4 w-4 text-green-500 animate-pulse" />;
    case "ringing":
      return <Phone className="h-4 w-4 text-blue-500 animate-bounce" />;
    default:
      return <AlertCircle className="h-4 w-4 text-gray-500" />;
  }
}

function getStatusTextColor(status: CallStatus) {
  switch (status) {
    case "completed":
      return "text-green-600";
    case "failed":
      return "text-red-600";
    case "in-progress":
      return "text-green-500";
    case "ringing":
      return "text-blue-500";
    default:
      return "text-gray-500";
  }
}

function getStatusBgColor(status: CallStatus) {
  switch (status) {
    case "completed":
      return "bg-green-100";
    case "failed":
      return "bg-red-100";
    case "in-progress":
      return "bg-green-50";
    case "ringing":
      return "bg-blue-100";
    default:
      return "bg-gray-100";
  }
}

function CallListSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
                <div>
                  <div className="h-5 w-32 bg-gray-200 rounded mb-2 animate-pulse" />
                  <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Call Detail Modal Component
interface CallDetailProps {
  call: Call;
  onClose: () => void;
}

export function CallDetail({ call, onClose: _onClose }: CallDetailProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground">From</label>
          <p className="font-mono">{formatPhoneNumber(call.fromNumber)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">To</label>
          <p className="font-mono">{formatPhoneNumber(call.toNumber)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Status</label>
          <Badge variant={call.status === "completed" ? "success" : "secondary"} className="mt-1">
            {call.status}
          </Badge>
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Duration</label>
          <p>{call.duration ? formatDuration(call.duration) : "—"}</p>
        </div>
      </div>

      {call.transcript && call.transcript.length > 0 && (
        <div className="mt-6">
          <h4 className="font-medium mb-3">Transcript</h4>
          <div className="space-y-3 max-h-64 overflow-y-auto bg-gray-50 rounded-lg p-4">
            {call.transcript.map((entry, index) => (
              <div
                key={index}
                className={cn(
                  "p-3 rounded-lg max-w-[80%]",
                  entry.role === "agent"
                    ? "bg-primary text-primary-foreground ml-auto"
                    : "bg-white border"
                )}
              >
                <p className="text-xs opacity-70 mb-1 capitalize">{entry.role}</p>
                <p className="text-sm">{entry.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
