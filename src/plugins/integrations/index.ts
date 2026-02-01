/**
 * Integration Plugins Module
 * 
 * Export all integration plugin types, base classes, and registry.
 */

// Types
export * from './types.js';

// Base class
export { IntegrationPluginBase, createPluginMetadata } from './PluginBase.js';
export type { PluginLogger } from './PluginBase.js';

// Registry
export { 
    PluginRegistry,
    getPluginRegistry,
    registerPlugin,
    getPlugin,
} from './PluginRegistry.js';

// Plugin Registration
export {
    initializeBuiltInPlugins,
    getMarketplacePlugins,
} from './registerPlugins.js';

// Google Sheets Plugin (only supported integration)
export { GoogleSheetsPlugin, googleSheetsPlugin } from './google-sheets/GoogleSheetsPlugin.js';
