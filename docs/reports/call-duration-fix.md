# Call Duration Fix Report

## Problem
Call duration was showing "--" instead of actual duration in the frontend, even after calls ended.

## Root Cause Analysis

### Issue 1: Backend - Incorrect Field Usage
The `calculateDuration()` function uses `session.startTime` and `session.endTime` (Date objects), but sessions were only setting `startedAt`/`endedAt` (timestamps).

### Issue 2: Frontend - Zero Duration Handling  
The `formatDuration()` function returns "--" for 0 or undefined values.

### Issue 3: Database - Missing Duration for Old Sessions
Sessions created before the fix don't have `durationSeconds` in the database.

## Solution

### Backend Fixes

1. **createSession()** - Now sets both `startTime` (Date) and `startedAt`  
2. **endSession()** - Sets `endTime` before calculating duration
3. **updateSessionStatus()** - Stores both `endTime` (Date) and `endedAt` (number)
4. **getSession()** - Converts Convex timestamps to Date objects + calculates missing duration

### API Fixes

Added fallback duration calculation in all endpoints for old sessions:
- `GET /api/v1/calls` - List calls
- `GET /api/v1/calls/:id` - Single call  
- `GET /api/v1/sessions/:id` - Session details

```typescript
// Calculate duration if missing
if (!durationSeconds && s.endedAt && s.startedAt) {
    durationSeconds = Math.floor((s.endedAt - s.startedAt) / 1000);
}
```

## Impact
- ✅ New calls: Duration calculated and stored correctly
- ✅ Old calls: Duration calculated on-the-fly from timestamps
- ✅ Frontend: Shows actual duration instead of "--"
- ✅ No database migration needed

## Files Modified
- `src/services/session.ts` - 4 methods
- `src/api/routes/calls.ts` - 2 endpoints
- `src/api/routes/sessions.ts` - 1 endpoint
