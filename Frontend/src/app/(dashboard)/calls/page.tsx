"use client";

import React, { useState } from "react";
import {
  Search,
  Phone,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Filter,
  Bot,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgents, useCalls } from "@/api/hooks";
import { CallLogDetail, CallListItem } from "@/components/calls/CallLogDetail";

const ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || process.env.DEFAULT_ORGANIZATION_ID || '';

export default function CallsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [selectedCall, setSelectedCall] = useState<any>(null);
  const [showCallDetail, setShowCallDetail] = useState(false);

  // Fetch calls from API
  const { data: callsResponse, isLoading: callsLoading } = useCalls({ 
    tenantId: ORG_ID,
    limit: 100 
  });
  const calls = callsResponse?.items || [];

  // Fetch agents for filter dropdown
  const { data: agentsResponse } = useAgents(ORG_ID);
  const agents = agentsResponse?.agents || [];

  const isLoading = callsLoading;

  // Transform calls to match CallSession format
  const transformedCalls = calls?.map((call) => ({
    _id: call.session_id,
    sessionId: call.session_id,
    agentId: call.agent_id,
    agentName: agents.find((a: any) => a._id === call.agent_id)?.name,
    callType: call.call_type || 'web',
    status: call.status as "active" | "completed" | "failed" | "expired",
    callerPhoneNumber: call.phone_number,
    destinationPhoneNumber: call.phone_number,
    startedAt: call.started_at || Date.now(),
    endedAt: call.ended_at,
    durationSeconds: call.duration_seconds,
    isTelephony: !!call.phone_number,
    transcript: [],
    transcriptLength: 0,
  })) || [];

  // Filter by search (adjusted for API response structure)
  const filteredCalls = transformedCalls?.filter((call) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      call.callerPhoneNumber?.toLowerCase().includes(searchLower) ||
      call.sessionId?.toLowerCase().includes(searchLower)
    );
  }) || [];

  // Stats
  const totalCalls = calls?.length || 0;
  const completedCalls = calls?.filter((c) => c.status === "completed").length || 0;
  const activeCalls = calls?.filter((c) => c.status === "active").length || 0;
  const failedCalls = calls?.filter((c) => c.status === "failed").length || 0;

  const handleViewCallDetails = (call: any) => {
    setSelectedCall(call);
    setShowCallDetail(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Phone className="h-7 w-7 text-blue-500" />
          Call History
        </h1>
        <p className="text-muted-foreground">
          View and manage all calls across your organization with full transcripts.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{totalCalls}</div>
                <p className="text-sm text-muted-foreground">Total Calls</p>
              </div>
              <Phone className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-600">{completedCalls}</div>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-600">{activeCalls}</div>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
              <AlertCircle className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600">{failedCalls}</div>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by phone number, agent, or session ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>

        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[180px]">
            <Bot className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents?.map((agent: any) => (
              <SelectItem key={agent._id} value={agent._id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        Showing {filteredCalls.length} of {totalCalls} calls
      </p>

      {/* Call List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="text-center py-12">
              <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No calls found</h3>
              <p className="text-muted-foreground">
                {search || statusFilter !== "all" || agentFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Call history will appear here once you start making calls."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCalls.map((call) => (
                <CallListItem
                  key={call._id}
                  call={call}
                  onClick={() => handleViewCallDetails(call)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call Detail Modal */}
      {selectedCall && (
        <CallLogDetail
          call={selectedCall}
          isOpen={showCallDetail}
          onClose={() => {
            setShowCallDetail(false);
            setSelectedCall(null);
          }}
        />
      )}
    </div>
  );
}
