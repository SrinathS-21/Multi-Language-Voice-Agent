/**
 * Complete Agent Setup Script
 * 
 * This script performs the full setup:
 * 1. Creates an organization
 * 2. Creates an agent with proper configuration
 * 3. Uploads documents to the knowledge base
 * 
 * Usage:
 *   npx tsx scripts/setup-agent.ts
 */

import { ConvexHttpClient } from 'convex/browser';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// Type helper for Convex client
type AnyClient = {
    query: (name: string, args: any) => Promise<any>;
    mutation: (name: string, args: any) => Promise<any>;
    action: (name: string, args: any) => Promise<any>;
};

const CONVEX_URL = process.env.CONVEX_URL || '';

if (!CONVEX_URL) {
    console.error('❌ CONVEX_URL not found in environment variables');
    process.exit(1);
}

// ============================================
// CONFIGURATION - CUSTOMIZE THIS
// ============================================
const CONFIG = {
    organization: {
        name: 'Kaanchi Cuisine Restaurant',
        slug: 'kaanchi-cuisine',
    },
    agent: {
        name: 'Priya',
        role: 'Restaurant Assistant',
        systemPrompt: `You are Priya, a friendly and helpful voice assistant for Kaanchi Cuisine restaurant.

## Your Personality
- Warm, welcoming, and professional
- Speak naturally like a real restaurant staff member
- Use a conversational tone appropriate for phone calls
- Keep responses concise (under 3 sentences when possible)

## Your Capabilities
- Answer questions about the menu, dishes, ingredients, and prices
- Help with dietary requirements (vegetarian, vegan, gluten-free, allergies)
- Provide information about the restaurant (hours, location, ambiance)
- Take reservation inquiries
- Explain dish preparation methods and recommendations

## Important Guidelines
1. When asked about dishes, use the knowledge base to provide accurate information
2. If you don't know something, say "Let me check that for you" and search the knowledge
3. Always be helpful and suggest alternatives if something isn't available
4. Mention spice levels for Indian dishes
5. Recommend popular dishes when asked for suggestions

## Example Interactions
- "Our paneer tikka is marinated in yogurt and aromatic spices, then grilled to perfection. It's a popular vegetarian choice!"
- "For a mild option, I'd recommend our butter chicken - it has a creamy tomato-based sauce."
- "Yes, we can accommodate gluten-free dietary needs. Let me tell you about our options..."

## Language
- Primary language: English with Indian English expressions
- Be prepared to understand and respond to Hindi words for dishes
`,
        config: {
            voice: 'anushka',
            language: 'en-IN',
            greeting: 'Hello! Welcome to Kaanchi Cuisine. This is Priya speaking. How may I help you today?',
            endCall: 'Thank you for calling Kaanchi Cuisine. Have a wonderful day!',
            maxResponseLength: 150,
            temperature: 0.7,
        },
    },
    // Documents to upload (from knowledge_data folder)
    documents: [
        {
            path: 'knowledge_data/parsed_chunks/Kaanchi Cuisine_chunks.txt',
            sourceType: 'menu',
        },
    ],
};

// ============================================
// SETUP FUNCTIONS
// ============================================

