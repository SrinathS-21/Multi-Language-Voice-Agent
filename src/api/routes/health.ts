/**
 * Health Routes
 * 
 * Endpoints:
 * - GET / - Root info
 * - GET /health - Liveness check
 * - GET /ready - Readiness check with dependencies
 * - GET /metrics - Prometheus metrics
 */

import { RequestContext, sendJson } from '../server.js';
import { config } from '../../core/config.js';
import { isConvexConfigured, getConvexClient } from '../../core/convex-client.js';
import { AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { logger } from '../../core/logging.js';

const startTime = Date.now();

export async function handleHealthRoutes(ctx: RequestContext): Promise<void> {
    const { pathname, res } = ctx;
    
    if (pathname === '/') {
        sendJson(res, {
            service: 'livekit-sarvam-agent',
            version: '0.3.0',
            status: 'running',
            environment: config.isDevelopment ? 'development' : 'production',
            documentation: '/health',
        });
        return;
    }
    
    if (pathname === '/health') {
        sendJson(res, {
            status: 'healthy',
            timestamp: new Date().toISOString(),
        });
        return;
    }
    
    if (pathname === '/ready') {
        const checks: Record<string, string> = {
            livekit: config.livekit.url ? 'configured' : 'missing',
            sarvam: config.sarvam.apiKey ? 'configured' : 'missing',
            convex: 'checking...',
        };
        
        // Check Convex connectivity
        if (isConvexConfigured()) {
            try {
                const client = getConvexClient();
                await client.query('agents:listByOrganization', { organizationId: 'health-check' });
                checks.convex = 'connected';
            } catch {
                checks.convex = 'error';
            }
        } else {
            checks.convex = 'not_configured';
        }
        
        const isHealthy = checks.livekit === 'configured' && checks.sarvam === 'configured';
        
        sendJson(res, {
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - startTime) / 1000),
            checks,
        }, isHealthy ? 200 : 503);
        return;
    }
    
    if (pathname === '/metrics') {
        const uptime = Math.floor((Date.now() - startTime) / 1000);
        const metrics = [
            '# HELP agent_uptime_seconds Agent uptime in seconds',
            '# TYPE agent_uptime_seconds gauge',
            `agent_uptime_seconds ${uptime}`,
        ];
        
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(metrics.join('\n'));
        return;
    }

    if (pathname === '/warmup-agent') {
        const roomName = `warmup-ping-${Date.now()}`;
        try {
            const roomService = new RoomServiceClient(
                config.livekit.url,
                config.livekit.apiKey,
                config.livekit.apiSecret
            );
            const agentDispatch = new AgentDispatchClient(
                config.livekit.url,
                config.livekit.apiKey,
                config.livekit.apiSecret
            );

            // Create temp room and dispatch warmup ping
            await roomService.createRoom({ name: roomName, emptyTimeout: 30 });
            await agentDispatch.createDispatch(roomName, 'sarvam-voice-agent', {
                metadata: JSON.stringify({ warmup: true }),
            });

            logger.info(`Warmup ping sent → ${roomName}`);

            // Clean up room after 10s (non-blocking)
            setTimeout(async () => {
                try { await roomService.deleteRoom(roomName); } catch {}
            }, 10_000);

            sendJson(res, {
                status: 'ok',
                message: 'Warmup ping dispatched to LiveKit agent',
                room: roomName,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            logger.error('Warmup ping failed:', error);
            sendJson(res, {
                status: 'error',
                message: error instanceof Error ? error.message : 'Warmup ping failed',
            }, 500);
        }
        return;
    }
}
