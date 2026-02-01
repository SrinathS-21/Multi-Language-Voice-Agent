/**
 * Call Metrics - Performance and quality tracking
 * 
 * Tracks detailed metrics for:
 * - Latency measurements (TTS, STT, LLM)
 * - Function call performance
 * - Quality scores
 * - Error tracking
 * 
 * Used for performance optimization and debugging
 */

import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";

// ============================================
// CREATE OPERATIONS
// ============================================

/**
 * Log a metric for a call session
 */
export const logMetric = mutation({
    args: {
        sessionId: v.string(),
        organizationId: v.string(),
        agentId: v.optional(v.string()),
        metricType: v.union(
            v.literal("latency"),
            v.literal("function_call"),
            v.literal("error"),
            v.literal("quality")
        ),
        metricName: v.string(),
        value: v.number(),
        unit: v.optional(v.string()),
        metadata: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const id = await ctx.db.insert("callMetrics", {
            sessionId: args.sessionId,
            organizationId: args.organizationId,
            agentId: args.agentId,
            metricType: args.metricType,
            metricName: args.metricName,
            value: args.value,
            unit: args.unit || "ms",
            metadata: args.metadata,
            timestamp: now,
            createdAt: now,
        });
        return { _id: id };
    },
});

/**
 * Batch log multiple metrics (for performance)
 */
export const logMetricsBatch = mutation({
    args: {
        metrics: v.array(v.object({
            sessionId: v.string(),
            organizationId: v.string(),
            agentId: v.optional(v.string()),
            metricType: v.union(
                v.literal("latency"),
                v.literal("function_call"),
                v.literal("error"),
                v.literal("quality")
            ),
            metricName: v.string(),
            value: v.number(),
            unit: v.optional(v.string()),
            metadata: v.optional(v.string()),
        })),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const ids = await Promise.all(
            args.metrics.map((metric) =>
                ctx.db.insert("callMetrics", {
                    ...metric,
                    unit: metric.unit || "ms",
                    timestamp: now,
                    createdAt: now,
                })
            )
        );
        return { count: ids.length, ids };
    },
});

// ============================================
// QUERY OPERATIONS
// ============================================

/**
 * Get metrics by session ID
 */
export const getBySessionId = query({
    args: {
        sessionId: v.string(),
    },
    handler: async (ctx, args) => {
        const metrics = await ctx.db
            .query("callMetrics")
            .filter((q) => q.eq(q.field("sessionId"), args.sessionId))
            .collect();
        
        return metrics;
    },
});

/**
 * Get metrics by agent ID
 * Used for agent performance analysis
 */
export const getByAgentId = query({
    args: {
        agentId: v.string(),
        limit: v.optional(v.number()),
        metricType: v.optional(v.union(
            v.literal("latency"),
            v.literal("function_call"),
            v.literal("error"),
            v.literal("quality")
        )),
    },
    handler: async (ctx, args) => {
        const limit = args.limit || 100;
        
        const query = ctx.db
            .query("callMetrics")
            .filter((q) => q.eq(q.field("agentId"), args.agentId));
        
        const allMetrics = await query.collect();
        
        // Filter by metric type if specified
        const filteredMetrics = args.metricType
            ? allMetrics.filter(m => m.metricType === args.metricType)
            : allMetrics;
        
        // Sort by timestamp descending and limit
        return filteredMetrics
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, limit);
    },
});

/**
 * Get aggregated latency metrics for an agent
 */
export const getLatencyStats = query({
    args: {
        agentId: v.string(),
        timeRange: v.optional(v.number()), // Hours to look back, default 24
    },
    handler: async (ctx, args) => {
        const hours = args.timeRange || 24;
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        
        const metrics = await ctx.db
            .query("callMetrics")
            .filter((q) => q.eq(q.field("agentId"), args.agentId))
            .collect();
        
        // Filter by time range and latency type
        const latencyMetrics = metrics.filter(m => 
            m.metricType === "latency" && 
            m.timestamp && 
            m.timestamp >= cutoffTime
        );
        
        if (latencyMetrics.length === 0) {
            return {
                agent_id: args.agentId,
                time_range_hours: hours,
                metrics: {},
                total_measurements: 0,
            };
        }
        
        // Group by metric name (tts_latency, stt_latency, llm_latency, etc.)
        const groupedMetrics = latencyMetrics.reduce((acc, m) => {
            const name = m.metricName;
            const value = m.value;
            if (name && value !== undefined) {
                if (!acc[name]) {
                    acc[name] = [];
                }
                acc[name].push(value);
            }
            return acc;
        }, {} as Record<string, number[]>);
        
        // Calculate stats for each metric
        const stats = Object.entries(groupedMetrics).reduce((acc, [name, values]) => {
            const sorted = values.sort((a, b) => a - b);
            const sum = values.reduce((s, v) => s + v, 0);
            const avg = Math.round(sum / values.length);
            const p50 = sorted[Math.floor(sorted.length * 0.5)];
            const p95 = sorted[Math.floor(sorted.length * 0.95)];
            const p99 = sorted[Math.floor(sorted.length * 0.99)];
            const min = sorted[0];
            const max = sorted[sorted.length - 1];
            
            acc[name] = {
                count: values.length,
                avg_ms: avg,
                p50_ms: p50,
                p95_ms: p95,
                p99_ms: p99,
                min_ms: min,
                max_ms: max,
            };
            return acc;
        }, {} as Record<string, any>);
        
        return {
            agent_id: args.agentId,
            time_range_hours: hours,
            metrics: stats,
            total_measurements: latencyMetrics.length,
        };
    },
});

