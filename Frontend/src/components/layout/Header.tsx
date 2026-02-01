"use client";

import React from "react";
import { Plus, Phone, Bell, User, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/store";

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { openNewAgentModal, openOutboundCallModal, toggleSidebar } = useUIStore();

  return (
    <header className="sticky top-0 z-30 h-16 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={toggleSidebar}
          >
            <Menu className="h-5 w-5" />
          </Button>
          {title && <h1 className="text-xl font-semibold">{title}</h1>}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => openOutboundCallModal()}>
            <Phone className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Outbound Call</span>
          </Button>
          <Button onClick={openNewAgentModal}>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">New Agent</span>
          </Button>

          <div className="hidden md:flex items-center gap-2 ml-4 border-l pl-4">
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
