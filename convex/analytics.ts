/**
 * Analytics - Aggregated statistics and insights
 * 
 * Provides real-time analytics for:
 * - Daily/weekly/monthly call statistics
 * - Organization usage tracking
 * - Agent performance metrics
 * - System health monitoring
 * 
 * Optimized for dashboard queries with pre-aggregated data
 */

import { query } from "./_generated/server.js";
import { v } from "convex/values";

// ============================================
// TODAY'S STATISTICS
// ============================================

/**
 * Get today's call statistics for an organization
 * Used for dashboard overview and real-time monitoring
 */
export const getTodayStats = query({
    args: {
        organizationId: v.string(),
        agentId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartMs = todayStart.getTime();

        // Query sessions from today
        const sessionsQuery = ctx.db
            .query("callSessions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allSessions = await sessionsQuery.collect();
        
        // Filter for today and optionally by agent
        const todaySessions = allSessions.filter((s) => {
            const matchesDate = s.startedAt && s.startedAt >= todayStartMs;
            const matchesAgent = !args.agentId || s.agentId === args.agentId;
            return matchesDate && matchesAgent;
        });

        // Calculate statistics
        const totalCalls = todaySessions.length;
        const completedCalls = todaySessions.filter(s => s.status === "completed").length;
        const failedCalls = todaySessions.filter(s => s.status === "failed").length;
        const activeCalls = todaySessions.filter(s => s.status === "active").length;

        // Calculate durations
        const completedWithDuration = todaySessions.filter(s => 
            s.status === "completed" && s.durationSeconds
        );
        const totalDuration = completedWithDuration.reduce(
            (acc, s) => acc + (s.durationSeconds || 0), 0
        );
        const avgDuration = completedWithDuration.length > 0
            ? Math.round(totalDuration / completedWithDuration.length)
            : 0;

        // Calculate rates
        const completionRate = totalCalls > 0
            ? Math.round((completedCalls / totalCalls) * 100)
            : 0;

        return {
            today: {
                total_calls: totalCalls,
                completed_calls: completedCalls,
                failed_calls: failedCalls,
                active_calls: activeCalls,
                completion_rate: completionRate,
                avg_duration_seconds: avgDuration,
                total_duration_seconds: totalDuration,
            },
            timestamp: now,
        };
    },
});

/**
 * Get statistics for a specific time range
 */
export const getStatsForRange = query({
    args: {
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        startDate: v.number(), // Unix timestamp
        endDate: v.number(),   // Unix timestamp
    },
    handler: async (ctx, args) => {
        const sessionsQuery = ctx.db
            .query("callSessions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allSessions = await sessionsQuery.collect();
        
        // Filter by date range and agent
        const rangeSessions = allSessions.filter((s) => {
            const inRange = s.startedAt && 
                s.startedAt >= args.startDate && 
                s.startedAt <= args.endDate;
            const matchesAgent = !args.agentId || s.agentId === args.agentId;
            return inRange && matchesAgent;
        });

        // Calculate statistics
        const totalCalls = rangeSessions.length;
        const completedCalls = rangeSessions.filter(s => s.status === "completed").length;
        const failedCalls = rangeSessions.filter(s => s.status === "failed").length;
        
        const totalDuration = rangeSessions.reduce(
            (acc, s) => acc + (s.durationSeconds || 0), 0
        );
        const avgDuration = completedCalls > 0
            ? Math.round(totalDuration / completedCalls)
            : 0;

        return {
            total_calls: totalCalls,
            completed_calls: completedCalls,
            failed_calls: failedCalls,
            completion_rate: totalCalls > 0 
                ? Math.round((completedCalls / totalCalls) * 100) 
                : 0,
            avg_duration_seconds: avgDuration,
            total_duration_seconds: totalDuration,
            date_range: {
                start: args.startDate,
                end: args.endDate,
            },
        };
    },
});

// ============================================
// HOURLY BREAKDOWN
// ============================================

/**
 * Get hourly call statistics for today
 * Used for time-series charts and peak hour analysis
 */
export const getHourlyStats = query({
    args: {
        organizationId: v.string(),
        date: v.optional(v.number()), // Unix timestamp for specific date, defaults to today
    },
    handler: async (ctx, args) => {
        const targetDate = args.date 
            ? new Date(args.date)
            : new Date();
        
        targetDate.setHours(0, 0, 0, 0);
        const dayStart = targetDate.getTime();
        const dayEnd = dayStart + (24 * 60 * 60 * 1000);

        const sessionsQuery = ctx.db
            .query("callSessions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allSessions = await sessionsQuery.collect();
        const daySessions = allSessions.filter(s => 
            s.startedAt && s.startedAt >= dayStart && s.startedAt < dayEnd
        );

        // Group by hour
        const hourlyBuckets = Array.from({ length: 24 }, (_, hour) => ({
            hour,
            calls: 0,
            completed: 0,
            failed: 0,
            total_duration: 0,
        }));

        daySessions.forEach(session => {
            if (!session.startedAt) return;
            const hour = new Date(session.startedAt).getHours();
            hourlyBuckets[hour].calls++;
            if (session.status === "completed") hourlyBuckets[hour].completed++;
            if (session.status === "failed") hourlyBuckets[hour].failed++;
            hourlyBuckets[hour].total_duration += session.durationSeconds || 0;
        });

        return {
            date: dayStart,
            hourly_stats: hourlyBuckets,
        };
    },
});

// ============================================
// AGENT PERFORMANCE
// ============================================

/**
 * Get performance metrics for all agents in an organization
 * Used for agent comparison and performance dashboards
 */
export const getAgentPerformance = query({
    args: {
        organizationId: v.string(),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit || 50;

        // Get all agents for this organization
        const agents = await ctx.db
            .query("agents")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
            .take(limit);

        // Get sessions for each agent
        const agentStats = await Promise.all(
            agents.map(async (agent) => {
                const sessions = await ctx.db
                    .query("callSessions")
                    .filter((q) => q.eq(q.field("agentId"), agent._id))
                    .collect();

                const totalCalls = sessions.length;
                const completedCalls = sessions.filter(s => s.status === "completed").length;
                const failedCalls = sessions.filter(s => s.status === "failed").length;
                
                const totalDuration = sessions.reduce(
                    (acc, s) => acc + (s.durationSeconds || 0), 0
                );
                const avgDuration = completedCalls > 0
                    ? Math.round(totalDuration / completedCalls)
                    : 0;

                // Get latest session time
                const latestSession = sessions.reduce((latest, s) => {
                    if (!latest || (s.startedAt && s.startedAt > (latest.startedAt || 0))) {
                        return s;
                    }
                    return latest;
                }, sessions[0]);

                return {
                    agent_id: agent._id,
                    agent_name: agent.name,
                    total_calls: totalCalls,
                    completed_calls: completedCalls,
                    failed_calls: failedCalls,
                    completion_rate: totalCalls > 0
                        ? Math.round((completedCalls / totalCalls) * 100)
                        : 0,
                    avg_duration_seconds: avgDuration,
                    total_duration_seconds: totalDuration,
                    last_call_at: latestSession?.startedAt || null,
                    status: agent.status || "active",
                };
            })
        );

        // Sort by total calls descending
        agentStats.sort((a, b) => b.total_calls - a.total_calls);

        return {
            agents: agentStats,
            total_agents: agents.length,
        };
    },
});

// ============================================
// USAGE TRACKING
// ============================================

/**
 * Get usage statistics for billing and quota management
 */
export const getUsageStats = query({
    args: {
        organizationId: v.string(),
        month: v.optional(v.number()), // Unix timestamp for month start
    },
    handler: async (ctx, args) => {
        // Calculate month range
        const monthDate = args.month ? new Date(args.month) : new Date();
        monthDate.setDate(1);
        monthDate.setHours(0, 0, 0, 0);
        const monthStart = monthDate.getTime();
        
        const nextMonth = new Date(monthStart);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const monthEnd = nextMonth.getTime();

        // Get all sessions for the month
        const sessionsQuery = ctx.db
            .query("callSessions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allSessions = await sessionsQuery.collect();
        const monthSessions = allSessions.filter(s => 
            s.startedAt && s.startedAt >= monthStart && s.startedAt < monthEnd
        );

        // Calculate usage
        const totalCalls = monthSessions.length;
        const totalMinutes = Math.ceil(
            monthSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) / 60
        );

        // Group by call type
        const callsByType = monthSessions.reduce((acc, s) => {
            const type = s.callType || "unknown";
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        // Group by agent
        const callsByAgent = monthSessions.reduce((acc, s) => {
            const agentId = s.agentId || "unassigned";
            acc[agentId] = (acc[agentId] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            month: monthStart,
            usage: {
                total_calls: totalCalls,
                total_minutes: totalMinutes,
                calls_by_type: callsByType,
                calls_by_agent: callsByAgent,
            },
            billing_period: {
                start: monthStart,
                end: monthEnd,
            },
        };
    },
});

// ============================================
// SYSTEM HEALTH
// ============================================

/**
 * Get system health metrics
 * Used for monitoring and alerting
 */
export const getSystemHealth = query({
    args: {
        organizationId: v.string(),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const last24Hours = now - (24 * 60 * 60 * 1000);
        const last1Hour = now - (60 * 60 * 1000);

        const sessionsQuery = ctx.db
            .query("callSessions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allSessions = await sessionsQuery.collect();
        
        // Last 24 hours
        const last24HoursSessions = allSessions.filter(s => 
            s.startedAt && s.startedAt >= last24Hours
        );
        const failedLast24h = last24HoursSessions.filter(s => s.status === "failed").length;
        const errorRate24h = last24HoursSessions.length > 0
            ? Math.round((failedLast24h / last24HoursSessions.length) * 100)
            : 0;

        // Last 1 hour
        const last1HourSessions = allSessions.filter(s => 
            s.startedAt && s.startedAt >= last1Hour
        );
        const failedLast1h = last1HourSessions.filter(s => s.status === "failed").length;
        const errorRate1h = last1HourSessions.length > 0
            ? Math.round((failedLast1h / last1HourSessions.length) * 100)
            : 0;

        // Active sessions
        const activeSessions = allSessions.filter(s => s.status === "active");

        // Average session duration trend
        const completedLast24h = last24HoursSessions.filter(s => s.status === "completed");
        const avgDuration = completedLast24h.length > 0
            ? Math.round(
                completedLast24h.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) / 
                completedLast24h.length
            )
            : 0;

        return {
            health: {
                status: errorRate1h > 20 ? "critical" : errorRate1h > 10 ? "warning" : "healthy",
                error_rate_24h: errorRate24h,
                error_rate_1h: errorRate1h,
                active_sessions: activeSessions.length,
                avg_duration_24h: avgDuration,
            },
            metrics: {
                calls_last_24h: last24HoursSessions.length,
                calls_last_1h: last1HourSessions.length,
                failed_last_24h: failedLast24h,
                failed_last_1h: failedLast1h,
            },
            timestamp: now,
        };
    },
});

// ============================================
// CHART DATA QUERIES
// ============================================

/**
 * Get call volume data for time series charts
 * Returns hourly data for the past N days
 */
export const getCallVolumeChartData = query({
    args: {
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        days: v.optional(v.number()), // Default 7 days
    },
    handler: async (ctx, args) => {
        const days = args.days || 7;
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);

        const sessionsQuery = ctx.db
            .query("callSessions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allSessions = await sessionsQuery.collect();
        
        // Filter by time range and agent
        const filteredSessions = allSessions.filter((s) => {
            const inRange = s.startedAt && s.startedAt >= startTime;
            const matchesAgent = !args.agentId || s.agentId === args.agentId;
            return inRange && matchesAgent;
        });

        // Group by day
        const dailyData: Record<string, { date: string; total: number; completed: number; failed: number; avgDuration: number; durations: number[] }> = {};
        
        filteredSessions.forEach(session => {
            if (!session.startedAt) return;
            const date = new Date(session.startedAt);
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            
            if (!dailyData[dateKey]) {
                dailyData[dateKey] = { date: dateKey, total: 0, completed: 0, failed: 0, avgDuration: 0, durations: [] };
            }
            
            dailyData[dateKey].total++;
            if (session.status === "completed") {
                dailyData[dateKey].completed++;
                if (session.durationSeconds) {
                    dailyData[dateKey].durations.push(session.durationSeconds);
                }
            }
            if (session.status === "failed") dailyData[dateKey].failed++;
        });

        // Calculate avg duration for each day
        Object.values(dailyData).forEach(day => {
            if (day.durations.length > 0) {
                day.avgDuration = Math.round(day.durations.reduce((a, b) => a + b, 0) / day.durations.length);
            }
        });

        // Fill in missing days
        const result = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now - (i * 24 * 60 * 60 * 1000));
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            result.push(dailyData[dateKey] || { date: dateKey, total: 0, completed: 0, failed: 0, avgDuration: 0 });
        }

        return {
            data: result.map(d => ({
                date: d.date,
                total: d.total,
                completed: d.completed,
                failed: d.failed,
                avgDuration: d.avgDuration,
            })),
            summary: {
                totalCalls: filteredSessions.length,
                avgPerDay: Math.round(filteredSessions.length / days),
            },
        };
    },
});

/**
 * Get hourly distribution for heatmap
 * Returns calls grouped by hour and day of week
 */
export const getHourlyHeatmapData = query({
    args: {
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const days = args.days || 30;
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);

        const sessionsQuery = ctx.db
            .query("callSessions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allSessions = await sessionsQuery.collect();
        
        const filteredSessions = allSessions.filter((s) => {
            const inRange = s.startedAt && s.startedAt >= startTime;
            const matchesAgent = !args.agentId || s.agentId === args.agentId;
            return inRange && matchesAgent;
        });

        // Create 7x24 matrix (day of week x hour)
        const heatmap: number[][] = Array(7).fill(null).map(() => Array(24).fill(0));
        
        filteredSessions.forEach(session => {
            if (!session.startedAt) return;
            const date = new Date(session.startedAt);
            const dayOfWeek = date.getDay(); // 0 = Sunday
            const hour = date.getHours();
            heatmap[dayOfWeek][hour]++;
        });

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        
        return {
            heatmap: heatmap.map((hours, dayIndex) => ({
                day: dayNames[dayIndex],
                dayIndex,
                hours: hours.map((count, hour) => ({ hour, count })),
            })),
            maxValue: Math.max(...heatmap.flat()),
            totalCalls: filteredSessions.length,
        };
    },
});

/**
 * Get call status distribution for pie charts
 */
export const getCallStatusDistribution = query({
    args: {
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const days = args.days || 30;
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);

        const sessionsQuery = ctx.db
            .query("callSessions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allSessions = await sessionsQuery.collect();
        
        const filteredSessions = allSessions.filter((s) => {
            const inRange = s.startedAt && s.startedAt >= startTime;
            const matchesAgent = !args.agentId || s.agentId === args.agentId;
            return inRange && matchesAgent;
        });

        const statusCounts: Record<string, number> = {
            completed: 0,
            failed: 0,
            active: 0,
            expired: 0,
        };

        const typeCounts: Record<string, number> = {
            inbound: 0,
            outbound: 0,
            web: 0,
        };

        filteredSessions.forEach(session => {
            if (session.status) statusCounts[session.status] = (statusCounts[session.status] || 0) + 1;
            if (session.callType) typeCounts[session.callType] = (typeCounts[session.callType] || 0) + 1;
        });

        return {
            statusDistribution: Object.entries(statusCounts).map(([name, value]) => ({
                name,
                value,
                percentage: filteredSessions.length > 0 
                    ? Math.round((value / filteredSessions.length) * 100) 
                    : 0,
            })),
            typeDistribution: Object.entries(typeCounts).map(([name, value]) => ({
                name,
                value,
                percentage: filteredSessions.length > 0 
                    ? Math.round((value / filteredSessions.length) * 100) 
                    : 0,
            })),
            totalCalls: filteredSessions.length,
        };
    },
});

/**
 * Get agent performance comparison data
 */
export const getAgentComparisonData = query({
    args: {
        organizationId: v.string(),
        days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const days = args.days || 30;
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);

        // Get all agents
        const agents = await ctx.db
            .query("agents")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
            .collect();

        // Get all sessions
        const allSessions = await ctx.db
            .query("callSessions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
            .collect();
        
        const filteredSessions = allSessions.filter(s => s.startedAt && s.startedAt >= startTime);

        // Get metrics for latency
        const allMetrics = await ctx.db
            .query("callMetrics")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
            .collect();

        const agentStats = agents.map(agent => {
            const agentSessions = filteredSessions.filter(s => s.agentId === agent._id);
            const completed = agentSessions.filter(s => s.status === "completed");
            const failed = agentSessions.filter(s => s.status === "failed");
            
            const totalDuration = completed.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);
            const avgDuration = completed.length > 0 ? Math.round(totalDuration / completed.length) : 0;
            
            // Get latency metrics for this agent
            const agentMetrics = allMetrics.filter(m => 
                m.agentId === agent._id && 
                m.metricType === "latency" &&
                m.timestamp && m.timestamp >= startTime
            );
            const avgLatency = agentMetrics.length > 0
                ? Math.round(agentMetrics.reduce((acc, m) => acc + (m.value || 0), 0) / agentMetrics.length)
                : 0;

            return {
                agentId: agent._id,
                agentName: agent.name,
                language: agent.language || 'en-IN',
                status: agent.status || 'active',
                totalCalls: agentSessions.length,
                completedCalls: completed.length,
                failedCalls: failed.length,
                completionRate: agentSessions.length > 0 
                    ? Math.round((completed.length / agentSessions.length) * 100) 
                    : 0,
                avgDuration,
                avgLatency,
            };
        });

        // Sort by total calls
        agentStats.sort((a, b) => b.totalCalls - a.totalCalls);

        return {
            agents: agentStats,
            totalAgents: agents.length,
            periodDays: days,
        };
    },
});

/**
 * Get latency trends over time
 */
export const getLatencyTrends = query({
    args: {
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const days = args.days || 7;
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);

        const metricsQuery = ctx.db
            .query("callMetrics")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allMetrics = await metricsQuery.collect();
        
        const filteredMetrics = allMetrics.filter(m => {
            const inRange = m.timestamp && m.timestamp >= startTime;
            const isLatency = m.metricType === "latency";
            const matchesAgent = !args.agentId || m.agentId === args.agentId;
            return inRange && isLatency && matchesAgent;
        });

        // Group by day and metric name
        const dailyLatency: Record<string, Record<string, number[]>> = {};
        
        filteredMetrics.forEach(metric => {
            if (!metric.timestamp || !metric.metricName || metric.value === undefined) return;
            const date = new Date(metric.timestamp);
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            
            if (!dailyLatency[dateKey]) dailyLatency[dateKey] = {};
            if (!dailyLatency[dateKey][metric.metricName]) dailyLatency[dateKey][metric.metricName] = [];
            
            dailyLatency[dateKey][metric.metricName].push(metric.value);
        });

        // Calculate averages
        const result = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now - (i * 24 * 60 * 60 * 1000));
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            
            const dayData = dailyLatency[dateKey] || {};
            const avgByType: Record<string, number> = {};
            
            Object.entries(dayData).forEach(([name, values]) => {
                avgByType[name] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
            });

            result.push({
                date: dateKey,
                stt: avgByType['stt_latency'] || avgByType['stt'] || 0,
                tts: avgByType['tts_latency'] || avgByType['tts'] || 0,
                llm: avgByType['llm_latency'] || avgByType['llm'] || 0,
                total: avgByType['total_latency'] || avgByType['e2e'] || 0,
            });
        }

        return {
            data: result,
            summary: {
                avgStt: result.length > 0 ? Math.round(result.reduce((acc, d) => acc + d.stt, 0) / result.filter(d => d.stt > 0).length) || 0 : 0,
                avgTts: result.length > 0 ? Math.round(result.reduce((acc, d) => acc + d.tts, 0) / result.filter(d => d.tts > 0).length) || 0 : 0,
                avgLlm: result.length > 0 ? Math.round(result.reduce((acc, d) => acc + d.llm, 0) / result.filter(d => d.llm > 0).length) || 0 : 0,
            },
        };
    },
});

/**
 * Get call duration distribution for histogram
 */
export const getCallDurationDistribution = query({
    args: {
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const days = args.days || 30;
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);

        const sessionsQuery = ctx.db
            .query("callSessions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allSessions = await sessionsQuery.collect();
        
        const filteredSessions = allSessions.filter((s) => {
            const inRange = s.startedAt && s.startedAt >= startTime;
            const matchesAgent = !args.agentId || s.agentId === args.agentId;
            const hasCompleted = s.status === "completed" && s.durationSeconds;
            return inRange && matchesAgent && hasCompleted;
        });

        // Define duration buckets (in seconds)
        const buckets = [
            { label: '0-30s', min: 0, max: 30 },
            { label: '30s-1m', min: 30, max: 60 },
            { label: '1-2m', min: 60, max: 120 },
            { label: '2-5m', min: 120, max: 300 },
            { label: '5-10m', min: 300, max: 600 },
            { label: '10m+', min: 600, max: Infinity },
        ];

        const distribution = buckets.map(bucket => ({
            label: bucket.label,
            count: filteredSessions.filter(s => 
                s.durationSeconds! >= bucket.min && s.durationSeconds! < bucket.max
            ).length,
        }));

        const durations = filteredSessions.map(s => s.durationSeconds!);
        const avgDuration = durations.length > 0 
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
            : 0;
        const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;
        const minDuration = durations.length > 0 ? Math.min(...durations) : 0;

        return {
            distribution,
            stats: {
                totalCalls: filteredSessions.length,
                avgDuration,
                maxDuration,
                minDuration,
                medianDuration: durations.length > 0 
                    ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]
                    : 0,
            },
        };
    },
});

