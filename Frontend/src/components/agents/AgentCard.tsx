"use client";

import React from "react";
import Link from "next/link";
import { Phone, MoreVertical, Power, Trash2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Agent, SUPPORTED_LANGUAGES, STATUS_COLORS } from "@/types";
import { useUIStore, useAgentStore } from "@/store";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { agentApi } from "@/api/endpoints";

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const { openOutboundCallModal } = useUIStore();
  const { toggleAgentStatus, deleteAgent } = useAgentStore();
  const [showMenu, setShowMenu] = React.useState(false);
  const [phoneValidation, setPhoneValidation] = React.useState<{
    valid: boolean;
    warning: string | null;
    conflictingAgents: Array<{ id: string; name: string; status: string }>;
  } | null>(null);
  const confirm = useConfirmDialog();

  // Validate phone number conflicts when agent is active and has a phone number
  React.useEffect(() => {
    if (agent.status === 'active' && agent.phoneNumber) {
      agentApi.validatePhoneNumber(agent.id)
        .then(setPhoneValidation)
        .catch(err => console.error('Phone validation failed:', err));
    } else {
      setPhoneValidation(null);
    }
  }, [agent.id, agent.status, agent.phoneNumber]);

  const handleCall = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openOutboundCallModal(agent.id);
  };

  const handleToggleStatus = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await toggleAgentStatus(agent.id);
    setShowMenu(false);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const confirmed = await confirm.show({
      title: "Delete Agent",
      description: (
        <>
          Are you sure you want to delete <strong>{agent.name}</strong>?
          <br />
          <span className="text-xs text-muted-foreground mt-2 block">
            This will remove all associated data including calls and knowledge base documents.
          </span>
        </>
      ),
      confirmText: "Delete",
      variant: "destructive",
    });
    
    if (confirmed) {
      await deleteAgent(agent.id);
    }
    setShowMenu(false);
  };

  return (
    <>
      {confirm.dialog}
      <Link href={`/agents/${agent.id}`}>
      <Card className="group hover:shadow-lg transition-all duration-200 cursor-pointer border-2 hover:border-primary/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {/* Status indicator */}
              <div className="relative">
                <div
                  className={cn(
                    "w-3 h-3 rounded-full",
                    STATUS_COLORS[agent.status]
                  )}
                />
                {agent.status === "active" && (
                  <div
                    className={cn(
                      "absolute inset-0 w-3 h-3 rounded-full animate-pulse-ring",
                      STATUS_COLORS[agent.status]
                    )}
                  />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                  {agent.name}
                </h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="secondary" className="text-xs">
                    {SUPPORTED_LANGUAGES[agent.language]}
                  </Badge>
                  <Badge
                    variant={agent.status as "active" | "inactive" | "busy" | "error"}
                    className="text-xs capitalize"
                  >
                    {agent.status}
                  </Badge>
                  {/* Phone conflict warning */}
                  {phoneValidation && !phoneValidation.valid && (
                    <Badge variant="destructive" className="text-xs flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {phoneValidation.conflictingAgents.length} conflict{phoneValidation.conflictingAgents.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
                {/* Warning message for phone conflicts */}
                {phoneValidation && !phoneValidation.valid && phoneValidation.warning && (
                  <div className="mt-2 text-xs text-orange-600 dark:text-orange-400 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    <span>{phoneValidation.warning}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions menu */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>

              {showMenu && (
                <div className="absolute right-0 top-8 z-10 bg-white border rounded-lg shadow-lg py-1 min-w-[150px]">
                  <button
                    onClick={handleToggleStatus}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100"
                  >
                    <Power className="h-4 w-4" />
                    {agent.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-100 text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {agent.systemPrompt}
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Phone className="h-4 w-4" />
                {agent.numberOfCalls} calls
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCall}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Phone className="h-4 w-4 mr-1" />
                Call
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
    </>
  );
}

// Loading skeleton
export function AgentCardSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-gray-200" />
            <div>
              <div className="h-5 w-32 bg-gray-200 rounded mb-2" />
              <div className="flex gap-2">
                <div className="h-5 w-16 bg-gray-200 rounded" />
                <div className="h-5 w-16 bg-gray-200 rounded" />
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-4 w-full bg-gray-200 rounded mb-2" />
        <div className="h-4 w-3/4 bg-gray-200 rounded mb-4" />
        <div className="flex justify-between">
          <div className="h-4 w-24 bg-gray-200 rounded" />
          <div className="h-8 w-20 bg-gray-200 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}
