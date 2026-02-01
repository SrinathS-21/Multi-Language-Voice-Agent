/**
 * RAG Warmer - Keeps the RAG service warm to avoid cold starts
 * 
 * Cold start cause: Serverless functions go idle after ~5-15 mins
 * Solution: Ping every 3-5 minutes to keep connections alive
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();

// Warm the RAG service every 4 minutes to prevent cold starts
// This keeps the function instance "hot" and ready for queries
crons.interval(
    "warm-rag-service",
    { minutes: 4 },
    internal.ragWarmer.warmRag
);

// Cleanup expired ingestion sessions daily at 2:00 AM UTC
// Removes preview data that was never confirmed (24h+ old)
crons.daily(
    "cleanup-expired-sessions",
    { hourUTC: 2, minuteUTC: 0 },
    internal.documentIngestion.cleanupExpiredSessions
);

// Purge expired soft-deleted documents hourly at :30
// Permanently removes documents that were soft-deleted 30+ days ago
crons.hourly(
    "purge-expired-deletions",
    { minuteUTC: 30 },
    internal.ragManagement.purgeExpiredDeletions
);

export default crons;
