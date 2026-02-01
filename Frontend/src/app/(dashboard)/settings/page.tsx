"use client";

import React from "react";
import { User, Bell, Shield, Palette, Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

// Coming Soon Badge component
const ComingSoonBadge = () => (
  <Badge variant="secondary" className="ml-2 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
    <Construction className="h-3 w-3 mr-1" />
    Coming Soon
  </Badge>
);

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and application preferences.
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Preferences
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <div className="flex items-center">
                <CardTitle>Profile Settings</CardTitle>
                <ComingSoonBadge />
              </div>
              <CardDescription>
                Update your personal information and account details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 opacity-60 pointer-events-none">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" placeholder="John" disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" placeholder="Doe" disabled />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="john@example.com" disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization">Organization</Label>
                <Input id="organization" placeholder="Acme Inc." disabled />
              </div>
              <Button disabled>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <div className="flex items-center">
                <CardTitle>Notification Preferences</CardTitle>
                <ComingSoonBadge />
              </div>
              <CardDescription>
                Configure how you want to receive notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 opacity-60 pointer-events-none">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Call Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications for incoming and completed calls
                  </p>
                </div>
                <input type="checkbox" className="h-4 w-4" defaultChecked disabled />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Agent Status Changes</p>
                  <p className="text-sm text-muted-foreground">
                    Get notified when agent status changes
                  </p>
                </div>
                <input type="checkbox" className="h-4 w-4" defaultChecked disabled />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Quota Alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Alert when call quota is running low
                  </p>
                </div>
                <input type="checkbox" className="h-4 w-4" defaultChecked disabled />
              </div>
              <Button disabled>Save Preferences</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* API Keys Tab */}
        <TabsContent value="api">
          <Card>
            <CardHeader>
              <div className="flex items-center">
                <CardTitle>API Keys</CardTitle>
                <ComingSoonBadge />
              </div>
              <CardDescription>
                Manage your API keys for programmatic access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 opacity-60 pointer-events-none">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">Production Key</p>
                  <Button variant="outline" size="sm" disabled>
                    Regenerate
                  </Button>
                </div>
                <code className="text-sm bg-gray-100 p-2 rounded block">
                  sk_live_••••••••••••••••••••••••
                </code>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">Development Key</p>
                  <Button variant="outline" size="sm" disabled>
                    Regenerate
                  </Button>
                </div>
                <code className="text-sm bg-gray-100 p-2 rounded block">
                  sk_test_••••••••••••••••••••••••
                </code>
              </div>
              <Button disabled>Create New Key</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences">
          <Card>
            <CardHeader>
              <div className="flex items-center">
                <CardTitle>Application Preferences</CardTitle>
                <ComingSoonBadge />
              </div>
              <CardDescription>
                Customize your dashboard experience.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 opacity-60 pointer-events-none">
              <div className="space-y-2">
                <Label>Theme</Label>
                <Select defaultValue="light" disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default Language</Label>
                <Select defaultValue="en" disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select defaultValue="ist" disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ist">IST (India Standard Time)</SelectItem>
                    <SelectItem value="utc">UTC</SelectItem>
                    <SelectItem value="pst">PST (Pacific Standard Time)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button disabled>Save Preferences</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
