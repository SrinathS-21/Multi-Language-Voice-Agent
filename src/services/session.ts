/**
 * Session Service - Voice agent session management
 * 
 * Handles:
 * - Session lifecycle (create, get, update, end)
 * - LiveKit room association
 * - Expiration handling
 * - Organization and agent scoping
 */

import { v4 as uuidv4 } from 'uuid';
import { getConvexClient, isConvexConfigured } from '../core/convex-client.js';
import { logger } from '../core/logging.js';
import {
    Session,
    SessionStatus,
    CallType,
    CreateSessionInput,
    SessionConfig,
    SessionMetadata,
    isSessionExpired,
    calculateDuration,
} from '../models/session.js';

/**
 * Session service configuration
 */
interface SessionServiceConfig {
    defaultTtlSeconds: number;
    enablePersistence: boolean;
}

/**
 * In-memory session cache for fast access
 */
const sessionCache = new Map<string, Session>();

/**
 * Session Service class
 */
export class SessionService {
    private config: SessionServiceConfig;
    private convexConfigured: boolean;

    constructor(config?: Partial<SessionServiceConfig>) {
        this.config = {
            defaultTtlSeconds: config?.defaultTtlSeconds ?? 3600, // 1 hour
            enablePersistence: config?.enablePersistence ?? true,
        };
        this.convexConfigured = isConvexConfigured();

        if (!this.convexConfigured) {
            logger.warning('Convex not configured - sessions will only be stored in memory');
        }
    }

    /**
     * Create a new session
     */
    async createSession(input: CreateSessionInput): Promise<Session> {
        const sessionId = uuidv4();
        const now = Date.now();
        const startTime = new Date(now);

        const session: Session = {
            sessionId,
            organizationId: input.organizationId,
            agentId: input.agentId,
            roomName: input.roomName,
            participantIdentity: input.participantIdentity,
            callType: input.callType,
            status: SessionStatus.ACTIVE,
            startTime,  // Date object for duration calculation
            startedAt: startTime,  // Date version for consistency
            createdAt: now,
            updatedAt: now,
            config: input.config,
            metadata: input.metadata,
            // Telephony fields
            callerPhoneNumber: input.callerPhoneNumber,
            destinationPhoneNumber: input.destinationPhoneNumber,
            callSid: input.callSid,
            sipParticipantId: input.sipParticipantId,
            callDirection: input.callDirection,
            isTelephony: input.isTelephony,
        };

        // Store in memory cache
        sessionCache.set(sessionId, session);

        // Persist to Convex if configured
        if (this.convexConfigured && this.config.enablePersistence) {
            try {
                const convex = getConvexClient();
                await convex.mutation('callSessions:create', {
                    sessionId,
                    organizationId: input.organizationId,
                    agentId: input.agentId,
                    roomName: input.roomName,
                    participantIdentity: input.participantIdentity,
                    callType: input.callType,
                    config: input.config ? JSON.stringify(input.config) : undefined,
                    metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
                    // Telephony fields
                    callerPhoneNumber: input.callerPhoneNumber,
                    destinationPhoneNumber: input.destinationPhoneNumber,
                    callSid: input.callSid,
                    sipParticipantId: input.sipParticipantId,
                    callDirection: input.callDirection,
                    isTelephony: input.isTelephony,
                });

                // Silent - reduce noise
                // logger.info('Session created and persisted', {
                //     sessionId,
                //     organizationId: input.organizationId,
                //     callType: input.callType,
                // });
            } catch (error) {
                logger.error('Failed to persist session to Convex', {
                    sessionId,
                    error: (error as Error).message,
                });
                // Continue with in-memory session
            }
        } else {
            logger.info('Session created (in-memory only)', { sessionId });
        }

        return session;
    }

