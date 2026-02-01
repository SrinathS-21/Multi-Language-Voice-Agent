/**
 * Session Routes
 * 
 * Endpoints:
 * - POST /api/v1/sessions/create - Create session
 * - GET /api/v1/sessions/:id - Get session by ID
 * - GET /api/v1/sessions?organization_id=xxx - List sessions
 * - PUT /api/v1/sessions/:id/end - End session
 */

import { RequestContext, sendJson, sendError, parseJsonBody } from '../server.js';
import { logger } from '../../core/logging.js';
import { getConvexClient, isConvexConfigured } from '../../core/convex-client.js';
import { SessionService } from '../../services/session.js';
import { CallType } from '../../models/session.js';
import { v4 as uuidv4 } from 'uuid';

const sessionService = new SessionService();

export async function handleSessionRoutes(ctx: RequestContext): Promise<void> {
    const { pathname, method, query, res, req } = ctx;
    
    if (!isConvexConfigured()) {
        sendError(res, 'Convex not configured', 503);
        return;
    }
    
    const convex = getConvexClient();
    
    // POST /api/v1/sessions/create
    if (pathname === '/api/v1/sessions/create' && method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            
            const {
                organization_id,
                agent_id,
                room_name,
                call_type = 'web',
                config: sessionConfig,
            } = body;
            
            if (!organization_id) {
                sendError(res, 'organization_id is required', 400);
                return;
            }
            
            // Create session
            const session = await sessionService.createSession({
                organizationId: organization_id,
                agentId: agent_id,
                roomName: room_name || `room_${uuidv4()}`,
                callType: call_type as CallType,
                config: sessionConfig,
            });
            
            logger.info('Session created via API', { sessionId: session.sessionId });
            
            sendJson(res, {
                session_id: session.sessionId,
                organization_id: session.organizationId,
                agent_id: session.agentId,
                room_name: session.roomName,
                status: session.status,
                call_type: session.callType,
                started_at: session.startedAt,
            }, 201);
            
        } catch (error) {
            logger.error('Create session failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/sessions?organization_id=xxx
    if (pathname === '/api/v1/sessions' && method === 'GET') {
        const organizationId = query.organization_id;
        const status = query.status;
        const limit = parseInt(query.limit || '50', 10);
        
        try {
            let sessions;
            
            if (organizationId) {
                sessions = await convex.query('callSessions:listByOrganization', {
                    organizationId,
                });
            } else if (status === 'active') {
                sessions = await convex.query('callSessions:getAllActiveSessions', {});
            } else {
                sendError(res, 'organization_id or status=active is required', 400);
                return;
            }
            
            // Apply limit
            sessions = (sessions || []).slice(0, limit);
            
            sendJson(res, {
                sessions: sessions.map((s: any) => ({
                    session_id: s.sessionId,
                    organization_id: s.organizationId,
                    agent_id: s.agentId,
                    room_name: s.roomName,
                    status: s.status,
                    call_type: s.callType,
                    started_at: s.startedAt,
                    ended_at: s.endedAt,
                    duration_seconds: s.durationSeconds,
                })),
                total: sessions.length,
            });
            
        } catch (error) {
            logger.error('List sessions failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/sessions/:id
    const getMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/);
    if (getMatch && method === 'GET') {
        const sessionId = getMatch[1];
        
        try {
            const session = await convex.query('callSessions:getBySessionId', { sessionId });
            
            if (!session) {
                sendError(res, 'Session not found', 404);
                return;
            }
            
            // Calculate duration if missing but session has end time
            let durationSeconds = session.durationSeconds;
            if (!durationSeconds && session.endedAt && session.startedAt) {
                durationSeconds = Math.floor((session.endedAt - session.startedAt) / 1000);
            }
            
            sendJson(res, {
                session_id: session.sessionId,
                organization_id: session.organizationId,
                agent_id: session.agentId,
                room_name: session.roomName,
                status: session.status,
                call_type: session.callType,
                started_at: session.startedAt,
                ended_at: session.endedAt,
                duration_seconds: durationSeconds,
                config: session.config ? JSON.parse(session.config) : null,
                metadata: session.metadata ? JSON.parse(session.metadata) : null,
            });
            
        } catch (error) {
            logger.error('Get session failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // PUT /api/v1/sessions/:id/end
    const endMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/end$/);
    if (endMatch && method === 'PUT') {
        const sessionId = endMatch[1];
        
        try {
            await sessionService.endSession(sessionId);
            
            sendJson(res, {
                success: true,
                message: 'Session ended',
                session_id: sessionId,
            });
            
        } catch (error) {
            logger.error('End session failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/sessions/:id/transcript
    const transcriptMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/transcript$/);
    if (transcriptMatch && method === 'GET') {
        const sessionId = transcriptMatch[1];
        
        try {
            const interactions = await convex.query('callInteractions:getBySessionId', { sessionId });
            
            sendJson(res, {
                session_id: sessionId,
                interactions: (interactions || []).map((i: any) => ({
                    type: i.interactionType,
                    timestamp: i.timestamp,
                    user_input: i.userInput,
                    agent_response: i.agentResponse,
                    function_name: i.functionName,
                    function_params: i.functionParams ? JSON.parse(i.functionParams) : null,
                    function_result: i.functionResult ? JSON.parse(i.functionResult) : null,
                    latency_ms: i.latencyMs,
                })),
                total: interactions?.length || 0,
            });
            
        } catch (error) {
            logger.error('Get transcript failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    sendError(res, 'Not Found', 404);
}
