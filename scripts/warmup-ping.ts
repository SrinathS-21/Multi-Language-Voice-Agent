// Agent Warmup Ping
//
// Sends a lightweight dispatch to the LiveKit Cloud agent every 4 minutes
// to prevent scale-to-zero cold starts. The agent receives the job,
// sees it's a warmup ping (via metadata), and immediately disconnects.
//
// Run as a cron job or background process:
//   npx tsx scripts/warmup-ping.ts
//
// Or add to Render as a cron job (every 4 min):
//   */4 * * * * npx tsx scripts/warmup-ping.ts --once

import { AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import dotenv from 'dotenv';

dotenv.config();

const AGENT_NAME = 'sarvam-voice-agent';
const PING_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes

const LIVEKIT_URL = process.env.LIVEKIT_URL!;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY!;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET!;

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.error('Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET');
  process.exit(1);
}

const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const agentDispatch = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

async function sendWarmupPing(): Promise<void> {
  const roomName = `warmup-ping-${Date.now()}`;
  
  try {
    // Create a temporary room
    await roomService.createRoom({ name: roomName, emptyTimeout: 30 });
    
    // Dispatch agent with warmup metadata — the agent should detect this
    // and skip full initialization (just accept job and disconnect)
    await agentDispatch.createDispatch(roomName, AGENT_NAME, {
      metadata: JSON.stringify({ warmup: true }),
    });

    console.log(`[${new Date().toISOString()}] Warmup ping sent → ${roomName}`);

    // Wait briefly for agent to start, then clean up
    await new Promise(resolve => setTimeout(resolve, 5000));
    await roomService.deleteRoom(roomName).catch(() => {});
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Warmup ping failed:`, 
      error instanceof Error ? error.message : error);
    // Clean up room on failure
    await roomService.deleteRoom(roomName).catch(() => {});
  }
}

// --once flag: run single ping and exit (for cron jobs)
if (process.argv.includes('--once')) {
  sendWarmupPing().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
  // Continuous mode: ping every 4 minutes
  console.log(`Agent warmup started — pinging every ${PING_INTERVAL_MS / 1000}s`);
  console.log(`LiveKit: ${LIVEKIT_URL}`);
  
  // Initial ping
  sendWarmupPing();
  
  // Repeat
  setInterval(sendWarmupPing, PING_INTERVAL_MS);
}
