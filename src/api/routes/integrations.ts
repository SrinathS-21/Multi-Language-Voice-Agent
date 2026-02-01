import { RequestContext, sendJson, sendError, parseJsonBody } from '../server.js';
import { logger } from '../../core/logging.js';
import { getConvexClient, isConvexConfigured } from '../../core/convex-client.js';

/**
 * Handle integration routes
 */
export async function handleIntegrationRoutes(ctx: RequestContext): Promise<void> {
  const { req, res, method, pathname, query } = ctx;
  
  if (!isConvexConfigured()) {
    sendError(res, 'Convex not configured', 503);
    return;
  }
  
  const convex = getConvexClient();
  
  // GET /api/v1/integrations/available - List available integration tools
  if (pathname === '/api/v1/integrations/available' && method === 'GET') {
    try {
      const activeOnly = query.active_only === 'true';
      const tools = await convex.query('integrations:listAvailableTools', {
        activeOnly,
      });
      
      sendJson(res, {
        status: 'success',
        tools: tools || [],
      });
    } catch (error) {
      logger.error('List available tools failed', error);
      sendError(res, (error as Error).message, 500);
    }
    return;
  }
  
  // GET /api/v1/integrations/agent/:agentId - Get agent's configured integrations
  const agentIntegrationsMatch = pathname.match(/^\/api\/v1\/integrations\/agent\/([^/]+)$/);
  if (agentIntegrationsMatch && method === 'GET') {
    const agentId = agentIntegrationsMatch[1];
    
    try {
      const integrations = await convex.query('integrations:listAgentIntegrations', {
        agentId,
      });
      
      sendJson(res, {
        status: 'success',
        integrations: integrations || [],
      });
    } catch (error) {
      logger.error('List agent integrations failed', error);
      sendError(res, (error as Error).message, 500);
    }
    return;
  }
  
  // POST /api/v1/integrations/configure - Configure integration for agent
  if (pathname === '/api/v1/integrations/configure' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { agentId, toolId, config, enabled, enabledTriggers, name, status } = body;
      
      if (!agentId || !toolId) {
        sendError(res, 'agentId and toolId are required', 400);
        return;
      }
      
      // Get organizationId - either from body, or fetch from agent, or use default
      let organizationId = body.organizationId;
      if (!organizationId) {
        // Try to fetch the agent to get its organizationId
        try {
          const agent = await convex.query('agents:get', { id: agentId });
          organizationId = agent?.organizationId || 'jx763x0zjyhwfc0mr39h107zyd7zgyjt';
        } catch (error) {
          // If agent fetch fails, use default org
          organizationId = 'jx763x0zjyhwfc0mr39h107zyd7zgyjt';
        }
      }
      
      const integrationId = await convex.mutation('integrations:createIntegration', {
        agentId,
        toolId,
        organizationId,
        name: name || toolId, // Use provided name or fallback to toolId
        config: config || {}, // Pass config object directly, Convex will stringify it
        enabledTriggers: enabledTriggers || [], // Required field - default to empty array
      });
      
      logger.info('Integration configured', { integrationId, agentId, toolId, triggers: enabledTriggers });
      
      sendJson(res, {
        status: 'success',
        integration_id: integrationId,
      }, 201);
    } catch (error) {
      logger.error('Configure integration failed', error);
      sendError(res, (error as Error).message, 500);
    }
    return;
  }
  
  // DELETE /api/v1/integrations/:id - Remove integration
  const deleteMatch = pathname.match(/^\/api\/v1\/integrations\/([^/]+)$/);
  if (deleteMatch && method === 'DELETE') {
    const integrationId = deleteMatch[1];
    
    try {
      await convex.mutation('integrations:deleteIntegration', {
        integrationId,
      });
      
      logger.info('Integration deleted', { integrationId });
      
      sendJson(res, {
        status: 'success',
        message: 'Integration deleted',
      });
    } catch (error) {
      logger.error('Delete integration failed', error);
      sendError(res, (error as Error).message, 500);
    }
    return;
  }

  // Test Google Sheets webhook - POST /api/v1/integrations/test-webhook
  if (pathname === '/api/v1/integrations/test-webhook' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { webhookUrl, columns } = body;

      logger.info('Test webhook request received', { webhookUrl, columns, columnsLength: columns?.length });

      if (!webhookUrl) {
        return sendError(res, 'Webhook URL is required', 400);
      }

      // Validate URL format
      if (!webhookUrl.includes('script.google.com') || !webhookUrl.endsWith('/exec')) {
        return sendError(res, 'Invalid webhook URL. Must be a Google Apps Script web app URL ending in /exec', 400);
      }

      // Make request to Google Sheets webhook (server-side, bypasses CORS)
      // If columns are provided, send them to set as headers
      const payload = {
        _test: true,
        _setHeaders: columns && columns.length > 0,
        _headers: columns || [],
      };
      
      logger.info('Sending to Google Sheets', payload);
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      logger.info('Webhook test successful', { webhookUrl, response: data, headersSet: columns?.length > 0 });

      return sendJson(res, {
        ...data,
        headersSet: columns && columns.length > 0,
      });
    } catch (error) {
      logger.error('Webhook test error:', error);
      return sendError(res, error instanceof Error ? error.message : 'Failed to test webhook', 500);
    }
  }

  // Send data to Google Sheets - POST /api/v1/integrations/send-to-sheets
  if (pathname === '/api/v1/integrations/send-to-sheets' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const { webhookUrl, data } = body;

      if (!webhookUrl || !data) {
        return sendError(res, 'Webhook URL and data are required', 400);
      }

      // Make request to Google Sheets webhook
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      logger.info('Data sent to sheets', { webhookUrl, rowNumber: result.rowNumber });

      return sendJson(res, result);
    } catch (error) {
      logger.error('Send to sheets error:', error);
      return sendError(res, error instanceof Error ? error.message : 'Failed to send data', 500);
    }
  }

  return sendError(res, 'Not Found', 404);
}
