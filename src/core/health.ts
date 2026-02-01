/**
 * Health Check Service
 * 
 * Provides health check endpoints for:
 * - Kubernetes liveness/readiness probes
 * - Load balancer health checks
 * - Monitoring systems
 */

import http from 'http';
import { logger } from './logging.js';
import { isConvexConfigured, getConvexClient } from './convex-client.js';
import { config } from './config.js';

/**
 * Health check response
 */
interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    version: string;
    checks: {
        livekit: 'ok' | 'error';
        convex: 'ok' | 'error' | 'not_configured';
        sarvam: 'ok' | 'error';
    };
    latency?: {
        convex?: number;
    };
}

const startTime = Date.now();

/**
 * Check Convex connectivity
 */
async function checkConvex(): Promise<{ status: 'ok' | 'error' | 'not_configured'; latencyMs?: number }> {
    if (!isConvexConfigured()) {
        return { status: 'not_configured' };
    }

    const start = Date.now();
    try {
        const client = getConvexClient();
        // Simple query to check connectivity
        await client.query('agents:listByOrganization', { organizationId: 'health-check' });
        return { status: 'ok', latencyMs: Date.now() - start };
    } catch (error) {
        logger.warning('Health check: Convex connectivity failed', { error: (error as Error).message });
        return { status: 'error', latencyMs: Date.now() - start };
    }
}

/**
 * Check LiveKit configuration
 */
function checkLiveKit(): 'ok' | 'error' {
    return config.livekit.url && config.livekit.apiKey && config.livekit.apiSecret
        ? 'ok'
        : 'error';
}

/**
 * Check Sarvam AI configuration
 */
function checkSarvam(): 'ok' | 'error' {
    return config.sarvam.apiKey ? 'ok' : 'error';
}

/**
 * Get full health status
 */
export async function getHealthStatus(): Promise<HealthStatus> {
    const convexCheck = await checkConvex();
    const livekitStatus = checkLiveKit();
    const sarvamStatus = checkSarvam();

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (livekitStatus === 'error' || sarvamStatus === 'error') {
        status = 'unhealthy';
    } else if (convexCheck.status === 'error') {
        status = 'degraded'; // Can still work without Convex (no RAG)
    }

    return {
        status,
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        version: process.env.npm_package_version || '0.3.0',
        checks: {
            livekit: livekitStatus,
            convex: convexCheck.status,
            sarvam: sarvamStatus,
        },
        latency: convexCheck.latencyMs ? { convex: convexCheck.latencyMs } : undefined,
    };
}

/**
 * Start health check HTTP server
 */
export function startHealthServer(port: number = 8080): http.Server {
    const server = http.createServer(async (req, res) => {
        if (req.url === '/health' || req.url === '/healthz') {
            // Liveness probe - quick check
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }

        if (req.url === '/ready' || req.url === '/readyz') {
            // Readiness probe - full check
            const health = await getHealthStatus();
            const statusCode = health.status === 'unhealthy' ? 503 : 200;
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(health));
            return;
        }

        if (req.url === '/metrics') {
            // Basic metrics endpoint
            const health = await getHealthStatus();
            const metrics = [
                `# HELP agent_uptime_seconds Agent uptime in seconds`,
                `# TYPE agent_uptime_seconds gauge`,
                `agent_uptime_seconds ${health.uptime}`,
                `# HELP agent_health_status Health status (1=healthy, 0.5=degraded, 0=unhealthy)`,
                `# TYPE agent_health_status gauge`,
                `agent_health_status ${health.status === 'healthy' ? 1 : health.status === 'degraded' ? 0.5 : 0}`,
            ];
            if (health.latency?.convex) {
                metrics.push(
                    `# HELP convex_latency_ms Convex query latency in milliseconds`,
                    `# TYPE convex_latency_ms gauge`,
                    `convex_latency_ms ${health.latency.convex}`
                );
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(metrics.join('\n'));
            return;
        }

        res.writeHead(404);
        res.end('Not Found');
    });

    server.listen(port, () => {
        logger.info(`Health check server started on port ${port}`);
    });

    return server;
}

/**
 * Stop health server gracefully
 */
export function stopHealthServer(server: http.Server): Promise<void> {
    return new Promise((resolve) => {
        server.close(() => {
            logger.info('Health check server stopped');
            resolve();
        });
    });
}