/**
 * Get function call performance metrics
 */
export const getFunctionCallStats = query({
    args: {
        agentId: v.string(),
        timeRange: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const hours = args.timeRange || 24;
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        
        const metrics = await ctx.db
            .query("callMetrics")
            .filter((q) => q.eq(q.field("agentId"), args.agentId))
            .collect();
        
        const functionMetrics = metrics.filter(m => 
            m.metricType === "function_call" && 
            m.timestamp && 
            m.timestamp >= cutoffTime
        );
        
        if (functionMetrics.length === 0) {
            return {
                agent_id: args.agentId,
                time_range_hours: hours,
                functions: [],
                total_calls: 0,
            };
        }
        
        // Group by function name
        const grouped = functionMetrics.reduce((acc, m) => {
            const name = m.metricName;
            const value = m.value;
            if (name && value !== undefined) {
                if (!acc[name]) {
                    acc[name] = {
                        function_name: name,
                        call_count: 0,
                        total_duration_ms: 0,
                        durations: [],
                    };
                }
                acc[name].call_count++;
                acc[name].total_duration_ms += value;
                acc[name].durations.push(value);
            }
            return acc;
        }, {} as Record<string, any>);
        
        // Calculate stats
        const functionStats = Object.values(grouped).map((f: any) => {
            const sorted = f.durations.sort((a: number, b: number) => a - b);
            return {
                function_name: f.function_name,
                call_count: f.call_count,
                avg_duration_ms: Math.round(f.total_duration_ms / f.call_count),
                p95_duration_ms: sorted[Math.floor(sorted.length * 0.95)],
                min_duration_ms: sorted[0],
                max_duration_ms: sorted[sorted.length - 1],
            };
        });
        
        // Sort by call count descending
        functionStats.sort((a, b) => b.call_count - a.call_count);
        
        return {
            agent_id: args.agentId,
            time_range_hours: hours,
            functions: functionStats,
            total_calls: functionMetrics.length,
        };
    },
});

/**
 * Get error metrics for debugging
 */
export const getErrorMetrics = query({
    args: {
        agentId: v.optional(v.string()),
        organizationId: v.optional(v.string()),
        timeRange: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const hours = args.timeRange || 24;
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        
        const query = ctx.db.query("callMetrics");
        
        const allMetrics = await query.collect();
        
        // Filter by organization, agent, time, and error type
        const errorMetrics = allMetrics.filter(m => {
            const matchesOrg = !args.organizationId || m.organizationId === args.organizationId;
            const matchesAgent = !args.agentId || m.agentId === args.agentId;
            const matchesTime = m.timestamp && m.timestamp >= cutoffTime;
            const isError = m.metricType === "error";
            return matchesOrg && matchesAgent && matchesTime && isError;
        });
        
        if (errorMetrics.length === 0) {
            return {
                time_range_hours: hours,
                total_errors: 0,
                error_types: [],
            };
        }
        
        // Group by error type
        const errorTypes = errorMetrics.reduce((acc, m) => {
            const name = m.metricName;
            if (name) {
                if (!acc[name]) {
                    acc[name] = {
                        error_type: name,
                        count: 0,
                        sessions: new Set<string>(),
                    };
                }
                acc[name].count++;
                acc[name].sessions.add(m.sessionId);
            }
            return acc;
        }, {} as Record<string, any>);
        
        const errorStats = Object.values(errorTypes).map((e: any) => ({
            error_type: e.error_type,
            count: e.count,
            affected_sessions: e.sessions.size,
        }));
        
        // Sort by count descending
        errorStats.sort((a, b) => b.count - a.count);
        
        return {
            time_range_hours: hours,
            total_errors: errorMetrics.length,
            error_types: errorStats,
        };
    },
});
