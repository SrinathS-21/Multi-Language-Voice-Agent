import { ConvexHttpClient } from 'convex/browser';
import * as dotenv from 'dotenv';

dotenv.config();

type AnyClient = {
    query: (name: string, args: any) => Promise<any>;
};

async function main() {
    const client = new ConvexHttpClient(process.env.CONVEX_URL!) as unknown as AnyClient;
    
    const agentId = 'j57edpzy1tdf9dbzbzf8rmwe0h7z8qsk';
    
    const agent = await client.query('agents:get', { id: agentId });
    
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('📋 AGENT CONFIGURATION');
    console.log('════════════════════════════════════════════════════════════\n');
    
    console.log('Full Agent Object:');
    console.log(JSON.stringify(agent, null, 2));
    
    if (agent?.config) {
        console.log('\n════════════════════════════════════════════════════════════');
        console.log('Parsed Config JSON:');
        console.log(JSON.stringify(JSON.parse(agent.config), null, 2));
    }
}

main().catch(console.error);
