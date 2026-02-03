/**
 * API Hooks
 *
 * React hooks for data fetching and mutations with the backend API.
 * Provides loading states, error handling, and automatic refetching.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  agentApi,
  callApi,
  knowledgeApi,
  analyticsApi,
  integrationApi,
  healthApi,
  organizationApi,
  ApiError,
  type ListAgentsResponse,
  type AgentResponse,
  type ListCallsResponse,
  type TranscriptResponse,
  type ListDocumentsResponse,
  type AnalyticsResponse,
  type HealthResponse,
} from '@/api/endpoints';
import { getDefaultTenantId } from '@/api/config';

// =============================================================================
// Types
// =============================================================================

interface UseQueryResult<T> {
  data: T | null;
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => Promise<void>;
}

interface UseMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => Promise<TData>;
  data: TData | null;
  isLoading: boolean;
  error: ApiError | null;
  reset: () => void;
}

// =============================================================================
// Base Hook
// =============================================================================

/**
 * Generic query hook
 */
function useQuery<T>(
  queryFn: () => Promise<T>,
  deps: unknown[] = [],
  options?: { enabled?: boolean }
): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(options?.enabled !== false);
  const [error, setError] = useState<ApiError | null>(null);
  const mountedRef = useRef(true);
  const enabled = options?.enabled !== false;

  const fetch = useCallback(async () => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      const result = await queryFn();
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof ApiError ? err : new ApiError(500, String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [...deps, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    fetch();

    return () => {
      mountedRef.current = false;
    };
  }, [fetch]);

  return { data, isLoading, error, refetch: fetch };
}

/**
 * Generic mutation hook
 */
function useMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>
): UseMutationResult<TData, TVariables> {
  const [data, setData] = useState<TData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await mutationFn(variables);
        setData(result);
        return result;
      } catch (err) {
        const apiError = err instanceof ApiError ? err : new ApiError(500, String(err));
        setError(apiError);
        throw apiError;
      } finally {
        setIsLoading(false);
      }
    },
    [mutationFn]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return { mutate, data, isLoading, error, reset };
}

// =============================================================================
// Health Hooks
// =============================================================================

export function useHealthCheck() {
  return useQuery<HealthResponse>(() => healthApi.check(), []);
}

export function useReadyCheck() {
  return useQuery<HealthResponse>(() => healthApi.ready(), []);
}

// =============================================================================
// Agent Hooks
// =============================================================================

export function useAgents(tenantId?: string) {
  const tid = tenantId || getDefaultTenantId();
  return useQuery<ListAgentsResponse>(() => agentApi.list(tid), [tid]);
}

export function useAgent(id: string) {
  return useQuery<AgentResponse>(() => agentApi.getById(id), [id]);
}

export function useCreateAgent() {
  return useMutation((data: {
    name: string;
    language?: string;
    voice?: string;
    config?: Record<string, unknown>;
    aiPersonaName?: string;
    systemPrompt?: string;
    greeting?: string;
    farewell?: string;
    phoneCountryCode?: string;
    phoneNumber?: string;
    phoneLocation?: string;
    tenant_id?: string;
  }) => {
    return agentApi.create({
      tenant_id: data.tenant_id || getDefaultTenantId(),
      name: data.name,
      system_prompt: data.systemPrompt,
      config: data.config,
      ai_persona_name: data.aiPersonaName,
      greeting: data.greeting,
      farewell: data.farewell,
      language: data.language,
      phone_country_code: data.phoneCountryCode,
      phone_number: data.phoneNumber,
      phone_location: data.phoneLocation,
    });
  });
}

export function useUpdateAgent() {
  return useMutation(({ id, data }: { id: string; data: Parameters<typeof agentApi.update>[1] }) =>
    agentApi.update(id, data)
  );
}

