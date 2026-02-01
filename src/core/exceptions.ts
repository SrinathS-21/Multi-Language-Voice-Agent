/**
 * Custom exception classes for the application.
 */

/**
 * Base class for all custom exceptions
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // captureStackTrace is V8-specific (Node.js)
    // Use type assertion to avoid TypeScript errors in non-Node environments
    const ErrorConstructor = Error as any;
    if (typeof ErrorConstructor.captureStackTrace === 'function') {
      ErrorConstructor.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Sarvam AI API errors
 */
export class SarvamAPIError extends AppError {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * LiveKit connection errors
 */
export class LiveKitError extends AppError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Session-related errors
 */
export class SessionError extends AppError {
  sessionId?: string;

  constructor(message: string, sessionId?: string) {
    super(message);
    this.sessionId = sessionId;
  }
}

/**
 * Session not found error
 */
export class SessionNotFoundError extends SessionError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, sessionId);
  }
}

/**
 * Session expired error
 */
export class SessionExpiredError extends SessionError {
  constructor(sessionId: string) {
    super(`Session has expired: ${sessionId}`, sessionId);
  }
}

/**
 * Convex backend errors
 */
export class ConvexError extends AppError {
  operation?: string;

  constructor(message: string, operation?: string) {
    super(message);
    this.operation = operation;
  }
}

/**
 * Knowledge base errors
 */
export class KnowledgeBaseError extends AppError {
  agentId?: string;

  constructor(message: string, agentId?: string) {
    super(message);
    this.agentId = agentId;
  }
}
