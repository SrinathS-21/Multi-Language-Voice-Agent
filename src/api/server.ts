/**
 * REST API Server for LiveKit Sarvam Agent
 * 
 * Provides HTTP endpoints for:
 * - Document ingestion and knowledge base management
 * - Agent CRUD operations
 * - Session management
 * - Call history and analytics
 * - Health checks
 */

import http from 'http';
import { parse as parseUrl } from 'url';
import { logger } from '../core/logging.js';
import { config } from '../core/config.js';

// Import route handlers
import { handleHealthRoutes } from './routes/health.js';
import { handleDocumentIngestionRoutes } from './routes/documentIngestion.js';
import { handleAgentRoutes } from './routes/agents.js';
import { handleSessionRoutes } from './routes/sessions.js';
import { handleCallRoutes } from './routes/calls.js';
import { handleOrganizationRoutes } from './routes/organizations.js';
import { handleAnalyticsRoutes } from './routes/analytics.js';
import { handleLivekitSipDispatchRoutes } from './routes/livekit-sip-dispatch.js';
import { handleIntegrationRoutes } from './routes/integrations.js';

/**
 * Parse JSON body from request
*/
export async function parseJsonBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

/**
 * Parse body with type inference (alias for parseJsonBody)
 */
export async function parseBody<T = any>(req: http.IncomingMessage): Promise<T> {
    return parseJsonBody(req) as Promise<T>;
}

/**
 * Parse multipart form data (for file uploads)
 */
export async function parseMultipartBody(req: http.IncomingMessage): Promise<{
    fields: Record<string, string>;
    files: Array<{ name: string; filename: string; data: Buffer; contentType: string }>;
}> {
    return new Promise((resolve, reject) => {
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)/);
        if (!boundaryMatch) {
            reject(new Error('Missing boundary in multipart form'));
            return;
        }
        const boundary = boundaryMatch[1];
        
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            try {
                const buffer = Buffer.concat(chunks);
                const content = buffer.toString('binary');
                const parts = content.split(`--${boundary}`);
                
                const fields: Record<string, string> = {};
                const files: Array<{ name: string; filename: string; data: Buffer; contentType: string }> = [];
                
                for (const part of parts) {
                    if (part.includes('Content-Disposition')) {
                        const headerEnd = part.indexOf('\r\n\r\n');
                        const headers = part.substring(0, headerEnd);
                        const body = part.substring(headerEnd + 4).replace(/\r\n--$/, '');
                        
                        const nameMatch = headers.match(/name="([^"]+)"/);
                        const filenameMatch = headers.match(/filename="([^"]+)"/);
                        const contentTypeMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
                        
                        if (nameMatch) {
                            if (filenameMatch) {
                                files.push({
                                    name: nameMatch[1],
                                    filename: filenameMatch[1],
                                    data: Buffer.from(body, 'binary'),
                                    contentType: contentTypeMatch?.[1] || 'application/octet-stream',
                                });
                            } else {
                                fields[nameMatch[1]] = body.trim();
                            }
                        }
                    }
                }
                
                resolve({ fields, files });
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

/**
 * Send JSON response
 */
export function sendJson(res: http.ServerResponse, data: any, statusCode: number = 200): void {
    res.writeHead(statusCode, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(data));
}

/**
 * Send error response
 */
export function sendError(res: http.ServerResponse, message: string, statusCode: number = 400): void {
    sendJson(res, { error: message, status: 'error' }, statusCode);
}

/**
 * Request context passed to route handlers
 */
export interface RequestContext {
    req: http.IncomingMessage;
    res: http.ServerResponse;
    method: string;
    pathname: string;
    query: Record<string, string>;
    params: Record<string, string>;
}

/**
 * Create and start the API server
 */
