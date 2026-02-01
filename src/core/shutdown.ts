/**
 * Graceful Shutdown Handler
 * 
 * Handles process termination signals for clean shutdown:
 * - SIGTERM: Kubernetes pod termination
 * - SIGINT: Ctrl+C during development
 * 
 * Ensures:
 * - Active sessions are ended properly
 * - HTTP connections are closed
 * - Resources are released
 */

import { logger } from './logging.js';
import type { Server } from 'http';

type ShutdownCallback = () => Promise<void>;

class ShutdownManager {
    private callbacks: ShutdownCallback[] = [];
    private isShuttingDown = false;
    private shutdownTimeout = 30000; // 30 seconds max

    constructor() {
        this.setupSignalHandlers();
    }

    /**
     * Register a callback to be called during shutdown
     */
    register(callback: ShutdownCallback): void {
        this.callbacks.push(callback);
    }

    /**
     * Register an HTTP server for graceful close
     */
    registerServer(server: Server): void {
        this.register(async () => {
            return new Promise((resolve) => {
                server.close(() => {
                    logger.info('HTTP server closed');
                    resolve();
                });
            });
        });
    }

    /**
     * Setup signal handlers
     */
    private setupSignalHandlers(): void {
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
        process.on('SIGINT', () => this.shutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception', error);
            this.shutdown('uncaughtException', 1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason: any, promise) => {
            // Suppress known non-fatal speech handle race conditions
            if (reason?.message?.includes('mark_generation_done') || 
                reason?.message?.includes('no active generation') ||
                reason?.message?.includes('Channel closed') ||
                reason?.code === 'ERR_IPC_CHANNEL_CLOSED') {
                logger.debug('Suppressed non-fatal SDK error', { 
                    error: reason.message || reason.code
                });
                return;
            }
            
            logger.error('Unhandled rejection', { reason, promise });
        });

        // Handle uncaught FFI/native errors from LiveKit SDK (suppress non-fatal)
        process.on('warning', (warning) => {
            if (warning.message?.includes('unwrap') || warning.message?.includes('panic')) {
                logger.debug('Suppressed FFI warning', { warning: warning.message });
                return;
            }
            logger.warning('Process warning', { warning: warning.name, message: warning.message });
        });
    }

    /**
     * Execute graceful shutdown
     */
    private async shutdown(signal: string, exitCode: number = 0): Promise<void> {
        if (this.isShuttingDown) {
            logger.warning('Shutdown already in progress, ignoring signal', { signal });
            return;
        }

        this.isShuttingDown = true;
        logger.info(`Received ${signal}, starting graceful shutdown...`);

        // Set a hard timeout
        const timeoutId = setTimeout(() => {
            logger.error('Shutdown timeout exceeded, forcing exit');
            process.exit(1);
        }, this.shutdownTimeout);

        try {
            // Execute all registered callbacks
            for (const callback of this.callbacks) {
                try {
                    await callback();
                } catch (error) {
                    logger.error('Error during shutdown callback', error);
                }
            }

            clearTimeout(timeoutId);
            logger.info('Graceful shutdown completed');
            process.exit(exitCode);
        } catch (error) {
            clearTimeout(timeoutId);
            logger.error('Error during shutdown', error);
            process.exit(1);
        }
    }
}

// Singleton instance
export const shutdownManager = new ShutdownManager();

/**
 * Register a shutdown callback
 */
export function onShutdown(callback: ShutdownCallback): void {
    shutdownManager.register(callback);
}

/**
 * Register a server for graceful shutdown
 */
export function registerServerForShutdown(server: Server): void {
    shutdownManager.registerServer(server);
}
