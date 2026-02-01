"use client";

import React, { useState } from "react";
import {
  Phone,
  Clock,
  User,
  Bot,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  PhoneIncoming,
  PhoneOutgoing,
  Globe,
  Wrench,
  Calendar,
  Timer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface TranscriptEntry {
  timestamp: number;
  speaker: "user" | "agent" | "system";
  text: string;
  type?: "speech" | "function_call" | "function_result";
  metadata?: {
    functionName?: string;
    latencyMs?: number;
    confidence?: number;
  };
}

interface CallSession {
  _id: string;
  sessionId: string;
  agentId?: string;
  agentName?: string;
  callType: "inbound" | "outbound" | "web";
  status: "active" | "completed" | "failed" | "expired";
  callerPhoneNumber?: string;
  destinationPhoneNumber?: string;
  startedAt: number;
  endedAt?: number;
  durationSeconds?: number;
  isTelephony?: boolean;
  transcript?: TranscriptEntry[];
  transcriptLength?: number;
}

interface CallLogDetailProps {
  call: CallSession;
  isOpen: boolean;
  onClose: () => void;
  isLoadingTranscript?: boolean;
}

export function CallLogDetail({ call, isOpen, onClose, isLoadingTranscript = false }: CallLogDetailProps) {
  const [expandedTranscript, setExpandedTranscript] = useState(true);

  const formatTime = (timestamp?: number) => {
    if (!timestamp || timestamp === 0) return "--";
    try {
      return new Date(timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "--";
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp || timestamp === 0) return "--";
    try {
      return new Date(timestamp).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "--";
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds === 0) return "--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const getCallTypeIcon = () => {
    switch (call.callType) {
      case "inbound":
        return <PhoneIncoming className="h-4 w-4" />;
      case "outbound":
        return <PhoneOutgoing className="h-4 w-4" />;
      case "web":
        return <Globe className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700";
      case "active":
        return "bg-blue-100 text-blue-700";
      case "failed":
        return "bg-red-100 text-red-700";
      case "expired":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  const getSpeakerIcon = (speaker: string) => {
    switch (speaker) {
      case "user":
        return <User className="h-4 w-4" />;
      case "agent":
        return <Bot className="h-4 w-4" />;
      case "system":
        return <Wrench className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getSpeakerColor = (speaker: string) => {
    switch (speaker) {
      case "user":
        return "bg-blue-50 border-blue-200";
      case "agent":
        return "bg-purple-50 border-purple-200";
      case "system":
        return "bg-gray-50 border-gray-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                Call Details
                <Badge className={cn("text-xs", getStatusColor(call.status))}>
                  {call.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground font-normal">
                Session: {call.sessionId ? call.sessionId.slice(0, 8) : call._id?.slice(0, 8) || 'N/A'}...
              </p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Detailed information about this call including duration, timestamps, and conversation transcript
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="space-y-4 pr-4">
            {/* Call Info Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  {getCallTypeIcon()}
                  Call Type
                </div>
                <div className="font-semibold capitalize">{call.callType}</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Bot className="h-3 w-3" />
                  Agent
                </div>
                <div className="font-semibold text-sm truncate">{call.agentName || "N/A"}</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <Timer className="h-3 w-3" />
                  Duration
                </div>
                <div className="font-semibold text-sm">{formatDuration(call.durationSeconds)}</div>
              </Card>
              <Card className="p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <MessageSquare className="h-3 w-3" />
                  Messages
                </div>
                <div className="font-semibold">{call.transcript?.length || call.transcriptLength || 0}</div>
              </Card>
            </div>

            {/* Phone Numbers */}
            {(call.callerPhoneNumber || call.destinationPhoneNumber) && (
              <Card className="p-4">
                <div className="flex items-center gap-4">
                  {call.callerPhoneNumber && (
                    <div>
                      <div className="text-xs text-muted-foreground">From</div>
                      <div className="font-mono font-medium">{call.callerPhoneNumber}</div>
                    </div>
                  )}
                  {call.callerPhoneNumber && call.destinationPhoneNumber && (
                    <div className="text-muted-foreground">→</div>
                  )}
                  {call.destinationPhoneNumber && (
                    <div>
                      <div className="text-xs text-muted-foreground">To</div>
                      <div className="font-mono font-medium">{call.destinationPhoneNumber}</div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Timestamps */}
            <Card className="p-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Calendar className="h-3 w-3" />
                    Started
                  </div>
                  <div className="font-medium">{formatDate(call.startedAt)}</div>
                  <div className="text-sm text-muted-foreground">{formatTime(call.startedAt)}</div>
                </div>
                {call.endedAt && (
                  <div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Clock className="h-3 w-3" />
                      Ended
                    </div>
                    <div className="font-medium">{formatDate(call.endedAt)}</div>
                    <div className="text-sm text-muted-foreground">{formatTime(call.endedAt)}</div>
                  </div>
                )}
              </div>
            </Card>

            {/* Transcript */}
            <Card>
              <CardHeader className="py-3">
                <Button
                  variant="ghost"
                  className="w-full flex items-center justify-between p-0 h-auto hover:bg-transparent"
                  onClick={() => setExpandedTranscript(!expandedTranscript)}
                >
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Transcript
                    {call.transcript && (
                      <Badge variant="secondary" className="ml-2">
                        {call.transcript.length} messages
                      </Badge>
                    )}
                  </CardTitle>
                  {expandedTranscript ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CardHeader>
              {expandedTranscript && (
                <CardContent className="pt-0">
                  {isLoadingTranscript ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                        <p className="text-sm text-muted-foreground">Loading transcript...</p>
                      </div>
                    </div>
                  ) : call.transcript && call.transcript.length > 0 ? (
                    <div className="space-y-3">
                      {call.transcript.map((entry, index) => (
                        <div
                          key={`${entry.timestamp || index}-${entry.speaker}-${entry.text.substring(0, 20)}`}
                          className={cn(
                            "p-3 rounded-lg border",
                            getSpeakerColor(entry.speaker)
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getSpeakerIcon(entry.speaker)}
                              <span className="font-medium capitalize text-sm">
                                {entry.speaker}
                              </span>
                              {entry.type === "function_call" && (
                                <Badge variant="outline" className="text-xs">
                                  Function: {entry.metadata?.functionName}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(entry.timestamp)}
                              {entry.metadata?.latencyMs && (
                                <span className="ml-2 text-orange-600">
                                  {entry.metadata.latencyMs}ms
                                </span>
                              )}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{entry.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No transcript available for this call</p>
                      <p className="text-xs mt-1">
                        Transcripts are saved when calls complete
                      </p>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// Compact call list item for use in lists
interface CallListItemProps {
  call: CallSession;
  onClick: () => void;
}

export function CallListItem({ call, onClick }: CallListItemProps) {
  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return new Date(timestamp).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
    if (hours > 0) {
      return `${hours}h ago`;
    }
    const mins = Math.floor(diff / (1000 * 60));
    return mins > 0 ? `${mins}m ago` : "Just now";
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "active":
        return "bg-blue-500 animate-pulse";
      case "failed":
        return "bg-red-500";
      case "expired":
        return "bg-gray-400";
      default:
        return "bg-gray-400";
    }
  };

  const getCallTypeIcon = () => {
    switch (call.callType) {
      case "inbound":
        return <PhoneIncoming className="h-4 w-4 text-green-600" />;
      case "outbound":
        return <PhoneOutgoing className="h-4 w-4 text-blue-600" />;
      case "web":
        return <Globe className="h-4 w-4 text-purple-600" />;
    }
  };

  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="p-2 bg-gray-100 rounded-full">
            {getCallTypeIcon()}
          </div>
          <div
            className={cn(
              "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white",
              getStatusColor(call.status)
            )}
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {call.callerPhoneNumber || call.destinationPhoneNumber || call.agentName || "Web Call"}
            </span>
            {call.transcriptLength && call.transcriptLength > 0 && (
              <Badge variant="secondary" className="text-xs">
                {call.transcriptLength} msgs
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="capitalize">{call.callType}</span>
            {call.agentName && <span>• {call.agentName}</span>}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-medium">{formatDuration(call.durationSeconds)}</div>
        <div className="text-sm text-muted-foreground">{formatTime(call.startedAt)}</div>
      </div>
    </div>
  );
}