export function createApiServer(port: number = 8000): http.Server {
    const server = http.createServer(async (req, res) => {
        const startTime = Date.now();
        
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            });
            res.end();
            return;
        }
        
        const parsedUrl = parseUrl(req.url || '/', true);
        const pathname = parsedUrl.pathname || '/';
        const query = parsedUrl.query as Record<string, string>;
        
        const ctx: RequestContext = {
            req,
            res,
            method: req.method || 'GET',
            pathname,
            query,
            params: {},
        };
        
        try {
            // Route to appropriate handler
            if (pathname === '/' || pathname === '/health' || pathname === '/ready' || pathname === '/metrics') {
                await handleHealthRoutes(ctx);
            } else if (pathname.startsWith('/api/v1/livekit/sip-dispatch')) {
                // LiveKit SIP dispatch webhook (must come before /api/v1/agents)
                await handleLivekitSipDispatchRoutes(ctx);
            } else if (pathname.startsWith('/api/v1/documents')) {
                // Production ingestion pipeline
                await handleDocumentIngestionRoutes(ctx);
            } else if (pathname.startsWith('/api/v1/agents')) {
                await handleAgentRoutes(ctx);
            } else if (pathname.startsWith('/api/v1/sessions')) {
                await handleSessionRoutes(ctx);
            } else if (pathname.startsWith('/api/v1/calls')) {
                await handleCallRoutes(ctx);
            } else if (pathname.startsWith('/api/v1/organizations')) {
                await handleOrganizationRoutes(ctx);
            } else if (pathname.startsWith('/api/v1/analytics')) {
                await handleAnalyticsRoutes(ctx);
            } else if (pathname.startsWith('/api/v1/integrations')) {
                await handleIntegrationRoutes(ctx);
            } else {
                sendError(res, 'Not Found', 404);
            }
        } catch (error) {
            logger.error('API request error', error);
            sendError(res, (error as Error).message || 'Internal Server Error', 500);
        }
        
        const latencyMs = Date.now() - startTime;
        logger.debug(`${req.method} ${pathname} - ${res.statusCode} (${latencyMs}ms)`);
    });
    
    server.on('error', (err: Error) => {
        logger.error('Server error:', err);
        process.exit(1);
    });
    
    server.listen(port, '0.0.0.0', () => {
        logger.info(`API server started on http://0.0.0.0:${port}`);
        logger.info('');
        logger.info('═══════════════════════════════════════════════════════════════');
        logger.info('                    AVAILABLE API ENDPOINTS                    ');
        logger.info('═══════════════════════════════════════════════════════════════');
        
        logger.info('');
        logger.info('📍 Health & Status');
        logger.info('  GET  /health                              - Health check');
        logger.info('  GET  /ready                               - Readiness check');
        logger.info('  GET  /metrics                             - Prometheus metrics');
        
        logger.info('');
        logger.info('🏢 Organizations');
        logger.info('  GET  /api/v1/organizations                - List all organizations');
        logger.info('  GET  /api/v1/organizations/:id            - Get organization by ID');
        logger.info('  GET  /api/v1/organizations/slug/:slug     - Get organization by slug');
        logger.info('  POST /api/v1/organizations/create         - Create organization');
        
        logger.info('');
        logger.info('🤖 Agents');
        logger.info('  GET  /api/v1/agents?tenant_id=xxx         - List agents by organization');
        logger.info('  GET  /api/v1/agents/:id                   - Get agent by ID');
        logger.info('  POST /api/v1/agents/create                - Create agent');
        logger.info('  PUT  /api/v1/agents/:id                   - Update agent');
        logger.info('  DELETE /api/v1/agents/:id                 - Delete agent');
        logger.info('  PATCH /api/v1/agents/:id/status           - Update agent status');
        logger.info('  POST /api/v1/agents/enhance-prompt        - AI prompt enhancement');
        logger.info('  GET  /api/v1/agents/validate/:id          - Validate phone conflicts');
        logger.info('  POST /api/v1/agents/route-by-phone        - Route call to agent');
        logger.info('  POST /api/v1/agents/bind_number           - Bind phone to agent');
        
        logger.info('');
        logger.info('📞 Calls');
        logger.info('  GET  /api/v1/calls?tenant_id=xxx          - List calls by org');
        logger.info('  GET  /api/v1/calls?agent_id=xxx           - List calls by agent');
        logger.info('  GET  /api/v1/calls/:session_id            - Get call by session ID');
        logger.info('  GET  /api/v1/calls/:session_id/transcript - Get call transcript');
        logger.info('  POST /api/v1/calls/outbound               - Initiate outbound call');
        
        logger.info('');
        logger.info('📊 Sessions');
        logger.info('  GET  /api/v1/sessions?organization_id=xxx - List sessions');
        logger.info('  GET  /api/v1/sessions/:id                 - Get session by ID');
        logger.info('  POST /api/v1/sessions/create              - Create session');
        logger.info('  PUT  /api/v1/sessions/:id/end             - End session');
        
        logger.info('');
        logger.info('📚 Documents (Knowledge Base)');
        logger.info('  GET  /api/v1/documents?agent_id=xxx       - List agent documents');
        logger.info('  GET  /api/v1/documents/:id                - Get document by ID');
        logger.info('  GET  /api/v1/documents/:id/status         - Get upload session status');
        logger.info('  GET  /api/v1/documents/:id/chunks         - Get document chunks');
        logger.info('  POST /api/v1/documents/ingest             - Upload & ingest document');
        logger.info('  POST /api/v1/documents/:id/confirm        - Confirm chunk preview');
        logger.info('  POST /api/v1/documents/:id/cancel         - Cancel upload session');
        logger.info('  DELETE /api/v1/documents/:id              - Delete document cascade');
        
        logger.info('');
        logger.info('📈 Analytics');
        logger.info('  GET  /api/v1/analytics?tenant_id=xxx      - Overview stats');
        logger.info('  GET  /api/v1/analytics/sessions           - Recent sessions');
        logger.info('  GET  /api/v1/analytics/agent/:agent_id    - Per-agent analytics');
        logger.info('  GET  /api/v1/analytics/latency/:agent_id  - Latency statistics');
        logger.info('  GET  /api/v1/analytics/functions/:agent_id- Function call stats');
        logger.info('  GET  /api/v1/analytics/health             - System health metrics');
        logger.info('  GET  /api/v1/analytics/charts/call-volume - Call volume chart data');
        logger.info('  GET  /api/v1/analytics/charts/status-dist - Status distribution');
        logger.info('  GET  /api/v1/analytics/charts/latency     - Latency trends');
        logger.info('  GET  /api/v1/analytics/charts/duration    - Call duration histogram');
        logger.info('  GET  /api/v1/analytics/charts/functions   - Function calls chart');
        logger.info('  GET  /api/v1/analytics/charts/sentiment   - Sentiment analysis');
        logger.info('  GET  /api/v1/analytics/charts/error-rate  - Error rate trends');
        logger.info('  GET  /api/v1/analytics/charts/peak-hours  - Peak usage hours');
        logger.info('  GET  /api/v1/analytics/charts/agent-perf  - Agent performance');
        logger.info('  GET  /api/v1/analytics/charts/today-stats - Today statistics');
        
        logger.info('');
        logger.info('🔌 Integrations');
        logger.info('  GET  /api/v1/integrations/available       - List available tools');
        logger.info('  GET  /api/v1/integrations/agent/:id       - List agent integrations');
        logger.info('  POST /api/v1/integrations/configure       - Configure integration');
        logger.info('  DELETE /api/v1/integrations/:id           - Delete integration');
        logger.info('  POST /api/v1/integrations/test-webhook    - Test webhook (CORS proxy)');
        logger.info('  POST /api/v1/integrations/send-to-sheets  - Send data to sheets');
        
        logger.info('');
        logger.info('📡 LiveKit SIP');
        logger.info('  POST /api/v1/livekit/sip-dispatch         - SIP dispatch webhook');
        
        logger.info('');
        logger.info('═══════════════════════════════════════════════════════════════');
    });
    
    return server;
}

// Run server if this file is executed directly
// Start API server
const port = parseInt(process.env.API_PORT || '8000', 10);
const server = createApiServer(port);

// Keep the process alive
process.on('SIGINT', () => {
    logger.info('Shutting down API server...');
    server.close(() => {
        logger.info('API server stopped');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    logger.info('Shutting down API server...');
    server.close(() => {
        logger.info('API server stopped');
        process.exit(0);
    });
});
