import { AccessToken } from 'livekit-server-sdk';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

if (!apiKey || !apiSecret) {
    console.error('❌ LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in .env');
    process.exit(1);
}

const roomName = 'test-room-01';
const participantName = 'human_user';

const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    ttl: 3600, // 1 hour
});

at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
});

const token = await at.toJwt();

console.log('\n════════════════════════════════════════════════════════════');
console.log('🔑 LIVEKIT TOKEN GENERATED');
console.log('════════════════════════════════════════════════════════════');
console.log(`\nRoom: ${roomName}`);
console.log(`Identity: ${participantName}`);
console.log(`\nToken:\n${token}`);
console.log('\n════════════════════════════════════════════════════════════');
console.log('👉 INSTRUCTIONS:');
console.log('1. Go to: https://agents-playground.livekit.io/');
console.log('2. Paste the token above into the "Token" field.');
console.log(`3. Click "Connect".`);
console.log('4. Ensure your local agent is running (npm run dev).');
console.log('════════════════════════════════════════════════════════════\n');
