/**
 * Environment Validation Script
 * 
 * Validates that all required environment variables and dependencies
 * are properly configured before starting the voice agent.
 * 
 * Usage:
 *   npx tsx scripts/validate-environment.ts
 */

import dotenv from 'dotenv';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

dotenv.config();

interface ValidationResult {
  category: string;
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    required: boolean;
  }>;
}

const results: ValidationResult[] = [];

// ============================================
// 1. ENVIRONMENT VARIABLES VALIDATION
// ============================================

console.log('\n🔍 Validating Environment Variables...\n');

const envChecks = [
  {
    name: 'SARVAM_API_KEY',
    required: true,
    validate: (value: string | undefined) => {
      if (!value) return { status: 'fail' as const, message: 'Missing - Required for STT/TTS' };
      if (value.length < 10) return { status: 'warn' as const, message: 'Looks invalid (too short)' };
      return { status: 'pass' as const, message: '✅ Configured' };
    },
  },
  {
    name: 'OPENAI_API_KEY',
    required: true,
    validate: (value: string | undefined) => {
      if (!value) return { status: 'fail' as const, message: 'Missing - Required for LLM' };
      if (!value.startsWith('sk-')) return { status: 'warn' as const, message: 'May be invalid (should start with sk-)' };
      return { status: 'pass' as const, message: '✅ Configured' };
    },
  },
  {
    name: 'LIVEKIT_URL',
    required: true,
    validate: (value: string | undefined) => {
      if (!value) return { status: 'fail' as const, message: 'Missing - Required for voice sessions' };
      if (!value.startsWith('ws://') && !value.startsWith('wss://')) {
        return { status: 'warn' as const, message: 'Should start with ws:// or wss://' };
      }
      return { status: 'pass' as const, message: '✅ Configured' };
    },
  },
  {
    name: 'LIVEKIT_API_KEY',
    required: true,
    validate: (value: string | undefined) => {
      if (!value) return { status: 'fail' as const, message: 'Missing - Required for LiveKit auth' };
      return { status: 'pass' as const, message: '✅ Configured' };
    },
  },
  {
    name: 'LIVEKIT_API_SECRET',
    required: true,
    validate: (value: string | undefined) => {
      if (!value) return { status: 'fail' as const, message: 'Missing - Required for LiveKit auth' };
      return { status: 'pass' as const, message: '✅ Configured' };
    },
  },
  {
    name: 'CONVEX_URL',
    required: true,
    validate: (value: string | undefined) => {
      if (!value) return { status: 'fail' as const, message: 'Missing - Required for agent config & knowledge base' };
      if (!value.startsWith('https://')) return { status: 'warn' as const, message: 'Should start with https://' };
      return { status: 'pass' as const, message: '✅ Configured' };
    },
  },
  {
    name: 'GOOGLE_SHEETS_WEBHOOK_URL',
    required: false,
    validate: (value: string | undefined) => {
      if (!value) return { status: 'warn' as const, message: 'Optional - Transcript logging to sheets disabled' };
      if (!value.startsWith('https://')) return { status: 'warn' as const, message: 'Should start with https://' };
      return { status: 'pass' as const, message: '✅ Configured' };
    },
  },
  {
    name: 'HEALTH_PORT',
    required: false,
    validate: (value: string | undefined) => {
      const port = parseInt(value || '8080', 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        return { status: 'warn' as const, message: 'Invalid port number (using default 8080)' };
      }
      return { status: 'pass' as const, message: `✅ Port ${port}` };
    },
  },
];

const envResults: ValidationResult = {
  category: 'Environment Variables',
  checks: envChecks.map(check => {
    const value = process.env[check.name];
    const result = check.validate(value);
    return {
      name: check.name,
      status: result.status,
      message: result.message,
      required: check.required,
    };
  }),
};

results.push(envResults);

// Print env results
envResults.checks.forEach(check => {
  const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
  const required = check.required ? '[REQUIRED]' : '[OPTIONAL]';
  console.log(`${icon} ${check.name.padEnd(30)} ${required.padEnd(12)} ${check.message}`);
});

// ============================================
// 2. FILE SYSTEM CHECKS
// ============================================

console.log('\n🔍 Validating File System...\n');

const fileChecks = [
  {
    name: 'dist/ folder exists',
    required: false,
    path: 'dist',
    message: 'TypeScript compiled output',
  },
  {
    name: 'assest/hospital-ambience-sound.mp3',
    required: false,
    path: 'assest/hospital-ambience-sound.mp3',
    message: 'Ambient audio file',
  },
  {
    name: 'convex/ folder exists',
    required: true,
    path: 'convex',
    message: 'Convex backend code',
  },
];

const fileResults: ValidationResult = {
  category: 'File System',
  checks: fileChecks.map(check => {
    const fullPath = path.join(process.cwd(), check.path);
    const exists = fs.existsSync(fullPath);
    return {
      name: check.name,
      status: exists ? 'pass' : (check.required ? 'fail' : 'warn'),
      message: exists ? `✅ ${check.message}` : `Missing - ${check.message}`,
      required: check.required,
    };
  }),
};

