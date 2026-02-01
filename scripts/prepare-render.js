#!/usr/bin/env node
/**
 * Interactive Render.com Deployment Helper
 * 
 * This script guides you through deploying to Render.com step-by-step.
 */

const readline = require('readline');
const { exec } = require('child_process');
const fs = require('fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function header(message) {
  console.log('');
  log('═══════════════════════════════════════════════════════', colors.cyan);
  log(`  ${message}`, colors.bright + colors.cyan);
  log('═══════════════════════════════════════════════════════', colors.cyan);
  console.log('');
}

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(`${colors.yellow}❓ ${prompt}${colors.reset}`, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function execCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr });
      } else {
        resolve(stdout);
      }
    });
  });
}

async function checkGitStatus() {
  try {
    const status = await execCommand('git status --porcelain');
    if (status.trim()) {
      log('⚠️  You have uncommitted changes:', colors.yellow);
      console.log(status);
      const answer = await question('Commit all changes now? (y/n): ');
      if (answer.toLowerCase() === 'y') {
        const message = await question('Commit message: ');
        await execCommand(`git add . && git commit -m "${message}"`);
        log('✅ Changes committed', colors.green);
      }
    } else {
      log('✅ Git status is clean', colors.green);
    }
  } catch (err) {
    log('⚠️  Not a git repository or git not installed', colors.yellow);
  }
}

async function updateRenderYaml() {
  const yamlPath = 'render.yaml';
  
  if (!fs.existsSync(yamlPath)) {
    log('❌ render.yaml not found!', colors.red);
    log('Please run this script from the project root directory.', colors.red);
    process.exit(1);
  }

  let content = fs.readFileSync(yamlPath, 'utf8');
  
  if (content.includes('YOUR_USERNAME')) {
    log('📝 render.yaml needs to be updated with your GitHub username', colors.yellow);
    const username = await question('Enter your GitHub username: ');
    
    content = content.replace(/YOUR_USERNAME/g, username);
    fs.writeFileSync(yamlPath, content);
    
    log(`✅ Updated render.yaml with username: ${username}`, colors.green);
    
    const commit = await question('Commit this change? (y/n): ');
    if (commit.toLowerCase() === 'y') {
      await execCommand('git add render.yaml && git commit -m "Update render.yaml with GitHub username"');
      log('✅ Changes committed', colors.green);
    }
  } else {
    log('✅ render.yaml already configured', colors.green);
  }
}

async function checkGitHub() {
  try {
    const remote = await execCommand('git remote get-url origin');
    if (remote) {
      log(`✅ GitHub remote found: ${remote.trim()}`, colors.green);
      return true;
    }
  } catch {
    log('❌ No GitHub remote found', colors.red);
    log('You need to push your code to GitHub first.', colors.yellow);
    console.log('');
    log('Steps:', colors.bright);
    log('1. Create a new repository on GitHub', colors.dim);
    log('2. Run: git remote add origin <your-repo-url>', colors.dim);
    log('3. Run: git push -u origin main', colors.dim);
    return false;
  }
}

async function pushToGitHub() {
  const push = await question('Push to GitHub now? (y/n): ');
  if (push.toLowerCase() === 'y') {
    try {
      await execCommand('git push');
      log('✅ Pushed to GitHub', colors.green);
    } catch (err) {
      log('❌ Failed to push', colors.red);
      log(err.stderr, colors.red);
      return false;
    }
  }
  return true;
}

async function showAPIKeysNeeded() {
  header('API Keys Required');
  
  log('Before deploying, make sure you have these API keys ready:', colors.bright);
  console.log('');
  
  const keys = [
    { name: 'LiveKit', keys: ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'], url: 'cloud.livekit.io' },
    { name: 'OpenAI', keys: ['OPENAI_API_KEY'], url: 'platform.openai.com/api-keys' },
    { name: 'Sarvam AI', keys: ['SARVAM_API_KEY'], url: 'sarvam.ai' },
    { name: 'Convex', keys: ['CONVEX_URL', 'CONVEX_DEPLOY_KEY'], url: 'convex.dev' },
  ];
  
  keys.forEach(({ name, keys: keyList, url }) => {
    log(`${name}:`, colors.cyan);
    keyList.forEach(key => log(`  - ${key}`, colors.dim));
    log(`  Get from: ${url}`, colors.dim);
    console.log('');
  });
  
  const ready = await question('Do you have all API keys ready? (y/n): ');
  if (ready.toLowerCase() !== 'y') {
    log('Please gather all API keys first, then run this script again.', colors.yellow);
    process.exit(0);
  }
}

async function showNextSteps() {
  header('Next Steps');
  
  log('Your code is ready for Render.com deployment!', colors.green);
  console.log('');
  
  log('Follow these steps:', colors.bright);
  console.log('');
  
  log('1. Go to render.com and sign up (use GitHub login)', colors.cyan);
  log('   https://render.com', colors.dim);
  console.log('');
  
  log('2. Create a new Blueprint:', colors.cyan);
  log('   Dashboard → New + → Blueprint → Connect repository', colors.dim);
  console.log('');
  
  log('3. Select your repository: livekit_sarvam_agent', colors.cyan);
  log('   Render will auto-detect render.yaml', colors.dim);
  console.log('');
  
  log('4. Click "Apply" to create services', colors.cyan);
  log('   This creates: Web Service + Cron Job', colors.dim);
  console.log('');
  
  log('5. Add environment variables:', colors.cyan);
  log('   Service → Environment → Add each API key', colors.dim);
  console.log('');
  
  log('6. Wait for deployment (5-10 minutes)', colors.cyan);
  log('   Monitor build logs for any errors', colors.dim);
  console.log('');
  
  log('7. Test health endpoint:', colors.cyan);
  log('   Visit: https://YOUR-SERVICE.onrender.com/health', colors.dim);
  console.log('');
  
  log('📚 Full guide: docs/RENDER_DEPLOYMENT.md', colors.yellow);
  log('📋 Checklist: docs/RENDER_CHECKLIST.md', colors.yellow);
  console.log('');
}

async function main() {
  header('Render.com Deployment Helper');
  
  log('This script will help you prepare for Render.com deployment.', colors.bright);
  console.log('');
  
  // Step 1: Check git status
  log('Step 1: Checking git status...', colors.cyan);
  await checkGitStatus();
  console.log('');
  
  // Step 2: Update render.yaml
  log('Step 2: Checking render.yaml...', colors.cyan);
  await updateRenderYaml();
  console.log('');
  
  // Step 3: Check GitHub
  log('Step 3: Checking GitHub connection...', colors.cyan);
  const hasGitHub = await checkGitHub();
  if (!hasGitHub) {
    rl.close();
    process.exit(1);
  }
  console.log('');
  
  // Step 4: Push to GitHub
  log('Step 4: Pushing to GitHub...', colors.cyan);
  const pushed = await pushToGitHub();
  if (!pushed) {
    rl.close();
    process.exit(1);
  }
  console.log('');
  
  // Step 5: Check API keys
  await showAPIKeysNeeded();
  
  // Step 6: Show next steps
  await showNextSteps();
  
  log('✅ Preparation complete!', colors.green);
  log('You can now deploy to Render.com using the steps above.', colors.bright);
  
  rl.close();
}

// Run main
main().catch(err => {
  log(`❌ Error: ${err.message}`, colors.red);
  rl.close();
  process.exit(1);
});
