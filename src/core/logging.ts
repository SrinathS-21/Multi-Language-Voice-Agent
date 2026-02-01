/**
 * Centralized logging setup for all modules.
 * 
 * Provides structured logging with different levels and colors.
 */

import { config } from './config.js';

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
}

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * Logger class
 */
export class Logger {
  private name: string;
  private minLevel: LogLevel;

  constructor(name: string) {
    this.name = name;
    this.minLevel = this.parseLogLevel(config.logLevel);
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toUpperCase()) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARNING':
        return LogLevel.WARNING;
      case 'ERROR':
        return LogLevel.ERROR;
      default:
        return LogLevel.INFO;
    }
  }

  private formatMessage(level: string, message: string, color: string): string {
    const timestamp = new Date().toISOString();
    return `${colors.gray}${timestamp}${colors.reset} ${color}[${level}]${colors.reset} ${colors.cyan}${this.name}${colors.reset} ${message}`;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message, colors.gray), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message, colors.blue), ...args);
    }
  }

  warning(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARNING)) {
      console.warn(this.formatMessage('WARNING', message, colors.yellow), ...args);
    }
  }

  error(message: string, error?: Error | any, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message, colors.red), error, ...args);
      if (error?.stack && config.isDevelopment) {
        console.error(colors.dim + error.stack + colors.reset);
      }
    }
  }
}

/**
 * Create a logger instance for a module
 */
export function getLogger(name: string): Logger {
  return new Logger(name);
}

/**
 * Default logger instance for quick use
 */
export const logger = getLogger('app');

/**
 * Setup logging configuration (for compatibility with Python version)
 */
export function setupLogging(): void {
  // In Node.js/TypeScript, we don't need explicit setup like Python
  // This function exists for API compatibility
  const setupLogger = getLogger('core.logging');
  setupLogger.info(`Logging initialized at level: ${config.logLevel}`);
}
