/**
 * LiveKit SIP Dispatch Webhook Handler
 * 
 * This webhook is called by LiveKit when an incoming SIP call arrives.
 * It queries the active agent for the called phone number and returns
 * a dynamic room name containing the correct agent ID.
 * 
 * Performance: Optimized for < 500ms SIP connect time
 * - Uses indexed Convex queries (< 100ms)
 * - Minimal processing overhead
 * - Fallback to default agent if no active agent found
 * 
 * LiveKit Dispatch Rule Webhook Payload:
 * {
 *   "call_id": "string",
 *   "trunk_id": "string", 
 *   "sip_call_id": "string",
 *   "from_user": {
 *     "name": "string",
 *     "number": "+12345678901"
 *   },
 *   "to_user": {
 *     "name": "string", 
 *     "number": "+19876543210"  // The number being called (our agent's phone)
 *   }
 * }
 * 
 * Expected Response:
 * {
 *   "room_name": "call-orgId_agentId_timestamp",
 *   "participant_identity": "sip-caller-12345",
 *   "participant_name": "Caller from +12345678901"
 * }
 */

import { RequestContext, sendJson, sendError, parseJsonBody } from '../server.js';
import { logger } from '../../core/logging.js';
import { getConvexClient, isConvexConfigured } from '../../core/convex-client.js';

export async function handleLivekitSipDispatchRoutes(ctx: RequestContext): Promise<void> {
    const { pathname, method, res, req } = ctx;
    
    // POST /api/v1/livekit/sip-dispatch
    if (pathname === '/api/v1/livekit/sip-dispatch' && method === 'POST') {
        const startTime = Date.now();
        
        try {
            if (!isConvexConfigured()) {
                logger.error('[SIP Dispatch] Convex not configured');
                sendError(res, 'Service unavailable', 503);
                return;
            }
            
            const convex = getConvexClient();
            const payload = await parseJsonBody(req);
            
            // Extract called number (to_user.number is the agent's phone)
            const calledNumber = payload.to_user?.number;
            if (!calledNumber) {
                logger.error('[SIP Dispatch] Missing to_user.number in payload:', payload);
                sendError(res, 'Missing to_user.number', 400);
                return;
            }
            
            // Parse phone number into country code and number
            // Format: +[country code][number] e.g., "+919876543210"
            const phoneMatch = calledNumber.match(/^\+(\d{1,4})(\d+)$/);
            if (!phoneMatch) {
                logger.error('[SIP Dispatch] Invalid phone number format:', calledNumber);
                sendError(res, 'Invalid phone number format. Expected: +[country code][number]', 400);
                return;
            }
            
            const [, countryCode, phoneNumber] = phoneMatch;
            
            logger.info(`[SIP Dispatch] Incoming call to +${countryCode}${phoneNumber}`);
            logger.info(`[SIP Dispatch] From: ${payload.from_user?.number || 'unknown'}`);
            
            // Query active agent for this phone number (optimized query with indexes)
            const queryStartTime = Date.now();
            const activeAgent = await convex.query('agents:getActiveAgentForPhone', {
                phoneCountryCode: `+${countryCode}`,
                phoneNumber: phoneNumber,
            });
            const queryDuration = Date.now() - queryStartTime;
            
            logger.info(`[SIP Dispatch] Query took ${queryDuration}ms`);
            
            let roomName: string;
            let agentId: string;
            let organizationId: string;
            
            if (activeAgent) {
                agentId = activeAgent._id;
                organizationId = activeAgent.organizationId || process.env.DEFAULT_ORGANIZATION_ID || "default_org";
                roomName = `call-${organizationId}_${agentId}_${Date.now()}`;
                
                logger.info(`[SIP Dispatch] Found active agent: ${activeAgent.name} (${agentId})`);
            } else {
                // Fallback to default agent if no active agent found
                agentId = process.env.DEFAULT_AGENT_ID || "fallback_agent";
                organizationId = process.env.DEFAULT_ORGANIZATION_ID || "default_org";
                roomName = `call-${organizationId}_${agentId}_${Date.now()}`;
                
                logger.warning(`[SIP Dispatch] No active agent found for +${countryCode}${phoneNumber}, using fallback agent: ${agentId}`);
            }
            
            // Generate participant identity and name for the caller
            const callerNumber = payload.from_user?.number || 'unknown';
            const participantIdentity = `sip-caller-${payload.call_id || Date.now()}`;
            const participantName = `Caller from ${callerNumber}`;
            
            const response = {
                room_name: roomName,
                participant_identity: participantIdentity,
                participant_name: participantName,
            };
            
            const totalDuration = Date.now() - startTime;
            logger.info(`[SIP Dispatch] Total processing time: ${totalDuration}ms`);
            logger.info(`[SIP Dispatch] Routing to room: ${roomName}`);
            
            if (totalDuration > 500) {
                logger.warning(`[SIP Dispatch] WARNING: Processing time ${totalDuration}ms exceeds 500ms target`);
            }
            
            sendJson(res, response);
            
        } catch (error) {
            logger.error('[SIP Dispatch] Error processing webhook:', error);
            
            // Return fallback room on error to avoid dropped calls
            const fallbackAgentId = process.env.DEFAULT_AGENT_ID || "fallback_agent";
            const fallbackOrgId = process.env.DEFAULT_ORGANIZATION_ID || "default_org";
            const fallbackRoomName = `call-${fallbackOrgId}_${fallbackAgentId}_${Date.now()}`;
            
            logger.info(`[SIP Dispatch] Returning fallback room due to error: ${fallbackRoomName}`);
            
            sendJson(res, {
                room_name: fallbackRoomName,
                participant_identity: `sip-caller-${Date.now()}`,
                participant_name: "Caller (error fallback)",
            });
        }
        
        return;
    }
    
    // If no routes matched
    sendError(res, 'Not Found', 404);
}
