#!/usr/bin/env node
/**
 * Keep-Alive Monitor Script
 * 
 * This script runs as a cron job to:
 * 1. Ping the health endpoint every 5 minutes
 * 2. Log response times and status
 * 3. Send alerts if service is down (optional)
 * 
 * Usage:
 *   node scripts/keep-alive.js
 * 
 * Environment Variables:
 *   SERVICE_URL - URL of your Render service
 *   ALERT_WEBHOOK - (Optional) Webhook URL for alerts (Slack, Discord, etc.)
 */

const https = require('https');
const http = require('http');

// Configuration
const SERVICE_URL = process.env.SERVICE_URL || 'https://livekit-sarvam-agent.onrender.com';
const HEALTH_ENDPOINT = `${SERVICE_URL}/health`;
const TIMEOUT = 10000; // 10 seconds
const ALERT_WEBHOOK = process.env.ALERT_WEBHOOK; // Optional

// Parse URL
const url = new URL(HEALTH_ENDPOINT);
const protocol = url.protocol === 'https:' ? https : http;

console.log(`🏥 Keep-Alive Monitor`);
console.log(`Checking: ${HEALTH_ENDPOINT}`);
console.log(`Timeout: ${TIMEOUT}ms`);
console.log('');

const startTime = Date.now();

const options = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname + url.search,
  method: 'GET',
  timeout: TIMEOUT,
  headers: {
    'User-Agent': 'Keep-Alive-Monitor/1.0'
  }
};

const req = protocol.request(options, (res) => {
  const responseTime = Date.now() - startTime;
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const json = JSON.parse(data);
        if (json.status === 'healthy') {
          console.log(`✅ Health check PASSED`);
          console.log(`Status: ${res.statusCode}`);
          console.log(`Response Time: ${responseTime}ms`);
          console.log(`Response:`, json);
          process.exit(0);
        } else {
          console.warn(`⚠️  Unexpected status: ${json.status}`);
          console.warn(`Response:`, json);
          sendAlert(`Service returned unexpected status: ${json.status}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`❌ Failed to parse response: ${err.message}`);
        console.error(`Raw response:`, data);
        sendAlert(`Failed to parse health response: ${err.message}`);
        process.exit(1);
      }
    } else {
      console.error(`❌ Health check FAILED`);
      console.error(`Status: ${res.statusCode}`);
      console.error(`Response:`, data);
      sendAlert(`Service returned status ${res.statusCode}`);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  const responseTime = Date.now() - startTime;
  console.error(`❌ Health check FAILED`);
  console.error(`Error: ${err.message}`);
  console.error(`Time elapsed: ${responseTime}ms`);
  sendAlert(`Service unreachable: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  console.error(`❌ Health check TIMEOUT`);
  console.error(`Timeout: ${TIMEOUT}ms`);
  sendAlert(`Service timeout after ${TIMEOUT}ms`);
  process.exit(1);
});

req.end();

/**
 * Send alert via webhook (optional)
 */
function sendAlert(message) {
  if (!ALERT_WEBHOOK) return;

  const alertUrl = new URL(ALERT_WEBHOOK);
  const alertProtocol = alertUrl.protocol === 'https:' ? https : http;

  const payload = JSON.stringify({
    text: `🚨 LiveKit Agent Alert: ${message}`,
    timestamp: new Date().toISOString(),
    service: SERVICE_URL
  });

  const alertOptions = {
    hostname: alertUrl.hostname,
    port: alertUrl.port || (alertUrl.protocol === 'https:' ? 443 : 80),
    path: alertUrl.pathname + alertUrl.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const alertReq = alertProtocol.request(alertOptions, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(`📨 Alert sent successfully`);
    } else {
      console.warn(`⚠️  Failed to send alert: ${res.statusCode}`);
    }
  });

  alertReq.on('error', (err) => {
    console.warn(`⚠️  Failed to send alert: ${err.message}`);
  });

  alertReq.write(payload);
  alertReq.end();
}
