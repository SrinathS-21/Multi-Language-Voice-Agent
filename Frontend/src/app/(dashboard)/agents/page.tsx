"use client";

import React, { useState } from "react";
import { Bot, Search, Grid, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AgentCard, AgentCardSkeleton } from "@/components/agents/AgentCard";
import { useAgents } from "@/api/hooks";
import { useUIStore } from "@/store";
import { AgentStatus, SUPPORTED_LANGUAGES } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export default function AgentsPage() {
  const ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || process.env.DEFAULT_ORGANIZATION_ID || '';
  // Fetch agents from API
  const { data: agentsResponse, isLoading } = useAgents(ORG_ID);
  const agents = agentsResponse?.agents || [];
  
  const { openNewAgentModal } = useUIStore();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgentStatus | "all">("all");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredAgents = agents.filter((agent: any) => {
    const matchesSearch = agent.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || agent.status === statusFilter;
    const matchesLanguage = languageFilter === "all" || agent.language === languageFilter;
    return matchesSearch && matchesStatus && matchesLanguage;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-muted-foreground">
            Manage your voice agents and their configurations.
          </p>
        </div>
        <Button onClick={openNewAgentModal}>
          <Bot className="h-4 w-4 mr-2" />
          New Agent
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v as AgentStatus | "all")}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="busy">Busy</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        <Select value={languageFilter} onValueChange={setLanguageFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Languages</SelectItem>
            {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
              <SelectItem key={code} value={code}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex border rounded-md">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("grid")}
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        Showing {filteredAgents.length} of {agents.length} agents
      </p>

      {/* Agents Grid/List */}
      {isLoading ? (
        <div className={cn(
          viewMode === "grid"
            ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            : "space-y-4"
        )}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <AgentCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="text-center py-12">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No agents found</h3>
          <p className="text-muted-foreground mb-4">
            {search || statusFilter !== "all" || languageFilter !== "all"
              ? "Try adjusting your filters"
              : "Create your first agent to get started"}
          </p>
          {!search && statusFilter === "all" && languageFilter === "all" && (
            <Button onClick={openNewAgentModal}>
              <Bot className="h-4 w-4 mr-2" />
              Create Agent
            </Button>
          )}
        </div>
      ) : (
        <div className={cn(
          viewMode === "grid"
            ? "grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            : "space-y-4"
        )}>
          {filteredAgents.map((agent: any) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