    /**
     * Get session by ID
     */
    async getSession(sessionId: string): Promise<Session | null> {
        // Check cache first
        const cached = sessionCache.get(sessionId);
        if (cached) {
            // Check expiration
            if (isSessionExpired(cached, this.config.defaultTtlSeconds)) {
                await this.expireSession(sessionId);
                return null;
            }
            return cached;
        }

        // Try Convex if configured
        if (this.convexConfigured && this.config.enablePersistence) {
            try {
                const convex = getConvexClient();
                const result = await convex.query('callSessions:getBySessionId', { sessionId }) as any;

                if (result) {
                    const session: Session = {
                        sessionId: result.sessionId,
                        organizationId: result.organizationId,
                        agentId: result.agentId,
                        roomName: result.roomName,
                        participantIdentity: result.participantIdentity,
                        callType: result.callType as CallType,
                        status: result.status as SessionStatus,
                        startTime: new Date(result.startedAt),  // Convert timestamp to Date
                        startedAt: new Date(result.startedAt),  // Date object
                        endTime: result.endedAt ? new Date(result.endedAt) : undefined,  // Convert if exists
                        endedAt: result.endedAt,
                        durationSeconds: result.durationSeconds,
                        createdAt: result.createdAt,
                        updatedAt: result.updatedAt,
                        config: result.config ? JSON.parse(result.config) : undefined,
                        metadata: result.metadata ? JSON.parse(result.metadata) : undefined,
                    };

                    // Calculate duration if missing but session is completed
                    if (!session.durationSeconds && session.endedAt && session.status === SessionStatus.COMPLETED) {
                        session.durationSeconds = calculateDuration(session);
                        logger.info('Calculated missing duration for completed session', {
                            sessionId,
                            durationSeconds: session.durationSeconds,
                        });
                    }

                    // Cache it
                    sessionCache.set(sessionId, session);

                    // Check expiration
                    if (isSessionExpired(session, this.config.defaultTtlSeconds)) {
                        await this.expireSession(sessionId);
                        return null;
                    }

                    return session;
                }
            } catch (error) {
                logger.error('Failed to fetch session from Convex', {
                    sessionId,
                    error: (error as Error).message,
                });
            }
        }

        return null;
    }

    /**
     * Get session by LiveKit room name
     */
    async getSessionByRoomName(roomName: string): Promise<Session | null> {
        // Check cache first
        for (const session of sessionCache.values()) {
            if (session.roomName === roomName) {
                if (isSessionExpired(session, this.config.defaultTtlSeconds)) {
                    await this.expireSession(session.sessionId);
                    return null;
                }
                return session;
            }
        }

        // Try Convex
        if (this.convexConfigured && this.config.enablePersistence) {
            try {
                const convex = getConvexClient();
                const result = await convex.query('callSessions:getByRoomName', { roomName }) as any;

                if (result) {
                    return this.getSession(result.sessionId); // Reuse getSession for caching
                }
            } catch (error) {
                logger.error('Failed to fetch session by room name', {
                    roomName,
                    error: (error as Error).message,
                });
            }
        }

        return null;
    }

    /**
     * Update session status
     */
    async updateSessionStatus(
        sessionId: string,
        status: SessionStatus,
        additionalData?: { endedAt?: number; durationSeconds?: number }
    ): Promise<boolean> {
        const session = await this.getSession(sessionId);
        if (!session) {
            logger.warning('Session not found for status update', { sessionId });
            return false;
        }

        // Update cache
        session.status = status;
        session.updatedAt = Date.now();
        if (additionalData?.endedAt) {
            session.endedAt = additionalData.endedAt;  // Store as number
            session.endTime = new Date(additionalData.endedAt);  // Store as Date for calculations
        }
        if (additionalData?.durationSeconds) session.durationSeconds = additionalData.durationSeconds;
        sessionCache.set(sessionId, session);

        // Persist to Convex
        if (this.convexConfigured && this.config.enablePersistence) {
            try {
                const convex = getConvexClient();
                await convex.mutation('callSessions:updateStatus', {
                    sessionId,
                    status,
                    endedAt: additionalData?.endedAt,
                    durationSeconds: additionalData?.durationSeconds,
                });

                logger.debug('Session status updated', { sessionId, status });
            } catch (error) {
                logger.error('Failed to update session status in Convex', {
                    sessionId,
                    error: (error as Error).message,
                });
            }
        }

        return true;
    }