export function useUpdateAgentStatus() {
  return useMutation(({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
    agentApi.updateStatus(id, status)
  );
}

export function useDeleteAgent() {
  return useMutation((id: string) => agentApi.delete(id));
}

// =============================================================================
// Call Hooks
// =============================================================================

export function useCalls(params?: { tenantId?: string; agentId?: string; limit?: number; offset?: number }) {
  const tenantId = params?.tenantId || getDefaultTenantId();
  return useQuery<ListCallsResponse>(
    () => callApi.list({ tenantId, agentId: params?.agentId, limit: params?.limit, offset: params?.offset }),
    [tenantId, params?.agentId, params?.limit, params?.offset]
  );
}

export function useCall(sessionId: string) {
  return useQuery(() => callApi.getById(sessionId), [sessionId]);
}

export function useCallTranscript(sessionId: string) {
  return useQuery<TranscriptResponse>(
    () => callApi.getTranscript(sessionId), 
    [sessionId],
    { enabled: !!sessionId } // Only fetch when sessionId is provided
  );
}

export function useInitiateOutboundCall() {
  return useMutation(callApi.initiateOutbound);
}

// =============================================================================
// Knowledge Base Hooks
// =============================================================================

export function useDocuments(agentId: string) {
  return useQuery<ListDocumentsResponse>(
    () => knowledgeApi.listDocuments(agentId),
    [agentId]
  );
}

export function useUploadDocument() {
  return useMutation(
    ({ agentId, file, sourceType }: { agentId: string; file: File; sourceType?: string }) =>
      knowledgeApi.uploadDocument(agentId, file, sourceType)
  );
}

export function useDeleteDocument() {
  return useMutation((documentId: string) => knowledgeApi.deleteDocument(documentId));
}

// =============================================================================
// Analytics Hooks
// =============================================================================

export function useAnalytics(params: { tenantId: string; agentId?: string }) {
  return useQuery<AnalyticsResponse>(
    () => analyticsApi.getOverview(params),
    [params.tenantId, params.agentId]
  );
}

export function useAgentAnalytics(agentId: string) {
  return useQuery(() => analyticsApi.getAgentAnalytics(agentId), [agentId]);
}

// =============================================================================
// Integration Hooks
// =============================================================================

export function useAvailableTools(activeOnly = true) {
  return useQuery(() => integrationApi.listAvailable(activeOnly), [activeOnly]);
}

export function useAgentIntegrations(agentId: string) {
  return useQuery(() => integrationApi.listAgentIntegrations(agentId), [agentId]);
}

export function useConfigureIntegration() {
  return useMutation(integrationApi.configure);
}

export function useDeleteIntegration() {
  return useMutation(integrationApi.delete);
}

// =============================================================================
// Chart Analytics Hooks
// =============================================================================

export function useCallVolumeChart(params: { tenantId: string; agentId?: string; days?: number }) {
  return useQuery(
    () => analyticsApi.getCallVolumeChart(params),
    [params.tenantId, params.agentId, params.days]
  );
}

export function useStatusDistribution(params: { tenantId: string; agentId?: string; days?: number }) {
  return useQuery(
    () => analyticsApi.getStatusDistribution(params),
    [params.tenantId, params.agentId, params.days]
  );
}

export function useLatencyTrends(params: { tenantId: string; agentId?: string; days?: number }) {
  return useQuery(
    () => analyticsApi.getLatencyTrends(params),
    [params.tenantId, params.agentId, params.days]
  );
}

export function useDurationDistribution(params: { tenantId: string; agentId?: string; days?: number }) {
  return useQuery(
    () => analyticsApi.getDurationDistribution(params),
    [params.tenantId, params.agentId, params.days]
  );
}

export function useFunctionCalls(params: { tenantId: string; agentId?: string; days?: number }) {
  return useQuery(
    () => analyticsApi.getFunctionCalls(params),
    [params.tenantId, params.agentId, params.days]
  );
}

export function useSentimentAnalytics(params: { tenantId: string; agentId?: string; days?: number }) {
  return useQuery(
    () => analyticsApi.getSentimentAnalytics(params),
    [params.tenantId, params.agentId, params.days]
  );
}

export function useHeatmapData(params: { tenantId: string; agentId?: string; days?: number }) {
  return useQuery(
    () => analyticsApi.getHeatmapData(params),
    [params.tenantId, params.agentId, params.days]
  );
}

export function useSystemHealth(params: { tenantId: string }) {
  return useQuery(
    () => analyticsApi.getSystemHealth(params),
    [params.tenantId]
  );
}

export function useAgentComparison(params: { tenantId: string; days?: number }) {
  return useQuery(
    () => analyticsApi.getAgentComparison(params),
    [params.tenantId, params.days]
  );
}

// =============================================================================
// Prompt Enhancement Hook
// =============================================================================

export function useEnhancePrompt() {
  return useMutation(agentApi.enhancePrompt);
}

// =============================================================================
// Organization Hooks
// =============================================================================

export function useOrganizations() {
  return useQuery(() => organizationApi.list(), []);
}

export function useOrganization(idOrSlug: string, bySlug = false) {
  return useQuery(
    () => (bySlug ? organizationApi.getBySlug(idOrSlug) : organizationApi.getById(idOrSlug)),
    [idOrSlug, bySlug]
  );
}

export function useCreateOrganization() {
  return useMutation(organizationApi.create);
}

// =============================================================================
// Dashboard Hook (Combined Data)
// =============================================================================

export function useDashboard(tenantId?: string) {
  const tid = tenantId || getDefaultTenantId();

  const agents = useAgents(tid);
  const calls = useCalls({ tenantId: tid, limit: 10 });
  const analytics = useAnalytics({ tenantId: tid });

  const isLoading = agents.isLoading || calls.isLoading || analytics.isLoading;
  const error = agents.error || calls.error || analytics.error;

  const refetch = useCallback(async () => {
    await Promise.all([agents.refetch(), calls.refetch(), analytics.refetch()]);
  }, [agents, calls, analytics]);

  return {
    agents: agents.data?.agents || [],
    calls: calls.data?.items || [],
    stats: analytics.data?.data?.today || null,
    isLoading,
    error,
    refetch,
  };
}

// =============================================================================
// Polling Hook
// =============================================================================

/**
 * Hook for polling data at regular intervals
 */
export function usePolling<T>(
  queryFn: () => Promise<T>,
  intervalMs: number,
  enabled = true
): UseQueryResult<T> {
  const result = useQuery(queryFn, []);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) return;

    intervalRef.current = setInterval(() => {
      result.refetch();
    }, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, intervalMs, result]);

  return result;
}

/**
 * Hook for polling active calls
 */
export function useActiveCalls(tenantId?: string, pollIntervalMs = 5000) {
  const tid = tenantId || getDefaultTenantId();

  return usePolling(
    () => callApi.list({ tenantId: tid, limit: 50 }),
    pollIntervalMs
  );
}