async function main() {
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('🚀 COMPLETE AGENT SETUP');
    console.log('════════════════════════════════════════════════════════════\n');

    const convex = new ConvexHttpClient(CONVEX_URL) as unknown as AnyClient;

    try {
        // Step 1: Create Organization
        console.log('📋 Step 1: Creating Organization...');
        console.log('────────────────────────────────────────────────────────────');
        
        // Check if org already exists
        let orgId: string;
        const existingOrg = await convex.query('organizations:getBySlug', { 
            slug: CONFIG.organization.slug 
        });
        
        if (existingOrg) {
            console.log(`   ℹ️  Organization already exists: ${existingOrg.name}`);
            orgId = existingOrg._id;
        } else {
            orgId = await convex.mutation('organizations:create', {
                name: CONFIG.organization.name,
                slug: CONFIG.organization.slug,
                status: 'active',
                createdAt: Date.now(),
            });
            console.log(`   ✅ Created organization: ${CONFIG.organization.name}`);
        }
        console.log(`   📍 Organization ID: ${orgId}\n`);

        // Step 2: Create Agent
        console.log('🤖 Step 2: Creating Agent...');
        console.log('────────────────────────────────────────────────────────────');
        
        // Check if agent already exists
        const existingAgents = await convex.query('agents:listByOrganization', {
            organizationId: orgId,
        });
        
        let agentId: string;
        const existingAgent = existingAgents?.find((a: any) => a.name === CONFIG.agent.name);
        
        if (existingAgent) {
            console.log(`   ℹ️  Agent already exists: ${existingAgent.name}`);
            agentId = existingAgent._id;
        } else {
            agentId = await convex.mutation('agents:create', {
                organizationId: orgId,
                name: CONFIG.agent.name,
                role: CONFIG.agent.role,
                systemPrompt: CONFIG.agent.systemPrompt,
                config: JSON.stringify(CONFIG.agent.config),
            });
            console.log(`   ✅ Created agent: ${CONFIG.agent.name}`);
        }
        console.log(`   📍 Agent ID: ${agentId}`);
        console.log(`   🎭 Role: ${CONFIG.agent.role}`);
        console.log(`   🗣️  Voice: ${CONFIG.agent.config.voice}`);
        console.log(`   🌐 Language: ${CONFIG.agent.config.language}\n`);

        // Step 3: Upload Documents
        console.log('📚 Step 3: Uploading Documents to Knowledge Base...');
        console.log('────────────────────────────────────────────────────────────');
        
        for (const doc of CONFIG.documents) {
            const fullPath = path.resolve(doc.path);
            
            if (!fs.existsSync(fullPath)) {
                console.log(`   ⚠️  File not found: ${doc.path}`);
                continue;
            }
            
            console.log(`   📄 Processing: ${path.basename(doc.path)}`);
            
            // Read the chunked file
            const fileContent = fs.readFileSync(fullPath, 'utf-8');
            const fileName = path.basename(doc.path).replace('_chunks.txt', '.pdf');
            
            // Parse chunks from the formatted file
            // Format: CHUNK #N ... Text: <actual content>
            const chunkRegex = /CHUNK #(\d+)[^\n]*\n[\s\S]*?Text:\n([\s\S]*?)(?=\n-{50,}|\n={50,}|$)/g;
            const chunks: { index: number; text: string }[] = [];
            
            let match;
            while ((match = chunkRegex.exec(fileContent)) !== null) {
                const text = match[2].trim();
                if (text.length > 50) {
                    chunks.push({
                        index: parseInt(match[1]),
                        text: text,
                    });
                }
            }
            
            if (chunks.length > 0) {
                console.log(`      Found ${chunks.length} chunks to ingest`);
                
                // Ingest each chunk
                let successCount = 0;
                for (const chunk of chunks) {
                    try {
                        await convex.action('rag:ingest', {
                            namespace: agentId,
                            text: chunk.text,
                            key: `${fileName}-chunk-${chunk.index}`,
                            title: `${fileName} - Chunk ${chunk.index}`,
                        });
                        successCount++;
                        // Small delay to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (error) {
                        console.log(`      ⚠️  Failed to ingest chunk ${chunk.index}: ${(error as Error).message}`);
                    }
                }
                console.log(`      ✅ Ingested ${successCount}/${chunks.length} chunks\n`);
            } else {
                console.log(`      ⚠️  No chunks found in file\n`);
            }
        }

        // Summary
        console.log('════════════════════════════════════════════════════════════');
        console.log('✅ SETUP COMPLETE!');
        console.log('════════════════════════════════════════════════════════════\n');
        
        console.log('📋 Summary:');
        console.log(`   Organization: ${CONFIG.organization.name} (${orgId})`);
        console.log(`   Agent: ${CONFIG.agent.name} (${agentId})`);
        console.log(`   Greeting: "${CONFIG.agent.config.greeting}"`);
        
        console.log('\n🔧 Save these IDs for your .env file:');
        console.log('────────────────────────────────────────────────────────────');
        console.log(`ORGANIZATION_ID=${orgId}`);
        console.log(`AGENT_ID=${agentId}`);
        
        console.log('\n📝 Next Steps:');
        console.log('────────────────────────────────────────────────────────────');
        console.log('1. Start the API server:     npm run api');
        console.log('2. Start the voice agent:    npm run agent');
        console.log('3. Test in LiveKit Playground with your room');
        console.log('\n🌐 API Endpoints:');
        console.log('   - http://localhost:8000/health');
        console.log('   - http://localhost:8000/api/v1/agents');
        console.log('   - http://localhost:8000/api/v1/knowledge/search?agent_id=' + agentId + '&query=menu');
        
    } catch (error) {
        console.error('\n❌ Setup failed:', (error as Error).message);
        console.error(error);
        process.exit(1);
    }
}

main();
