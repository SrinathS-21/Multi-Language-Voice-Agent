/**
 * Detailed OpenAI API Diagnostic
 * Shows the exact error response from OpenAI
 */

import dotenv from 'dotenv';
dotenv.config();

async function diagnose() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  console.log('\n🔍 OpenAI API Diagnostic\n');
  console.log(`Key prefix: ${apiKey?.substring(0, 15)}...`);
  console.log(`Key length: ${apiKey?.length} characters`);
  console.log(`Key type: ${apiKey?.startsWith('sk-proj-') ? 'Project-scoped ⚠️' : 'Standard ✅'}\n`);
  
  console.log('📡 Making test API call...\n');
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
    });

    console.log(`📊 Response Status: ${response.status} ${response.statusText}\n`);
    
    const text = await response.text();
    
    if (response.ok) {
      console.log('✅ SUCCESS!\n');
      console.log('Response:', JSON.stringify(JSON.parse(text), null, 2));
    } else {
      console.log('❌ ERROR RESPONSE:\n');
      try {
        const error = JSON.parse(text);
        console.log(JSON.stringify(error, null, 2));
        
        // Specific guidance
        if (response.status === 403) {
          console.log('\n🔴 403 FORBIDDEN - This means:');
          console.log('   • Your account has insufficient credits OR');
          console.log('   • Your API key lacks permissions OR');
          console.log('   • Your payment method failed');
          console.log('\n💡 Fix: https://platform.openai.com/account/billing');
        } else if (response.status === 429) {
          console.log('\n🟡 429 RATE LIMIT - This means:');
          console.log('   • You exceeded requests per minute OR');
          console.log('   • You exceeded tokens per minute OR');
          console.log('   • Your tier has strict limits');
          console.log('\n💡 Fix: Wait or check https://platform.openai.com/usage');
        } else if (response.status === 401) {
          console.log('\n🔴 401 UNAUTHORIZED - This means:');
          console.log('   • Your API key is invalid or revoked');
          console.log('\n💡 Fix: Generate new key at https://platform.openai.com/api-keys');
        }
      } catch {
        console.log(text);
      }
    }
    
    // Check headers
    console.log('\n📋 Response Headers:');
    response.headers.forEach((value, key) => {
      if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('limit') || key.toLowerCase().includes('retry')) {
        console.log(`   ${key}: ${value}`);
      }
    });
    
  } catch (error) {
    console.log('❌ Network Error:', error);
  }
  
  console.log('\n');
}

diagnose();
