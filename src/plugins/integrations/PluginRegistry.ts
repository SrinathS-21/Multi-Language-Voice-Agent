/**
 * Plugin Registry
 * 
 * Manages registration and lookup of integration plugins.
 * Singleton pattern ensures consistent access across the application.
 */

import {
    IIntegrationPlugin,
    IIntegrationPluginRegistry,
    IntegrationCategory,
} from './types.js';

/**
 * Plugin Registry Implementation
 */
class PluginRegistry implements IIntegrationPluginRegistry {
    private plugins: Map<string, IIntegrationPlugin> = new Map();
    private static instance: PluginRegistry;
    
    private constructor() {}
    
    /**
     * Get the singleton instance
     */
    static getInstance(): PluginRegistry {
        if (!PluginRegistry.instance) {
            PluginRegistry.instance = new PluginRegistry();
        }
        return PluginRegistry.instance;
    }
    
    /**
     * Register a new plugin
     * @throws Error if plugin with same ID already exists
     */
    register(plugin: IIntegrationPlugin): void {
        const id = plugin.metadata.id;
        
        if (this.plugins.has(id)) {
            console.warn(`[PluginRegistry] Plugin '${id}' already registered, skipping...`);
            return;
        }
        
        // Validate plugin has required methods
        if (typeof plugin.execute !== 'function') {
            throw new Error(`Plugin '${id}' must implement execute() method`);
        }
        
        if (typeof plugin.validateConfig !== 'function') {
            throw new Error(`Plugin '${id}' must implement validateConfig() method`);
        }
        
        this.plugins.set(id, plugin);
        console.log(`[PluginRegistry] Registered plugin: ${id} (${plugin.metadata.name})`);
    }
    
    /**
     * Get a plugin by ID
     */
    get(pluginId: string): IIntegrationPlugin | undefined {
        return this.plugins.get(pluginId);
    }
    
    /**
     * Get all registered plugins
     */
    getAll(): IIntegrationPlugin[] {
        return Array.from(this.plugins.values());
    }
    
    /**
     * Get plugins by category
     */
    getByCategory(category: IntegrationCategory): IIntegrationPlugin[] {
        return this.getAll().filter(
            (plugin) => plugin.metadata.category === category
        );
    }
    
    /**
     * Check if a plugin exists
     */
    has(pluginId: string): boolean {
        return this.plugins.has(pluginId);
    }
    
    /**
     * Unregister a plugin
     */
    unregister(pluginId: string): boolean {
        const deleted = this.plugins.delete(pluginId);
        if (deleted) {
            console.log(`[PluginRegistry] Unregistered plugin: ${pluginId}`);
        }
        return deleted;
    }
    
    /**
     * Clear all registered plugins (useful for testing)
     */
    clear(): void {
        this.plugins.clear();
        console.log('[PluginRegistry] Cleared all plugins');
    }
    
    /**
     * Get plugin count
     */
    get count(): number {
        return this.plugins.size;
    }
    
    /**
     * Get all plugin IDs
     */
    getIds(): string[] {
        return Array.from(this.plugins.keys());
    }
    
    /**
     * Get plugins that support a specific trigger
     */
    getByTrigger(trigger: string): IIntegrationPlugin[] {
        return this.getAll().filter(
            (plugin) => plugin.metadata.supportedTriggers.includes(trigger as any)
        );
    }
    
    /**
     * Get marketplace-ready plugin list with metadata
     */
    getMarketplaceList(): Array<{
        id: string;
        name: string;
        description: string;
        category: IntegrationCategory;
        icon?: string;
        supportedTriggers: string[];
        isBuiltIn: boolean;
        isPremium?: boolean;
    }> {
        return this.getAll().map((plugin) => ({
            id: plugin.metadata.id,
            name: plugin.metadata.name,
            description: plugin.metadata.description,
            category: plugin.metadata.category,
            icon: plugin.metadata.icon,
            supportedTriggers: plugin.metadata.supportedTriggers,
            isBuiltIn: plugin.metadata.isBuiltIn,
            isPremium: plugin.metadata.isPremium,
        }));
    }
}

/**
 * Get the global plugin registry instance
 */
export function getPluginRegistry(): PluginRegistry {
    return PluginRegistry.getInstance();
}

/**
 * Register a plugin (convenience function)
 */
export function registerPlugin(plugin: IIntegrationPlugin): void {
    getPluginRegistry().register(plugin);
}

/**
 * Get a plugin by ID (convenience function)
 */
export function getPlugin(pluginId: string): IIntegrationPlugin | undefined {
    return getPluginRegistry().get(pluginId);
}

export { PluginRegistry };
