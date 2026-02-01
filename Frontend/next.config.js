const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Expose environment variables to the frontend
    // In production (Vercel), use the NEXT_PUBLIC_API_URL env var
    // In development, construct from API_PORT or use localhost:8000
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ||
      (process.env.API_PORT
        ? `http://localhost:${process.env.API_PORT}`
        : 'http://localhost:8000'),
    NEXT_PUBLIC_API_VERSION: process.env.NEXT_PUBLIC_API_VERSION || 'v1',
    NEXT_PUBLIC_DEFAULT_TENANT_ID: process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || process.env.DEFAULT_ORGANIZATION_ID,
    NEXT_PUBLIC_ENABLE_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS || 'true',
    NEXT_PUBLIC_ENABLE_OUTBOUND_CALLS: process.env.NEXT_PUBLIC_ENABLE_OUTBOUND_CALLS || 'true',
    NEXT_PUBLIC_ENABLE_KB_UPLOAD: process.env.NEXT_PUBLIC_ENABLE_KB_UPLOAD || 'true',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL ||
      (process.env.API_PORT
        ? `ws://localhost:${process.env.API_PORT}/ws`
        : 'ws://localhost:8000/ws'),
    NEXT_PUBLIC_POLL_INTERVAL: process.env.NEXT_PUBLIC_POLL_INTERVAL || '5000',
    NEXT_PUBLIC_DEV_MODE: process.env.NEXT_PUBLIC_DEV_MODE || 'false',
  },
};

module.exports = nextConfig;