results.push(fileResults);

fileResults.checks.forEach(check => {
  const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
  const required = check.required ? '[REQUIRED]' : '[OPTIONAL]';
  console.log(`${icon} ${check.name.padEnd(40)} ${required.padEnd(12)} ${check.message}`);
});

// ============================================
// 3. SYSTEM DEPENDENCIES
// ============================================

console.log('\n🔍 Validating System Dependencies...\n');

function checkCommand(cmd: string): boolean {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const depChecks = [
  {
    name: 'Node.js',
    required: true,
    command: 'node',
    message: 'Runtime environment',
  },
  {
    name: 'npm',
    required: true,
    command: 'npm',
    message: 'Package manager',
  },
  {
    name: 'FFmpeg',
    required: false,
    command: 'ffmpeg',
    message: 'Audio processing (for ambient audio)',
  },
];

const depResults: ValidationResult = {
  category: 'System Dependencies',
  checks: depChecks.map(check => {
    const exists = checkCommand(check.command);
    return {
      name: check.name,
      status: exists ? 'pass' : (check.required ? 'fail' : 'warn'),
      message: exists ? `✅ ${check.message}` : `Not found - ${check.message}`,
      required: check.required,
    };
  }),
};

results.push(depResults);

depResults.checks.forEach(check => {
  const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
  const required = check.required ? '[REQUIRED]' : '[OPTIONAL]';
  console.log(`${icon} ${check.name.padEnd(20)} ${required.padEnd(12)} ${check.message}`);
});

// ============================================
// 4. NETWORK CONNECTIVITY (Optional)
// ============================================

console.log('\n🔍 Checking Network Connectivity...\n');

async function checkUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

const networkChecks = [
  {
    name: 'OpenAI API',
    url: 'https://api.openai.com',
    message: 'LLM service',
  },
  {
    name: 'Sarvam AI API',
    url: 'https://api.sarvam.ai',
    message: 'STT/TTS service',
  },
];

const networkResults: ValidationResult = {
  category: 'Network Connectivity',
  checks: [],
};

for (const check of networkChecks) {
  const reachable = await checkUrl(check.url);
  networkResults.checks.push({
    name: check.name,
    status: reachable ? 'pass' : 'warn',
    message: reachable ? `✅ ${check.message}` : `Unreachable - ${check.message}`,
    required: false,
  });
}

results.push(networkResults);

networkResults.checks.forEach(check => {
  const icon = check.status === 'pass' ? '✅' : '⚠️';
  console.log(`${icon} ${check.name.padEnd(20)} [OPTIONAL]    ${check.message}`);
});

// ============================================
// SUMMARY
// ============================================

console.log('\n' + '='.repeat(80));
console.log('📊 VALIDATION SUMMARY');
console.log('='.repeat(80) + '\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
let warnChecks = 0;
let criticalFailures = 0;

results.forEach(result => {
  result.checks.forEach(check => {
    totalChecks++;
    if (check.status === 'pass') passedChecks++;
    else if (check.status === 'fail') {
      failedChecks++;
      if (check.required) criticalFailures++;
    }
    else warnChecks++;
  });
});

console.log(`Total Checks: ${totalChecks}`);
console.log(`✅ Passed: ${passedChecks}`);
console.log(`❌ Failed: ${failedChecks} (${criticalFailures} critical)`);
console.log(`⚠️  Warnings: ${warnChecks}`);

console.log('\n' + '='.repeat(80));

if (criticalFailures > 0) {
  console.log('❌ VALIDATION FAILED - Critical issues found!');
  console.log('\nCritical failures:');
  results.forEach(result => {
    result.checks.forEach(check => {
      if (check.status === 'fail' && check.required) {
        console.log(`  ❌ ${check.name}: ${check.message}`);
      }
    });
  });
  console.log('\n⚠️  Fix critical issues before starting the agent!');
  console.log('See PRE_DEPLOYMENT_CHECKLIST.md for detailed instructions.\n');
  process.exit(1);
} else if (warnChecks > 0) {
  console.log('⚠️  VALIDATION PASSED WITH WARNINGS');
  console.log('\nOptional improvements:');
  results.forEach(result => {
    result.checks.forEach(check => {
      if (check.status === 'warn') {
        console.log(`  ⚠️  ${check.name}: ${check.message}`);
      }
    });
  });
  console.log('\n✅ Agent can start, but consider fixing warnings for best experience.\n');
  process.exit(0);
} else {
  console.log('✅ ALL CHECKS PASSED!');
  console.log('\n🚀 Environment is ready. You can start the agent with:');
  console.log('   npm run dev    (development)');
  console.log('   npm start      (production)\n');
  process.exit(0);
}
