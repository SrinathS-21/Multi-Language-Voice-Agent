/**
 * Call Routes
 * 
 * Endpoints:
 * - GET /api/v1/calls - List calls
 * - GET /api/v1/calls/:session_id - Get call details
 * - GET /api/v1/calls/:session_id/transcript - Get call transcript
 * - POST /api/v1/calls/outbound - Initiate outbound call (telephony)
 */

import { RequestContext, sendJson, sendError, parseBody } from '../server.js';
import { logger } from '../../core/logging.js';
import { getConvexClient, isConvexConfigured } from '../../core/convex-client.js';
import {
    createOutboundCallHandler,
    createLatencyTracker,
    isOutboundEnabled,
    validatePhoneNumber,
    type OutboundCallRequest,
} from '../../telephony/index.js';

export async function handleCallRoutes(ctx: RequestContext): Promise<void> {
    const { pathname, method, query, res } = ctx;
    
    if (!isConvexConfigured()) {
        sendError(res, 'Convex not configured', 503);
        return;
    }
    
    const convex = getConvexClient();
    
    // GET /api/v1/calls?tenant_id=xxx&agent_id=xxx
    if (pathname === '/api/v1/calls' && method === 'GET') {
        const tenantId = query.tenant_id;
        const agentId = query.agent_id;
        const limit = parseInt(query.limit || '100', 10);
        const offset = parseInt(query.offset || '0', 10);
        
        logger.info('List calls request', { tenantId, agentId, limit, offset });
        
        try {
            let sessions;
            
            if (agentId) {
                // Filter by agent ID if provided
                logger.info('Fetching calls by agentId', { agentId });
                sessions = await convex.query('callSessions:listByAgent', {
                    agentId: agentId,
                    limit: limit + offset, // Get more to handle offset
                });
                logger.info('Fetched sessions by agent', { count: sessions?.length || 0 });
            } else if (tenantId) {
                // Otherwise filter by organization
                logger.info('Fetching calls by tenantId', { tenantId });
                sessions = await convex.query('callSessions:listByOrganization', {
                    organizationId: tenantId,
                });
                logger.info('Fetched sessions by organization', { count: sessions?.length || 0 });
            } else {
                // Return empty if no tenant_id to avoid full table scan
                logger.warning('No tenantId or agentId provided for calls list');
                sendJson(res, { total: 0, items: [] });
                return;
            }
            
            const total = sessions?.length || 0;
            const paginated = (sessions || []).slice(offset, offset + limit);
            
            logger.info('Returning calls', { total, paginated: paginated.length });
            
            sendJson(res, {
                total,
                items: paginated.map((s: any) => {
                    // Calculate duration if missing but session has end time
                    let durationSeconds = s.durationSeconds;
                    if (!durationSeconds && s.endedAt && s.startedAt) {
                        durationSeconds = Math.floor((s.endedAt - s.startedAt) / 1000);
                    }
                    
                    return {
                        session_id: s.sessionId,
                        call_sid: s.callSid,
                        phone_number: s.callerPhoneNumber || s.destinationPhoneNumber,
                        agent_id: s.agentId,
                        agent_type: s.agentType,
                        status: s.status,
                        started_at: s.startedAt,
                        ended_at: s.endedAt,
                        duration_seconds: durationSeconds,
                        call_type: s.callType,
                    };
                }),
            });
            
        } catch (error) {
            logger.error('List calls failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/calls/:session_id
    const getMatch = pathname.match(/^\/api\/v1\/calls\/([^/]+)$/);
    if (getMatch && method === 'GET') {
        const sessionId = getMatch[1];
        
        try {
            const session = await convex.query('callSessions:getBySessionId', { sessionId });
            
            if (!session) {
                sendError(res, 'Call not found', 404);
                return;
            }
            
            // Calculate duration if missing but session has end time
            let durationSeconds = session.durationSeconds;
            if (!durationSeconds && session.endedAt && session.startedAt) {
                durationSeconds = Math.floor((session.endedAt - session.startedAt) / 1000);
            }
            
            sendJson(res, {
                session_id: session.sessionId,
                call_sid: session.callSid,
                phone_number: session.phoneNumber,
                agent_type: session.agentType,
                status: session.status,
                started_at: session.startedAt,
                ended_at: session.endedAt,
                duration_seconds: durationSeconds,
                config: session.config ? JSON.parse(session.config) : null,
            });
            
        } catch (error) {
            logger.error('Get call failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/calls/:session_id/transcript
    const transcriptMatch = pathname.match(/^\/api\/v1\/calls\/([^/]+)\/transcript$/);
    if (transcriptMatch && method === 'GET') {
        const sessionId = transcriptMatch[1];
        
        try {
            const interactions = await convex.query('callInteractions:getBySessionId', { sessionId });
            
            // Format as conversation
            const conversation = (interactions || []).map((i: any) => {
                if (i.interactionType === 'user_message') {
                    return { role: 'user', content: i.userInput, timestamp: i.timestamp };
                } else if (i.interactionType === 'agent_response') {
                    return { role: 'assistant', content: i.agentResponse, timestamp: i.timestamp };
                } else if (i.interactionType === 'function_call') {
                    return {
                        role: 'function',
                        name: i.functionName,
                        params: i.functionParams ? JSON.parse(i.functionParams) : null,
                        result: i.functionResult ? JSON.parse(i.functionResult) : null,
                        timestamp: i.timestamp,
                    };
                }
                return null;
            }).filter(Boolean);
            
            sendJson(res, {
                session_id: sessionId,
                conversation,
                total_messages: conversation.length,
            });
            
        } catch (error) {
            logger.error('Get transcript failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // POST /api/v1/calls/outbound - Initiate outbound call
    if (pathname === '/api/v1/calls/outbound' && method === 'POST') {
        try {
            // Check if outbound calling is enabled
            if (!isOutboundEnabled()) {
                sendError(res, 'Outbound calling is not enabled', 503);
                return;
            }
            
            const body = await parseBody<OutboundCallRequest>(ctx.req);
            
            // Validate required fields
            if (!body.organizationId) {
                sendError(res, 'organizationId is required', 400);
                return;
            }
            if (!body.agentId) {
                sendError(res, 'agentId is required', 400);
                return;
            }
            if (!body.phoneNumber) {
                sendError(res, 'phoneNumber is required', 400);
                return;
            }
            
            // Validate phone number format
            const phoneValidation = validatePhoneNumber(body.phoneNumber);
            if (!phoneValidation.isValid) {
                sendError(res, phoneValidation.error || 'Invalid phone number', 400);
                return;
            }
            
            // Create latency tracker and outbound handler
            const latencyTracker = createLatencyTracker(`outbound_${Date.now()}`);
            const outboundHandler = createOutboundCallHandler(latencyTracker);
            
            // Initiate the outbound call
            const response = await outboundHandler.initiateCall({
                organizationId: body.organizationId,
                agentId: body.agentId,
                phoneNumber: phoneValidation.e164!,
                roomName: body.roomName,
                ringTimeout: body.ringTimeout,
                metadata: body.metadata,
            });
            
            if (!response.success) {
                sendError(res, response.error || 'Failed to initiate call', 500);
                return;
            }
            
            logger.info('Outbound call initiated via API', {
                callId: response.callId,
                roomName: response.roomName,
                organizationId: body.organizationId,
                agentId: body.agentId,
            });
            
            sendJson(res, {
                success: true,
                call_id: response.callId,
                room_name: response.roomName,
                sip_participant_id: response.sipParticipantId,
                state: response.state,
                initiated_at: response.initiatedAt,
            }, 201);
            
        } catch (error) {
            logger.error('Initiate outbound call failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    sendError(res, 'Not Found', 404);
}