/**
 * Get function call analytics
 */
export const getFunctionCallAnalytics = query({
    args: {
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const days = args.days || 30;
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);

        const interactionsQuery = ctx.db
            .query("callInteractions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allInteractions = await interactionsQuery.collect();
        
        const functionCalls = allInteractions.filter((i) => {
            const inRange = i.timestamp && i.timestamp >= startTime;
            const isFunction = i.interactionType === "function_call";
            const matchesAgent = !args.agentId || i.agentId === args.agentId;
            return inRange && isFunction && matchesAgent;
        });

        // Group by function name
        const functionStats: Record<string, { name: string; count: number; avgLatency: number; latencies: number[] }> = {};
        
        functionCalls.forEach(call => {
            const name = call.functionName || 'unknown';
            if (!functionStats[name]) {
                functionStats[name] = { name, count: 0, avgLatency: 0, latencies: [] };
            }
            functionStats[name].count++;
            if (call.latencyMs) {
                functionStats[name].latencies.push(call.latencyMs);
            }
        });

        // Calculate averages
        Object.values(functionStats).forEach(stat => {
            if (stat.latencies.length > 0) {
                stat.avgLatency = Math.round(stat.latencies.reduce((a, b) => a + b, 0) / stat.latencies.length);
            }
        });

        const result = Object.values(functionStats)
            .map(s => ({ name: s.name, count: s.count, avgLatency: s.avgLatency }))
            .sort((a, b) => b.count - a.count);

        return {
            functions: result,
            totalCalls: functionCalls.length,
            uniqueFunctions: result.length,
        };
    },
});

