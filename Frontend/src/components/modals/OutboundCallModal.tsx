"use client";

import React, { useState, useEffect } from "react";
import { Phone, Loader2, AlertCircle, CheckCircle, PhoneCall } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUIStore, useAgentStore, useCallStore } from "@/store";
import { cn } from "@/lib/utils";

export function OutboundCallModal() {
  const { isOutboundCallModalOpen, closeOutboundCallModal, selectedAgentForCall } = useUIStore();
  const { agents, fetchAgents } = useAgentStore();
  const { initiateCall, activeCall, isLoading } = useCallStore();

  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [fromNumber, setFromNumber] = useState("+919876543210");
  const [toNumber, setToNumber] = useState("");
  const [callState, setCallState] = useState<"idle" | "calling" | "connected" | "ended">("idle");

  useEffect(() => {
    if (isOutboundCallModalOpen && agents.length === 0) {
      fetchAgents();
    }
  }, [isOutboundCallModalOpen, agents.length, fetchAgents]);

  useEffect(() => {
    if (selectedAgentForCall) {
      setSelectedAgent(selectedAgentForCall);
    }
  }, [selectedAgentForCall]);

  useEffect(() => {
    if (activeCall) {
      if (activeCall.status === "ringing") {
        setCallState("calling");
      } else if (activeCall.status === "in-progress") {
        setCallState("connected");
      } else if (activeCall.status === "completed" || activeCall.status === "failed") {
        setCallState("ended");
      }
    }
  }, [activeCall]);

  const handleInitiateCall = async () => {
    if (!selectedAgent || !toNumber) return;

    setCallState("calling");
    await initiateCall({
      agentId: selectedAgent,
      fromNumber,
      toNumber,
    });
  };

  const handleClose = () => {
    closeOutboundCallModal();
    setCallState("idle");
    setSelectedAgent("");
    setToNumber("");
  };

  const isValidPhone = (phone: string) => {
    return /^\+?[1-9]\d{9,14}$/.test(phone.replace(/\s/g, ""));
  };

  const canInitiate = selectedAgent && isValidPhone(toNumber) && callState === "idle";

  return (
    <Dialog open={isOutboundCallModalOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Outbound Call
          </DialogTitle>
          <DialogDescription>
            Select an agent and enter the target phone number to initiate a call.
          </DialogDescription>
        </DialogHeader>

        {/* Call Status Display */}
        {callState !== "idle" && (
          <div
            className={cn(
              "rounded-lg p-6 text-center",
              callState === "calling" && "bg-blue-50",
              callState === "connected" && "bg-green-50",
              callState === "ended" && "bg-gray-50"
            )}
          >
            <div className="mb-4">
              {callState === "calling" && (
                <>
                  <div className="relative inline-block">
                    <PhoneCall className="h-12 w-12 text-blue-500 animate-pulse" />
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-blue-500"></span>
                    </span>
                  </div>
                  <p className="text-lg font-medium mt-4">Calling...</p>
                  <p className="text-sm text-muted-foreground">{toNumber}</p>
                </>
              )}
              {callState === "connected" && (
                <>
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                  <p className="text-lg font-medium mt-4 text-green-700">Connected</p>
                  <p className="text-sm text-muted-foreground">Call in progress with {toNumber}</p>
                </>
              )}
              {callState === "ended" && (
                <>
                  <Phone className="h-12 w-12 text-gray-500 mx-auto" />
                  <p className="text-lg font-medium mt-4">Call Ended</p>
                  <p className="text-sm text-muted-foreground">
                    {activeCall?.status === "completed" ? "Call completed successfully" : "Call failed"}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        {callState === "idle" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent">Select Agent</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents
                    .filter((a) => a.status === "active")
                    .map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {agents.filter((a) => a.status === "active").length === 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  No active agents available
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fromNumber">From Number</Label>
              <Input
                id="fromNumber"
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                placeholder="+919876543210"
              />
              <p className="text-xs text-muted-foreground">Your registered caller ID</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="toNumber">Target Phone Number</Label>
              <Input
                id="toNumber"
                value={toNumber}
                onChange={(e) => setToNumber(e.target.value)}
                placeholder="+91XXXXXXXXXX"
              />
              {toNumber && !isValidPhone(toNumber) && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Please enter a valid phone number
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {callState === "idle" ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleInitiateCall} disabled={!canInitiate || isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Phone className="mr-2 h-4 w-4" />
                Start Call
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>
              {callState === "ended" ? "Close" : "Close & Continue in Background"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
