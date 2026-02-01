/**
 * Analytics Routes
 * 
 * Endpoints:
 * - GET /api/v1/analytics - Overview stats
 * - GET /api/v1/analytics/sessions - Recent sessions
 * - GET /api/v1/analytics/agent/:agent_id - Per-agent analytics
 * - GET /api/v1/analytics/latency/:agent_id - Latency statistics
 * - GET /api/v1/analytics/functions/:agent_id - Function call statistics
 * - GET /api/v1/analytics/health - System health metrics
 */

import { RequestContext, sendJson, sendError } from '../server.js';
import { logger } from '../../core/logging.js';
import { getConvexClient, isConvexConfigured } from '../../core/convex-client.js';

export async function handleAnalyticsRoutes(ctx: RequestContext): Promise<void> {
    const { pathname, method, query, res } = ctx;
    
    if (!isConvexConfigured()) {
        sendError(res, 'Convex not configured', 503);
        return;
    }
    
    const convex = getConvexClient();
    
    // GET /api/v1/analytics?tenant_id=xxx&agent_id=xxx
    if (pathname === '/api/v1/analytics' && method === 'GET') {
        const tenantId = query.tenant_id;
        const agentId = query.agent_id;
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const filterArgs: any = { organizationId: tenantId };
            if (agentId) filterArgs.agentId = agentId;
            
            // Get today's statistics using the new Convex API
            const stats = await convex.query('analytics:getTodayStats', filterArgs);
            
            sendJson(res, {
                status: 'success',
                data: {
                    today: stats?.today || {
                        total_calls: 0,
                        completed_calls: 0,
                        avg_duration_seconds: 0,
                        total_duration_seconds: 0,
                    },
                    timestamp: new Date().toISOString(),
                },
            });
            
        } catch (error) {
            logger.error('Get analytics failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/sessions?tenant_id=xxx&agent_id=xxx&limit=50
    if (pathname === '/api/v1/analytics/sessions' && method === 'GET') {
        const tenantId = query.tenant_id;
        const agentId = query.agent_id;
        const limit = parseInt(query.limit || '50', 10);
        
        try {
            let sessions;
            
            if (agentId) {
                sessions = await convex.query('callSessions:getByAgentId', {
                    agentId,
                    limit,
                });
            } else if (tenantId) {
                sessions = await convex.query('callSessions:getRecentSessions', {
                    organizationId: tenantId,
                    limit,
                });
            } else {
                sendError(res, 'tenant_id or agent_id is required', 400);
                return;
            }
            
            sendJson(res, {
                status: 'success',
                sessions: (sessions || []).map((s: any) => ({
                    session_id: s.sessionId,
                    agent_id: s.agentId,
                    status: s.status,
                    started_at: s.startedAt,
                    ended_at: s.endedAt,
                    duration_seconds: s.durationSeconds,
                    call_type: s.callType,
                })),
                total: sessions?.length || 0,
            });
            
        } catch (error) {
            logger.error('Get analytics sessions failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/agent/:agent_id
    const agentMatch = pathname.match(/^\/api\/v1\/analytics\/agent\/([^/]+)$/);
    if (agentMatch && method === 'GET') {
        const agentId = agentMatch[1];
        
        try {
            // Get agent's sessions using new API
            const sessions = await convex.query('callSessions:getByAgentId', {
                agentId,
                limit: 100,
            });
            
            // Calculate stats
            const totalCalls = sessions?.length || 0;
            const completedCalls = sessions?.filter((s: any) => s.status === 'completed').length || 0;
            const totalDuration = sessions?.reduce((acc: number, s: any) => acc + (s.durationSeconds || 0), 0) || 0;
            const avgDuration = completedCalls > 0 ? Math.round(totalDuration / completedCalls) : 0;
            
            // Get metrics if available using new API
            const metrics = await convex.query('callMetrics:getByAgentId', { 
                agentId,
                limit: 100
            });
            
            const avgLatency = metrics?.length > 0
                ? Math.round(metrics.reduce((acc: number, m: any) => acc + (m.value || 0), 0) / metrics.length)
                : null;
            
            sendJson(res, {
                status: 'success',
                agent_id: agentId,
                stats: {
                    total_calls: totalCalls,
                    completed_calls: completedCalls,
                    completion_rate: totalCalls > 0 ? Math.round((completedCalls / totalCalls) * 100) : 0,
                    avg_duration_seconds: avgDuration,
                    total_duration_seconds: totalDuration,
                    avg_latency_ms: avgLatency,
                },
                recent_sessions: (sessions || []).slice(0, 10).map((s: any) => ({
                    session_id: s.sessionId,
                    status: s.status,
                    started_at: s.startedAt,
                    duration_seconds: s.durationSeconds,
                })),
            });
            
        } catch (error) {
            logger.error('Get agent analytics failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/latency/:agent_id?time_range=24
    const latencyMatch = pathname.match(/^\/api\/v1\/analytics\/latency\/([^/]+)$/);
    if (latencyMatch && method === 'GET') {
        const agentId = latencyMatch[1];
        const timeRange = parseInt(query.time_range || '24', 10);
        
        try {
            const latencyStats = await convex.query('callMetrics:getLatencyStats', {
                agentId,
                timeRange,
            });
            
            sendJson(res, {
                status: 'success',
                ...latencyStats,
            });
            
        } catch (error) {
            logger.error('Get latency stats failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/functions/:agent_id?time_range=24
    const functionsMatch = pathname.match(/^\/api\/v1\/analytics\/functions\/([^/]+)$/);
    if (functionsMatch && method === 'GET') {
        const agentId = functionsMatch[1];
        const timeRange = parseInt(query.time_range || '24', 10);
        
        try {
            const functionStats = await convex.query('callMetrics:getFunctionCallStats', {
                agentId,
                timeRange,
            });
            
            sendJson(res, {
                status: 'success',
                ...functionStats,
            });
            
        } catch (error) {
            logger.error('Get function stats failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/health?tenant_id=xxx
    if (pathname === '/api/v1/analytics/health' && method === 'GET') {
        const tenantId = query.tenant_id;
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const healthMetrics = await convex.query('analytics:getSystemHealth', {
                organizationId: tenantId,
            });
            
            sendJson(res, {
                status: 'success',
                ...healthMetrics,
            });
            
        } catch (error) {
            logger.error('Get health metrics failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/hourly?tenant_id=xxx&date=timestamp
    if (pathname === '/api/v1/analytics/hourly' && method === 'GET') {
        const tenantId = query.tenant_id;
        const date = query.date ? parseInt(query.date, 10) : undefined;
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const hourlyStats = await convex.query('analytics:getHourlyStats', {
                organizationId: tenantId,
                date,
            });
            
            sendJson(res, {
                status: 'success',
                ...hourlyStats,
            });
            
        } catch (error) {
            logger.error('Get hourly stats failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/agents?tenant_id=xxx&limit=50
    if (pathname === '/api/v1/analytics/agents' && method === 'GET') {
        const tenantId = query.tenant_id;
        const limit = parseInt(query.limit || '50', 10);
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const agentPerformance = await convex.query('analytics:getAgentPerformance', {
                organizationId: tenantId,
                limit,
            });
            
            sendJson(res, {
                status: 'success',
                ...agentPerformance,
            });
            
        } catch (error) {
            logger.error('Get agent performance failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }

    // ============================================
    // CHART DATA ENDPOINTS
    // ============================================
    
    // GET /api/v1/analytics/charts/call-volume?tenant_id=xxx&agent_id=xxx&days=7
    if (pathname === '/api/v1/analytics/charts/call-volume' && method === 'GET') {
        const tenantId = query.tenant_id;
        const agentId = query.agent_id;
        const days = parseInt(query.days || '7', 10);
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const chartData = await convex.query('analytics:getCallVolumeChartData', {
                organizationId: tenantId,
                agentId: agentId || undefined,
                days,
            });
            
            sendJson(res, {
                status: 'success',
                ...chartData,
            });
            
        } catch (error) {
            logger.error('Get call volume chart data failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/charts/heatmap?tenant_id=xxx&agent_id=xxx&days=30
    if (pathname === '/api/v1/analytics/charts/heatmap' && method === 'GET') {
        const tenantId = query.tenant_id;
        const agentId = query.agent_id;
        const days = parseInt(query.days || '30', 10);
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const heatmapData = await convex.query('analytics:getHourlyHeatmapData', {
                organizationId: tenantId,
                agentId: agentId || undefined,
                days,
            });
            
            sendJson(res, {
                status: 'success',
                ...heatmapData,
            });
            
        } catch (error) {
            logger.error('Get heatmap data failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/charts/status-distribution?tenant_id=xxx&agent_id=xxx&days=30
    if (pathname === '/api/v1/analytics/charts/status-distribution' && method === 'GET') {
        const tenantId = query.tenant_id;
        const agentId = query.agent_id;
        const days = parseInt(query.days || '30', 10);
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const statusData = await convex.query('analytics:getCallStatusDistribution', {
                organizationId: tenantId,
                agentId: agentId || undefined,
                days,
            });
            
            sendJson(res, {
                status: 'success',
                ...statusData,
            });
            
        } catch (error) {
            logger.error('Get status distribution failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/charts/agent-comparison?tenant_id=xxx&days=30
    if (pathname === '/api/v1/analytics/charts/agent-comparison' && method === 'GET') {
        const tenantId = query.tenant_id;
        const days = parseInt(query.days || '30', 10);
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const comparisonData = await convex.query('analytics:getAgentComparisonData', {
                organizationId: tenantId,
                days,
            });
            
            sendJson(res, {
                status: 'success',
                ...comparisonData,
            });
            
        } catch (error) {
            logger.error('Get agent comparison failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/charts/latency-trends?tenant_id=xxx&agent_id=xxx&days=7
    if (pathname === '/api/v1/analytics/charts/latency-trends' && method === 'GET') {
        const tenantId = query.tenant_id;
        const agentId = query.agent_id;
        const days = parseInt(query.days || '7', 10);
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const latencyData = await convex.query('analytics:getLatencyTrends', {
                organizationId: tenantId,
                agentId: agentId || undefined,
                days,
            });
            
            sendJson(res, {
                status: 'success',
                ...latencyData,
            });
            
        } catch (error) {
            logger.error('Get latency trends failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/charts/duration-distribution?tenant_id=xxx&agent_id=xxx&days=30
    if (pathname === '/api/v1/analytics/charts/duration-distribution' && method === 'GET') {
        const tenantId = query.tenant_id;
        const agentId = query.agent_id;
        const days = parseInt(query.days || '30', 10);
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const durationData = await convex.query('analytics:getCallDurationDistribution', {
                organizationId: tenantId,
                agentId: agentId || undefined,
                days,
            });
            
            sendJson(res, {
                status: 'success',
                ...durationData,
            });
            
        } catch (error) {
            logger.error('Get duration distribution failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/charts/function-calls?tenant_id=xxx&agent_id=xxx&days=30
    if (pathname === '/api/v1/analytics/charts/function-calls' && method === 'GET') {
        const tenantId = query.tenant_id;
        const agentId = query.agent_id;
        const days = parseInt(query.days || '30', 10);
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const functionData = await convex.query('analytics:getFunctionCallAnalytics', {
                organizationId: tenantId,
                agentId: agentId || undefined,
                days,
            });
            
            sendJson(res, {
                status: 'success',
                ...functionData,
            });
            
        } catch (error) {
            logger.error('Get function call analytics failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/charts/sentiment?tenant_id=xxx&agent_id=xxx&days=30
    if (pathname === '/api/v1/analytics/charts/sentiment' && method === 'GET') {
        const tenantId = query.tenant_id;
        const agentId = query.agent_id;
        const days = parseInt(query.days || '30', 10);
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const sentimentData = await convex.query('analytics:getSentimentAnalytics', {
                organizationId: tenantId,
                agentId: agentId || undefined,
                days,
            });
            
            sendJson(res, {
                status: 'success',
                ...sentimentData,
            });
            
        } catch (error) {
            logger.error('Get sentiment analytics failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/analytics/charts/dashboard?tenant_id=xxx&agent_id=xxx&days=7
    if (pathname === '/api/v1/analytics/charts/dashboard' && method === 'GET') {
        const tenantId = query.tenant_id;
        const agentId = query.agent_id;
        const days = parseInt(query.days || '7', 10);
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const dashboardData = await convex.query('analytics:getDashboardChartData', {
                organizationId: tenantId,
                agentId: agentId || undefined,
                days,
            });
            
            sendJson(res, {
                status: 'success',
                ...dashboardData,
            });
            
        } catch (error) {
            logger.error('Get dashboard chart data failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    sendError(res, 'Not Found', 404);
}