/**
 * Get sentiment analysis data
 */
export const getSentimentAnalytics = query({
    args: {
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const days = args.days || 30;
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);

        const interactionsQuery = ctx.db
            .query("callInteractions")
            .filter((q) => q.eq(q.field("organizationId"), args.organizationId));
        
        const allInteractions = await interactionsQuery.collect();
        
        const filteredInteractions = allInteractions.filter((i) => {
            const inRange = i.timestamp && i.timestamp >= startTime;
            const hasSentiment = i.sentiment !== undefined;
            const matchesAgent = !args.agentId || i.agentId === args.agentId;
            return inRange && hasSentiment && matchesAgent;
        });

        const sentimentCounts: Record<string, number> = {
            positive: 0,
            neutral: 0,
            negative: 0,
        };

        filteredInteractions.forEach(interaction => {
            if (interaction.sentiment) {
                sentimentCounts[interaction.sentiment] = (sentimentCounts[interaction.sentiment] || 0) + 1;
            }
        });

        const total = filteredInteractions.length;

        return {
            distribution: Object.entries(sentimentCounts).map(([name, value]) => ({
                name,
                value,
                percentage: total > 0 ? Math.round((value / total) * 100) : 0,
            })),
            total,
            sentimentScore: total > 0
                ? Math.round(((sentimentCounts.positive - sentimentCounts.negative) / total) * 100)
                : 0,
        };
    },
});

