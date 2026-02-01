/**
 * Agent Warmup Script
 * 
 * Warms up all agent components:
 * - RAG namespace (vector search)
 * - Database connections
 * 
 * Run this after deployment to ensure fast first response
 */

import { getAgentConfigService } from '../src/services/agent-config.js';
import { VoiceKnowledgeService } from '../src/services/voice-knowledge.js';
import dotenv from 'dotenv';

dotenv.config();

const ORGANIZATION_ID = process.env.ORGANIZATION_ID || '';
const AGENT_ID = process.env.AGENT_ID || '';

// Generic warmup queries - these will be expanded based on agent's knowledge base
const WARMUP_QUERIES = [
  'services available pricing',
  'contact information location hours',
  'frequently asked questions help',
  'booking appointment schedule',
  'support assistance help',
];

async function warmupAgent() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           🔥 Agent Warmup                                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  if (!ORGANIZATION_ID || !AGENT_ID) {
    console.error('❌ ORGANIZATION_ID and AGENT_ID environment variables are required');
    process.exit(1);
  }
  
  const startTime = Date.now();

  try {
    // 1. Warmup agent config (cache prompt)
    console.log('📋 [1/3] Warming up agent configuration...');
    const agentConfigService = getAgentConfigService();
    const config = await agentConfigService.loadAgentConfig(AGENT_ID);
    console.log(`   ✅ Agent config loaded: ${config?.name || 'Unknown'}`);
    
    const promptResult = await agentConfigService.getCachedFullPrompt(AGENT_ID);
    console.log(`   ✅ Prompt cached: ${promptResult.source} (${promptResult.latencyMs}ms)\n`);

    // 2. Warmup RAG namespace
    console.log('📚 [2/3] Warming up RAG knowledge base...');
    const knowledgeService = new VoiceKnowledgeService(ORGANIZATION_ID, AGENT_ID);
    const warmupResult = await knowledgeService.warmupNamespace();
    console.log(`   ✅ RAG warmed up: ${warmupResult?.message || 'Success'} (${warmupResult?.latency}ms)\n`);

    // 3. Run warmup queries to pre-cache embeddings
    console.log('🔍 [3/3] Pre-caching common search queries...');
    console.log(`   Running ${WARMUP_QUERIES.length} warmup queries...\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < WARMUP_QUERIES.length; i++) {
      const query = WARMUP_QUERIES[i];
      const queryStart = Date.now();
      
      try {
        const searchResult = await knowledgeService.searchKnowledge(query);
        const latency = Date.now() - queryStart;
        const resultCount = searchResult.items?.length || 0;
        
        successCount++;
        console.log(`   ✅ "${query}" → ${resultCount} results (${latency}ms)`);
        
      } catch (error: any) {
        failCount++;
        console.log(`   ⚠️  "${query}" → failed`);
      }
    }
    
    console.log('\n');
    console.log('   ─────────────────────────────────────────────────────────');
    console.log(`   ✅ Success: ${successCount}/${WARMUP_QUERIES.length} queries`);
    if (failCount > 0) {
      console.log(`   ⚠️  Failed: ${failCount}/${WARMUP_QUERIES.length} queries`);
    }

    const elapsed = Date.now() - startTime;
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`✅ Agent warmup complete! Total time: ${elapsed}ms`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('\n🚀 First response latency should now be improved!\n');

  } catch (error: any) {
    console.error('\n❌ Warmup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run warmup
warmupAgent()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
