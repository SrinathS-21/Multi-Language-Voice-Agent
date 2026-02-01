/**
 * Plugin Registration
 * 
 * Registers all built-in plugins with the registry.
 * Call this at application startup.
 */

import { getPluginRegistry } from './PluginRegistry.js';
import { googleSheetsPlugin } from './google-sheets/GoogleSheetsPlugin.js';

/**
 * Initialize and register all built-in plugins
 */
export function initializeBuiltInPlugins(): void {
    const registry = getPluginRegistry();
    
    console.log('[Plugins] Initializing built-in integration plugins...');
    
    // Register Google Sheets plugin (only supported integration)
    registry.register(googleSheetsPlugin);
    
    console.log(`[Plugins] Registered ${registry.count} plugins:`);
    registry.getAll().forEach(plugin => {
        console.log(`  - ${plugin.metadata.id}: ${plugin.metadata.name} (${plugin.metadata.category})`);
    });
}

/**
 * Get list of available plugins for marketplace
 */
export function getMarketplacePlugins(): Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    icon?: string;
    supportedTriggers: string[];
    setupInstructions?: string;
}> {
    const registry = getPluginRegistry();
    
    return registry.getAll().map(plugin => ({
        id: plugin.metadata.id,
        name: plugin.metadata.name,
        description: plugin.metadata.description,
        category: plugin.metadata.category,
        icon: plugin.metadata.icon,
        supportedTriggers: plugin.metadata.supportedTriggers,
        setupInstructions: plugin.metadata.setupInstructions,
    }));
}

// Export Google Sheets plugin for direct access
export { googleSheetsPlugin } from './google-sheets/GoogleSheetsPlugin.js';