    /**
     * End a session (mark as completed)
     */
    async endSession(sessionId: string): Promise<{ success: boolean; durationSeconds: number }> {
        const session = await this.getSession(sessionId);
        if (!session) {
            logger.warning('Session not found for ending', { sessionId });
            return { success: false, durationSeconds: 0 };
        }

        const endedAt = Date.now();
        const endTime = new Date(endedAt);
        
        // Set endTime before calculating duration
        session.endTime = endTime;
        const durationSeconds = calculateDuration(session);

        await this.updateSessionStatus(sessionId, SessionStatus.COMPLETED, {
            endedAt,
            durationSeconds,
        });

        logger.info('Session ended', { sessionId, durationSeconds });
        return { success: true, durationSeconds };
    }

    /**
     * Expire a session
     */
    async expireSession(sessionId: string): Promise<boolean> {
        logger.info('Expiring session', { sessionId });
        return this.updateSessionStatus(sessionId, SessionStatus.EXPIRED, {
            endedAt: Date.now(),
        });
    }

    /**
     * Fail a session
     */
    async failSession(sessionId: string, error?: string): Promise<boolean> {
        logger.error('Session failed', { sessionId, error });
        
        const session = await this.getSession(sessionId);
        if (session) {
            // Update metadata with error
            session.metadata = {
                ...session.metadata,
                customData: {
                    ...session.metadata?.customData,
                    error,
                },
            };
            sessionCache.set(sessionId, session);
        }

        return this.updateSessionStatus(sessionId, SessionStatus.FAILED, {
            endedAt: Date.now(),
        });
    }

    /**
     * Delete a session (cleanup)
     */
    async deleteSession(sessionId: string): Promise<boolean> {
        sessionCache.delete(sessionId);

        if (this.convexConfigured && this.config.enablePersistence) {
            try {
                const convex = getConvexClient();
                const result = await convex.mutation('callSessions:deleteSession', { sessionId }) as any;
                return result?.deleted ?? true;
            } catch (error) {
                logger.error('Failed to delete session from Convex', {
                    sessionId,
                    error: (error as Error).message,
                });
            }
        }

        return true;
    }

    /**
     * Get active session count for an agent (rate limiting)
     */
    async getActiveSessionCount(agentId: string): Promise<number> {
        if (this.convexConfigured && this.config.enablePersistence) {
            try {
                const convex = getConvexClient();
                return await convex.query('callSessions:getActiveCountByAgent', { agentId });
            } catch (error) {
                logger.error('Failed to get active session count', {
                    agentId,
                    error: (error as Error).message,
                });
            }
        }

        // Fallback to cache count
        let count = 0;
        for (const session of sessionCache.values()) {
            if (session.agentId === agentId && session.status === SessionStatus.ACTIVE) {
                count++;
            }
        }
        return count;
    }

    /**
     * Cleanup expired sessions from cache
     */
    cleanupExpiredSessions(): number {
        let cleaned = 0;
        const now = Date.now();
        const expireThreshold = this.config.defaultTtlSeconds * 1000;

        for (const [sessionId, session] of sessionCache.entries()) {
            if (session.status === SessionStatus.ACTIVE) {
                if (now - session.createdAt > expireThreshold) {
                    this.expireSession(sessionId);
                    cleaned++;
                }
            }
        }

        if (cleaned > 0) {
            logger.info('Cleaned up expired sessions', { count: cleaned });
        }

        return cleaned;
    }
}

// ============================================
// Singleton Instance
// ============================================

let sessionServiceInstance: SessionService | null = null;

/**
 * Get the session service singleton
 */
export function getSessionService(): SessionService {
    if (!sessionServiceInstance) {
        sessionServiceInstance = new SessionService();
    }
    return sessionServiceInstance;
}
