/**
 * OpenAI API Key Test Script
 * 
 * Tests if the OpenAI API key is valid and has sufficient credits
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

interface TestResult {
  valid: boolean;
  hasCredits: boolean;
  errorType?: string;
  errorMessage?: string;
  model?: string;
  responseTime?: number;
}

async function testOpenAIKey(): Promise<TestResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  // Check if key exists
  if (!apiKey) {
    return {
      valid: false,
      hasCredits: false,
      errorType: 'missing_key',
      errorMessage: 'OPENAI_API_KEY environment variable not set',
    };
  }

  // Check key format
  if (!apiKey.startsWith('sk-')) {
    return {
      valid: false,
      hasCredits: false,
      errorType: 'invalid_format',
      errorMessage: `API key has invalid format (should start with 'sk-')`,
    };
  }

  console.log('🔑 Testing OpenAI API key...');
  console.log(`   Key prefix: ${apiKey.substring(0, 10)}...`);
  console.log(`   Key type: ${apiKey.startsWith('sk-proj-') ? 'Project-scoped' : 'Standard'}`);

  // Make a minimal test API call
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: 'Say "OK" if you can read this.',
          },
        ],
        max_tokens: 5,
        temperature: 0,
      }),
    });

    const responseTime = Date.now() - startTime;

    // Check response status
    if (response.ok) {
      const data = await response.json();
      return {
        valid: true,
        hasCredits: true,
        model: data.model || 'gpt-4o-mini',
        responseTime,
      };
    }

    // Handle error responses
    const errorData = await response.text();
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    
    try {
      const errorJson = JSON.parse(errorData);
      errorMessage = errorJson.error?.message || errorMessage;
    } catch {
      // Use status text if can't parse JSON
    }

    // Classify error type
    let errorType = 'unknown';
    if (response.status === 401) {
      errorType = 'invalid_key';
      errorMessage = 'API key is invalid or expired';
    } else if (response.status === 403) {
      errorType = 'insufficient_credits';
      errorMessage = 'Insufficient credits or quota exceeded. Add credits at: https://platform.openai.com/account/billing';
    } else if (response.status === 429) {
      errorType = 'rate_limit';
      errorMessage = 'Rate limit exceeded. Wait a moment and try again.';
    } else if (response.status >= 500) {
      errorType = 'server_error';
      errorMessage = 'OpenAI server error. Try again later.';
    }

    return {
      valid: response.status !== 401,
      hasCredits: false,
      errorType,
      errorMessage,
    };

  } catch (error) {
    return {
      valid: false,
      hasCredits: false,
      errorType: 'network_error',
      errorMessage: `Network error: ${(error as Error).message}`,
    };
  }
}

// Run the test
async function main() {
  console.log('\n========================================');
  console.log('🧪 OpenAI API Key Test');
  console.log('========================================\n');

  const result = await testOpenAIKey();

  console.log('\n📊 Test Results:');
  console.log('─────────────────────────────────────\n');

  if (result.valid && result.hasCredits) {
    console.log('✅ Status: WORKING');
    console.log(`✅ API Key: Valid`);
    console.log(`✅ Credits: Available`);
    console.log(`✅ Model: ${result.model}`);
    console.log(`✅ Response Time: ${result.responseTime}ms`);
    console.log('\n🎉 Your OpenAI API key is working correctly!');
  } else {
    console.log('❌ Status: FAILED');
    console.log(`❌ API Key Valid: ${result.valid ? 'Yes' : 'No'}`);
    console.log(`❌ Credits Available: ${result.hasCredits ? 'Yes' : 'No'}`);
    console.log(`❌ Error Type: ${result.errorType}`);
    console.log(`❌ Error: ${result.errorMessage}`);
    
    console.log('\n🔧 Recommended Actions:');
    console.log('─────────────────────────────────────');
    
    if (result.errorType === 'missing_key') {
      console.log('1. Set OPENAI_API_KEY in your .env file');
      console.log('2. Get a key from: https://platform.openai.com/api-keys');
    } else if (result.errorType === 'invalid_key' || result.errorType === 'invalid_format') {
      console.log('1. Generate a new API key: https://platform.openai.com/api-keys');
      console.log('2. Update OPENAI_API_KEY in your .env file');
      console.log('3. Use a standard key (sk-...) not project-scoped (sk-proj-...)');
    } else if (result.errorType === 'insufficient_credits') {
      console.log('1. Add credits: https://platform.openai.com/account/billing');
      console.log('2. Add payment method if missing');
      console.log('3. Add at least $10 to start');
      console.log('4. Verify no payment failures');
    } else if (result.errorType === 'rate_limit') {
      console.log('1. Wait a few minutes and try again');
      console.log('2. Check usage: https://platform.openai.com/usage');
      console.log('3. Consider upgrading your tier');
    }
  }

  console.log('\n========================================\n');

  // Exit with appropriate code
  process.exit(result.valid && result.hasCredits ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
