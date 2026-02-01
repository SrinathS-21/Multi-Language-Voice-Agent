/**
 * Organization Routes
 * 
 * Endpoints:
 * - POST /api/v1/organizations/create - Create organization
 * - GET /api/v1/organizations - List organizations
 * - GET /api/v1/organizations/:id - Get organization by ID
 * - GET /api/v1/organizations/slug/:slug - Get organization by slug
 */

import { RequestContext, sendJson, sendError, parseJsonBody } from '../server.js';
import { logger } from '../../core/logging.js';
import { getConvexClient, isConvexConfigured } from '../../core/convex-client.js';

export async function handleOrganizationRoutes(ctx: RequestContext): Promise<void> {
    const { pathname, method, query, res, req } = ctx;
    
    if (!isConvexConfigured()) {
        sendError(res, 'Convex not configured', 503);
        return;
    }
    
    const convex = getConvexClient();
    
    // POST /api/v1/organizations/create
    if (pathname === '/api/v1/organizations/create' && method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            
            const { name, slug, status = 'active', config } = body;
            
            if (!name) {
                sendError(res, 'name is required', 400);
                return;
            }
            if (!slug) {
                sendError(res, 'slug is required', 400);
                return;
            }
            
            // Check if slug already exists
            const existing = await convex.query('organizations:getBySlug', { slug });
            if (existing) {
                sendError(res, `Organization with slug '${slug}' already exists`, 409);
                return;
            }
            
            // Create organization
            const orgId = await convex.mutation('organizations:create', {
                name,
                slug,
                status,
                config: config ? JSON.stringify(config) : undefined,
                createdAt: Date.now(),
            });
            
            logger.info('Organization created', { orgId, name, slug });
            
            sendJson(res, {
                _id: orgId,
                name,
                slug,
                status,
                message: 'Organization created successfully',
            }, 201);
            
        } catch (error) {
            logger.error('Create organization failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/organizations
    if (pathname === '/api/v1/organizations' && method === 'GET') {
        try {
            const organizations = await convex.query('organizations:list', {});
            
            sendJson(res, {
                organizations: (organizations || []).map((o: any) => ({
                    _id: o._id,
                    name: o.name,
                    slug: o.slug,
                    status: o.status,
                    created_at: o.createdAt,
                })),
                total: organizations?.length || 0,
            });
            
        } catch (error) {
            logger.error('List organizations failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/organizations/slug/:slug
    const slugMatch = pathname.match(/^\/api\/v1\/organizations\/slug\/([^/]+)$/);
    if (slugMatch && method === 'GET') {
        const slug = slugMatch[1];
        
        try {
            const org = await convex.query('organizations:getBySlug', { slug });
            
            if (!org) {
                sendError(res, 'Organization not found', 404);
                return;
            }
            
            sendJson(res, {
                _id: org._id,
                name: org.name,
                slug: org.slug,
                status: org.status,
                config: org.config ? JSON.parse(org.config) : null,
                created_at: org.createdAt,
            });
            
        } catch (error) {
            logger.error('Get organization by slug failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    // GET /api/v1/organizations/:id
    const getMatch = pathname.match(/^\/api\/v1\/organizations\/([^/]+)$/);
    if (getMatch && method === 'GET') {
        const orgId = getMatch[1];
        
        try {
            const org = await convex.query('organizations:getById', { id: orgId });
            
            if (!org) {
                sendError(res, 'Organization not found', 404);
                return;
            }
            
            sendJson(res, {
                _id: org._id,
                name: org.name,
                slug: org.slug,
                status: org.status,
                config: org.config ? JSON.parse(org.config) : null,
                created_at: org.createdAt,
            });
            
        } catch (error) {
            logger.error('Get organization failed', error);
            sendError(res, (error as Error).message, 500);
        }
        return;
    }
    
    sendError(res, 'Not Found', 404);
}
