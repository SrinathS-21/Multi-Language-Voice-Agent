/**
 * React Query Provider
 * Sets up production-grade caching and data fetching
 */

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// Production-grade QueryClient configuration
const queryClientConfig = {
  defaultOptions: {
    queries: {
      // Data stays fresh for 30 seconds before refetch
      staleTime: 30000,
      // Cache data for 5 minutes
      gcTime: 300000,
      // Retry failed requests 3 times
      retry: 3,
      // Retry with exponential backoff
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Refetch on window focus in production
      refetchOnWindowFocus: process.env.NODE_ENV === "production",
    },
    mutations: {
      // Retry mutations once
      retry: 1,
    },
  },
};

export function QueryProvider({ children }: { children: ReactNode }) {
  // Create QueryClient inside component to avoid sharing between requests
  const [queryClient] = useState(() => new QueryClient(queryClientConfig));

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
