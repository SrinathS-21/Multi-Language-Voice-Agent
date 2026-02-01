/**
 * Agent Routes
 * 
 * Endpoints:
 * - POST /api/v1/agents/create - Create agent
 * - GET /api/v1/agents/:id - Get agent by ID
 * - GET /api/v1/agents?tenant_id=xxx - List agents by organization
 * - PUT /api/v1/agents/:id - Update agent
 * - DELETE /api/v1/agents/:id - Delete agent
 * - PATCH /api/v1/agents/:id/status - Update agent status
 * - GET /api/v1/agents/validate/:id - Validate phone number conflicts
 * - POST /api/v1/agents/route-by-phone - Get active agent for phone number (SIP routing)
 * - POST /api/v1/agents/bind_number - Bind phone number to agent (legacy)
 */

import { RequestContext, sendJson, sendError, parseJsonBody } from '../server.js';
import { logger } from '../../core/logging.js';
import { getConvexClient, isConvexConfigured } from '../../core/convex-client.js';

export async function handleAgentRoutes(ctx: RequestContext): Promise<void> {
    const { pathname, method, query, res, req } = ctx;
    
    if (!isConvexConfigured()) {
        sendError(res, 'Convex not configured', 503);
        return;
    }
    
    const convex = getConvexClient();
    
    // POST /api/v1/agents/create
    if (pathname === '/api/v1/agents/create' && method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            
            // DEBUG: Log what we're receiving
            logger.info('🔍 CREATE AGENT REQUEST:', {
                hasName: !!body.name,
                hasGreeting: !!body.greeting,
                hasFarewell: !!body.farewell,
                hasLanguage: !!body.language,
                hasAiPersonaName: !!body.ai_persona_name,
                hasPhoneFields: !!body.phone_country_code || !!body.phone_number,
                bodyKeys: Object.keys(body),
                fullBody: body,
            });
            
            const { tenant_id, name, role, system_prompt, config: agentConfig, ai_persona_name, greeting, farewell, language, phone_country_code, phone_number, phone_location, enable_contextual_enrichment } = body;
            
            if (!tenant_id) {
                sendError(res, 'tenant_id is required', 400);
                return;
            }
            if (!name) {
                sendError(res, 'name is required', 400);
                return;
            }
            
            // Resolve tenant_id (can be Convex ID or slug)
            let organizationId = tenant_id;
            if (typeof tenant_id === 'string' && !tenant_id.startsWith('j')) {
                // Looks like a slug, try to resolve it
                const org = await convex.query('organizations:getBySlug', { slug: tenant_id });
                if (org) {
                    organizationId = org._id;
                }
            }
            
            // Create agent
            const agentId = await convex.mutation('agents:create', {
                organizationId: String(organizationId),
                name,
                role: role || 'Assistant',
                systemPrompt: system_prompt || `You are ${name}, a helpful voice assistant.`,
                config: agentConfig ? JSON.stringify(agentConfig) : undefined,
                aiPersonaName: ai_persona_name,
                greeting,
                farewell,
                language,
                phoneCountryCode: phone_country_code,
                phoneNumber: phone_number,
                phoneLocation: phone_location,
                enableContextualEnrichment: enable_contextual_enrichment ?? true,
            });
            
            logger.info('Agent created', { agentId, name, organizationId });
            
            sendJson(res, {
                agent: {
                    id: agentId,
                    name,
                    role: role || 'Assistant',
                    organization_id: organizationId,
                },
                message: 'Agent created successfully',
            }, 201);
            
        } catch (error) {
            logger.error('Create agent failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/agents?tenant_id=xxx
    if (pathname === '/api/v1/agents' && method === 'GET') {
        const tenantId = query.tenant_id;
        
        if (!tenantId) {
            sendError(res, 'tenant_id query parameter is required', 400);
            return;
        }
        
        try {
            const agents = await convex.query('agents:listByOrganization', {
                organizationId: tenantId,
            });
            
            sendJson(res, {
                agents: (agents || []).map((a: any) => ({
                    id: a._id,
                    name: a.name,
                    role: a.role,
                    system_prompt: a.systemPrompt,
                    config: a.config ? JSON.parse(a.config) : null,
                    status: a.status || 'active',
                    created_at: a.createdAt,
                })),
                total: agents?.length || 0,
            });
            
        } catch (error) {
            logger.error('List agents failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/agents/:id
    const getMatch = pathname.match(/^\/api\/v1\/agents\/([^/]+)$/);
    if (getMatch && method === 'GET') {
        const agentId = getMatch[1];
        
        try {
            const agent = await convex.query('agents:getById', { agentId });
            
            if (!agent) {
                sendError(res, 'Agent not found', 404);
                return;
            }
            
            sendJson(res, {
                id: agent._id,
                name: agent.name,
                role: agent.role,
                system_prompt: agent.systemPrompt,
                config: agent.config ? JSON.parse(agent.config) : null,
                ai_persona_name: agent.aiPersonaName,
                greeting: agent.greeting,
                farewell: agent.farewell,
                language: agent.language,
                phone_country_code: agent.phoneCountryCode,
                phone_number: agent.phoneNumber,
                phone_location: agent.phoneLocation,
                enable_contextual_enrichment: agent.enableContextualEnrichment,
                status: agent.status || 'active',
                organization_id: agent.organizationId,
                created_at: agent.createdAt,
                updated_at: agent.updatedAt,
            });
            
        } catch (error) {
            logger.error('Get agent failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // PUT /api/v1/agents/:id
    if (getMatch && method === 'PUT') {
        const agentId = getMatch[1];
        
        try {
            const body = await parseJsonBody(req);
            
            await convex.mutation('agents:update', {
                agentId,
                name: body.name,
                role: body.role,
                systemPrompt: body.system_prompt,
                config: body.config ? JSON.stringify(body.config) : undefined,
                aiPersonaName: body.ai_persona_name,
                greeting: body.greeting,
                farewell: body.farewell,
                language: body.language,
                phoneCountryCode: body.phone_country_code,
                phoneNumber: body.phone_number,
                phoneLocation: body.phone_location,
                enableContextualEnrichment: body.enable_contextual_enrichment,
            });
            
            sendJson(res, {
                success: true,
                message: 'Agent updated',
                agent_id: agentId,
            });
            
        } catch (error) {
            logger.error('Update agent failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // PATCH /api/v1/agents/:id/status
    const statusMatch = pathname.match(/^\/api\/v1\/agents\/([^\/]+)\/status$/);
    if (statusMatch && method === 'PATCH') {
        const agentId = statusMatch[1];
        
        try {
            const body = await parseJsonBody(req);
            
            if (!body.status || !['active', 'inactive'].includes(body.status)) {
                sendError(res, 'Invalid status. Must be "active" or "inactive"', 400);
                return;
            }
            
            await convex.mutation('agents:updateStatus', {
                agentId,
                status: body.status,
            });
            
            sendJson(res, {
                success: true,
                message: `Agent status updated to ${body.status}`,
                agent_id: agentId,
                status: body.status,
            });
            
        } catch (error) {
            logger.error('Update agent status failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // DELETE /api/v1/agents/:id
    if (getMatch && method === 'DELETE') {
        const agentId = getMatch[1];
        
        try {
            await convex.mutation('agents:deleteAgent', { agentId });
            
            sendJson(res, {
                success: true,
                message: 'Agent deleted',
                agent_id: agentId,
            });
            
        } catch (error) {
            logger.error('Delete agent failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // POST /api/v1/agents/bind_number
    if (pathname === '/api/v1/agents/bind_number' && method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            
            const { phone_number, agent_id } = body;
            
            if (!phone_number || !agent_id) {
                sendError(res, 'phone_number and agent_id are required', 400);
                return;
            }
            
            // Update phone config to bind to agent
            await convex.mutation('phoneConfigs:bindToAgent', {
                phoneNumber: phone_number,
                agentId: agent_id,
            });
            
            sendJson(res, {
                success: true,
                message: 'Phone number bound to agent',
                phone_number,
                agent_id,
            });
            
        } catch (error) {
            logger.error('Bind number failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/agents/validate/:id - Validate phone number conflicts
    const validateMatch = pathname.match(/^\/api\/v1\/agents\/validate\/([^\/]+)$/);
    if (validateMatch && method === 'GET') {
        const agentId = validateMatch[1];
        
        try {
            const validation = await convex.query('agents:validatePhoneNumberStatus', {
                agentId,
            });
            
            sendJson(res, validation);
            
        } catch (error) {
            logger.error('Validate agent phone failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // POST /api/v1/agents/route-by-phone - Get active agent for incoming call
    if (pathname === '/api/v1/agents/route-by-phone' && method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            
            const { phone_country_code, phone_number, organization_id } = body;
            
            if (!phone_country_code || !phone_number) {
                sendError(res, 'phone_country_code and phone_number are required', 400);
                return;
            }
            
            logger.info('🔍 Routing incoming call', {
                phoneCountryCode: phone_country_code,
                phoneNumber: phone_number,
                organizationId: organization_id,
            });
            
            // Get active agent for this phone number
            const agent = await convex.query('agents:getActiveAgentForPhone', {
                phoneCountryCode: phone_country_code,
                phoneNumber: phone_number,
                organizationId: organization_id,
            });
            
            if (!agent) {
                logger.warning('❌ No active agent found for phone number', {
                    phoneCountryCode: phone_country_code,
                    phoneNumber: phone_number,
                });
                
                sendJson(res, {
                    success: false,
                    error: 'No active agent found for this phone number',
                    agent: null,
                }, 404);
                return;
            }
            
            logger.info('✅ Agent found for incoming call', {
                agentId: agent._id,
                agentName: agent.name,
                status: agent.status,
            });
            
            sendJson(res, {
                success: true,
                agent: {
                    id: agent._id,
                    name: agent.name,
                    organization_id: agent.organizationId,
                    status: agent.status,
                    greeting: agent.greeting,
                    language: agent.language,
                },
            });
            
        } catch (error) {
            logger.error('Route by phone failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // POST /api/v1/agents/enhance-prompt - AI-powered prompt enhancement
    if (pathname === '/api/v1/agents/enhance-prompt' && method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const { basePrompt, agentName, agentRole, businessName, tools, includeSections } = body;
            
            if (!basePrompt || !agentName) {
                sendError(res, 'basePrompt and agentName are required', 400);
                return;
            }
            
            // Call the prompt enhancer action with extended timeout (AI calls can take time)
            const result = await convex.action('promptEnhancer/index:enhancePrompt', {
                basePrompt,
                agentName,
                agentRole,
                businessName,
                tools,
                includeSections,
            }, 60000); // 60 second timeout for AI API calls
            
            sendJson(res, {
                status: 'success',
                ...result,
            });
            
        } catch (error) {
            logger.error('Enhance prompt failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    sendError(res, 'Not Found', 404);
}
