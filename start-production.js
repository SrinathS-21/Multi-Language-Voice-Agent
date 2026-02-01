/**
 * Production startup script - runs both API server and Agent
 */
import { spawn } from 'child_process';

console.log('🚀 Starting production services...');

// Start API Server
const apiServer = spawn('node', ['dist/src/api/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: process.env.PORT || '8000' }
});

// Start Agent (after 2 second delay)
setTimeout(() => {
  const agent = spawn('node', ['dist/src/agent/index.js', 'start'], {
    stdio: 'inherit',
    env: process.env
  });

  agent.on('error', (error) => {
    console.error('❌ Agent failed:', error);
    process.exit(1);
  });
}, 2000);

apiServer.on('error', (error) => {
  console.error('❌ API Server failed:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  apiServer.kill('SIGTERM');
  process.exit(0);
});