/**
 * Get comprehensive dashboard data (single query for all charts)
 */
export const getDashboardChartData = query({
    args: {
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        days: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const days = args.days || 7;
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Fetch all data in parallel
        const [sessions, interactions, metrics, agents] = await Promise.all([
            ctx.db.query("callSessions")
                .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
                .collect(),
            ctx.db.query("callInteractions")
                .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
                .collect(),
            ctx.db.query("callMetrics")
                .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
                .collect(),
            ctx.db.query("agents")
                .filter((q) => q.eq(q.field("organizationId"), args.organizationId))
                .collect(),
        ]);

        // Filter by time range and agent
        const filteredSessions = sessions.filter(s => {
            const inRange = s.startedAt && s.startedAt >= startTime;
            const matchesAgent = !args.agentId || s.agentId === args.agentId;
            return inRange && matchesAgent;
        });

        const todaySessions = sessions.filter(s => {
            const isToday = s.startedAt && s.startedAt >= todayStart.getTime();
            const matchesAgent = !args.agentId || s.agentId === args.agentId;
            return isToday && matchesAgent;
        });

        // Calculate summary stats
        const completed = filteredSessions.filter(s => s.status === "completed");
        const failed = filteredSessions.filter(s => s.status === "failed");
        const active = filteredSessions.filter(s => s.status === "active");

        const totalDuration = completed.reduce((acc, s) => acc + (s.durationSeconds || 0), 0);

        return {
            summary: {
                totalCalls: filteredSessions.length,
                todayCalls: todaySessions.length,
                completedCalls: completed.length,
                failedCalls: failed.length,
                activeCalls: active.length,
                completionRate: filteredSessions.length > 0 
                    ? Math.round((completed.length / filteredSessions.length) * 100) 
                    : 0,
                avgDuration: completed.length > 0 
                    ? Math.round(totalDuration / completed.length) 
                    : 0,
                totalDuration,
                totalAgents: agents.length,
                activeAgents: agents.filter(a => a.status === "active").length,
            },
            period: {
                days,
                startTime,
                endTime: now,
            },
        };
    },
});
