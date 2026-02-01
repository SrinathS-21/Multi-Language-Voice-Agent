"use client";

import React from "react";
import { Sidebar, Header } from "@/components/layout";
import { NewAgentModal } from "@/components/modals/NewAgentModal";
import { OutboundCallModal } from "@/components/modals/OutboundCallModal";
import { useUIStore } from "@/store";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarOpen: _sidebarOpen } = useUIStore();

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className={cn("flex-1 flex flex-col overflow-hidden")}>
        <Header />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      {/* Global Modals */}
      <NewAgentModal />
      <OutboundCallModal />
    </div>
  );
}
