"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plug, Sheet, Webhook, MessageSquare, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const INTEGRATIONS = [
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Export call transcripts and extracted data to Google Sheets automatically",
    icon: Sheet,
    iconColor: "text-green-600",
    iconBg: "bg-green-100 dark:bg-green-900/30",
    category: "Data Export",
    tags: ["Call Ended", "Transcript Ready"],
    installed: true,
    installs: 5,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send call summaries and notifications to Slack channels",
    icon: MessageSquare,
    iconColor: "text-purple-600",
    iconBg: "bg-purple-100 dark:bg-purple-900/30",
    category: "Notifications",
    tags: ["Coming Soon"],
    installed: false,
    installs: 0,
    comingSoon: true,
  },
  {
    id: "webhook",
    name: "Custom Webhook",
    description: "Send call data to any HTTP endpoint with custom payloads",
    icon: Webhook,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    category: "Developer Tools",
    tags: ["Coming Soon"],
    installed: false,
    installs: 0,
    comingSoon: true,
  },
];

export default function IntegrationsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const categories = ["All", "Data Export", "Notifications", "Developer Tools"];

  const filteredIntegrations = INTEGRATIONS.filter((integration) => {
    const matchesSearch = integration.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      integration.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "All" || integration.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const activeIntegrations = INTEGRATIONS.filter(i => i.installed).length;
  const totalExecutions = 0; // This would come from your backend

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Plug className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Integrations</h1>
              <p className="text-muted-foreground">
                Connect Arrow Multispeciality Hospital to external services
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{activeIntegrations}</div>
                <p className="text-xs text-muted-foreground">Active Integrations</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{totalExecutions}</div>
                <p className="text-xs text-muted-foreground">Total Executions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">{activeIntegrations}</div>
                <p className="text-xs text-muted-foreground">Active</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-red-600">0</div>
                <p className="text-xs text-muted-foreground">Errors</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search integrations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Tabs value={categoryFilter} onValueChange={setCategoryFilter} className="w-full sm:w-auto">
              <TabsList>
                {categories.map((category) => (
                  <TabsTrigger key={category} value={category} className="text-xs">
                    {category}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* Integrations Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredIntegrations.map((integration) => {
            const Icon = integration.icon;
            return (
              <Card key={integration.id} className="relative hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <div className={`p-2 ${integration.iconBg} rounded-lg`}>
                      <Icon className={`h-6 w-6 ${integration.iconColor}`} />
                    </div>
                    {integration.installed && (
                      <Badge variant="default" className="bg-green-500">Built-in</Badge>
                    )}
                    {integration.comingSoon && (
                      <Badge variant="secondary">Coming Soon</Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg">{integration.name}</CardTitle>
                  <CardDescription className="text-sm">
                    {integration.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <Badge variant="outline" className="text-xs">
                        {integration.category}
                      </Badge>
                    </div>
                    
                    {integration.tags && integration.tags.length > 0 && !integration.comingSoon && (
                      <div className="flex flex-wrap gap-1">
                        {integration.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {integration.installed && (
                      <p className="text-xs text-muted-foreground">
                        {integration.installs} install{integration.installs !== 1 ? 's' : ''}
                      </p>
                    )}

                    <Button
                      className="w-full"
                      variant={integration.installed ? "default" : "outline"}
                      disabled={integration.comingSoon}
                      onClick={() => {
                        if (!integration.comingSoon) {
                          router.push(`/integrations/${integration.id}`);
                        }
                      }}
                    >
                      {integration.comingSoon ? (
                        "Coming Soon"
                      ) : integration.installed ? (
                        <>
                          <Plug className="h-4 w-4 mr-2" />
                          Configure
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Integration
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filteredIntegrations.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No integrations found matching your search</p>
            <Button variant="outline" onClick={() => setSearchQuery("")}>
              Clear Search
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
