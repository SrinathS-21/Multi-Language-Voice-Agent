"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bot,
  Phone,
  FileText,
  Settings,
  Menu,
  ChevronLeft,
  Plug,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/store";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Agents", href: "/agents", icon: Bot },
  { name: "Integrations", href: "/integrations", icon: Plug },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Calls", href: "/calls", icon: Phone },
  { name: "Knowledge Base", href: "/kb", icon: FileText },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar } = useUIStore();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full bg-white border-r shadow-lg transition-all duration-300 lg:relative lg:z-0",
          sidebarOpen ? "w-64" : "w-0 lg:w-16"
        )}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b">
            {sidebarOpen && (
              <Link href="/dashboard" className="flex items-center gap-2">
                <Bot className="h-8 w-8 text-primary" />
                <span className="font-bold text-xl">VoiceAgent</span>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className={cn(sidebarOpen ? "" : "mx-auto")}
            >
              {sidebarOpen ? (
                <ChevronLeft className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {navigation.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-gray-100 hover:text-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {sidebarOpen && <span>{item.name}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          {sidebarOpen && (
            <div className="p-4 border-t">
              <p className="text-xs text-muted-foreground text-center">
                Voice Agent Dashboard v1.0
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
