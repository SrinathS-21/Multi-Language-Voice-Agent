"use client";

import React from "react";
import { Bot, Phone, FileText, Clock, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AgentCard, AgentCardSkeleton } from "@/components/agents/AgentCard";
import { useAgents } from "@/api/hooks";
import { useDashboardStore, useUIStore } from "@/store";

export default function DashboardPage() {
  const ORG_ID = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || process.env.DEFAULT_ORGANIZATION_ID || '';
  const { data: agentsResponse, isLoading: agentsLoading } = useAgents(ORG_ID);
  const agents = agentsResponse?.agents || [];
  
  const { stats, isLoading: statsLoading, fetchStats: _fetchStats } = useDashboardStore();
  const { openNewAgentModal, openOutboundCallModal } = useUIStore();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here's an overview of your voice agents.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openOutboundCallModal()}>
            <Phone className="h-4 w-4 mr-2" />
            Outbound Call
          </Button>
          <Button onClick={openNewAgentModal}>
            <Bot className="h-4 w-4 mr-2" />
            New Agent
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Agents"
          value={stats?.totalAgents || 0}
          subtitle={`${stats?.activeAgents || 0} active`}
          icon={Bot}
          loading={statsLoading}
        />
        <StatsCard
          title="Total Calls"
          value={stats?.totalCalls || 0}
          subtitle={`${stats?.callsToday || 0} today`}
          icon={Phone}
          loading={statsLoading}
        />
        <StatsCard
          title="Avg Duration"
          value={stats ? `${Math.floor(stats.averageCallDuration / 60)}:${(stats.averageCallDuration % 60).toString().padStart(2, "0")}` : "0:00"}
          subtitle="minutes per call"
          icon={Clock}
          loading={statsLoading}
        />
        <StatsCard
          title="Success Rate"
          value={`${stats?.successRate || 0}%`}
          subtitle="calls completed"
          icon={CheckCircle}
          loading={statsLoading}
          valueColor="text-green-600"
        />
      </div>

      {/* Agents Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Your Agents</h2>
          <Button variant="ghost" asChild>
            <a href="/agents">View All</a>
          </Button>
        </div>

        {agentsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <AgentCardSkeleton key={i} />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No agents yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first voice agent to get started.
              </p>
              <Button onClick={openNewAgentModal}>
                <Bot className="h-4 w-4 mr-2" />
                Create Agent
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.slice(0, 6).map((agent: any) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <QuickActionCard
          title="Make a Call"
          description="Start an outbound call using one of your agents"
          icon={Phone}
          action="Start Call"
          onClick={() => openOutboundCallModal()}
        />
        <QuickActionCard
          title="Create Agent"
          description="Set up a new voice agent with custom prompts"
          icon={Bot}
          action="New Agent"
          onClick={openNewAgentModal}
        />
        <QuickActionCard
          title="Upload Knowledge"
          description="Add documents to your agents' knowledge base"
          icon={FileText}
          action="Upload"
          href="/kb/upload"
        />
      </div>
    </div>
  );
}

// Stats Card Component
interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  valueColor?: string;
}

function StatsCard({ title, value, subtitle, icon: Icon, loading, valueColor }: StatsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <div className="h-8 w-20 bg-gray-200 rounded animate-pulse mb-1" />
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          </>
        ) : (
          <>
            <div className={`text-2xl font-bold ${valueColor || ""}`}>{value}</div>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Quick Action Card Component
interface QuickActionCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  action: string;
  onClick?: () => void;
  href?: string;
}

function QuickActionCard({
  title,
  description,
  icon: Icon,
  action,
  onClick,
  href,
}: QuickActionCardProps) {
  const content = (
    <Card className="hover:shadow-md transition-shadow cursor-pointer group">
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground mb-3">{description}</p>
            <Button variant="outline" size="sm">
              {action}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }

  return <div onClick={onClick}>{content}</div>;
}
