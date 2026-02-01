# 🚀 Complete Render.com Deployment Guide
# For Beginners - Step by Step

This guide will help you deploy your LiveKit Sarvam Agent to Render.com with automatic keep-alive functionality.

---

## 📋 Table of Contents

1. [Why Render.com?](#why-rendercom)
2. [Prerequisites](#prerequisites)
3. [Step 1: Prepare Your Code](#step-1-prepare-your-code)
4. [Step 2: Create Render Account](#step-2-create-render-account)
5. [Step 3: Deploy the Agent](#step-3-deploy-the-agent)
6. [Step 4: Configure Environment Variables](#step-4-configure-environment-variables)
7. [Step 5: Set Up Keep-Alive Cron Job](#step-5-set-up-keep-alive-cron-job)
8. [Step 6: Verify Deployment](#step-6-verify-deployment)
9. [Troubleshooting](#troubleshooting)
10. [Cost & Plans](#cost--plans)

---

## Why Render.com?

✅ **Pros:**
- **Simple Setup** - Easiest for beginners (no CLI needed)
- **Free Tier** - Free tier available for testing (sleeps after 15 min)
- **Starter Plan ($7/month)** - Never sleeps, perfect for voice agents
- **Singapore Region** - Closest to India (decent latency)
- **Auto Deploy** - Deploys on every git push
- **Built-in SSL** - HTTPS enabled automatically

⚠️ **Cons:**
- No Mumbai region (Singapore adds ~100-200ms latency)
- Free tier sleeps after inactivity (not suitable for production)

**Recommendation:** Use **Starter Plan ($7/month)** for production voice agents.

---

## Prerequisites

Before starting, make sure you have:

### 1. ✅ Your API Keys Ready

| Service | Key Name | Get it from |
|---------|----------|-------------|
| LiveKit | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | [cloud.livekit.io](https://cloud.livekit.io) |
| OpenAI | `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Sarvam AI | `SARVAM_API_KEY` | [sarvam.ai](https://sarvam.ai) |
| Convex | `CONVEX_URL`, `CONVEX_DEPLOY_KEY` | [convex.dev](https://convex.dev) |

### 2. ✅ GitHub Account

- If you don't have one, create at [github.com](https://github.com/signup)
- Your code must be in a GitHub repository for Render to deploy

### 3. ✅ This Repository Pushed to GitHub

If you haven't already:

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - Ready for Render deployment"

# Create new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/livekit_sarvam_agent.git
git branch -M main
git push -u origin main
```

---

## Step 1: Prepare Your Code

### 1.1 Update `render.yaml` with Your GitHub URL

Open `render.yaml` and replace `YOUR_USERNAME`:

```yaml
repo: https://github.com/YOUR_USERNAME/livekit_sarvam_agent
```

**Example:**
```yaml
repo: https://github.com/johndoe/livekit_sarvam_agent
```

### 1.2 Verify Dockerfile Exists

Check that `Dockerfile` is in your project root (it should already be there).

### 1.3 Commit Changes

```bash
git add render.yaml
git commit -m "Add Render deployment config"
git push
```

---

## Step 2: Create Render Account

### 2.1 Sign Up

1. Go to [render.com](https://render.com)
2. Click **"Get Started for Free"**
3. Sign up with:
   - **GitHub** (Recommended - easier integration) OR
   - Email

### 2.2 Connect GitHub

If you signed up with email:
1. Go to **Account Settings** → **Connected Accounts**
2. Click **"Connect GitHub"**
3. Authorize Render to access your repositories

---

## Step 3: Deploy the Agent

### Method A: Using `render.yaml` (Recommended for Beginners)

This is the **easiest method** - Render reads your config file automatically.

1. **Go to Render Dashboard**
   - Visit [dashboard.render.com](https://dashboard.render.com)

2. **Create New Blueprint**
   - Click **"New +"** → **"Blueprint"**
   - Select **"Connect a repository"**

3. **Choose Your Repository**
   - Find `livekit_sarvam_agent` in the list
   - Click **"Connect"**

4. **Render Reads `render.yaml`**
   - Render automatically detects `render.yaml`
   - It will show you the services it will create:
     - ✅ Web Service: `livekit-sarvam-agent`
     - ✅ Cron Job: `keep-alive-ping`

5. **Apply Configuration**
   - Click **"Apply"**
   - Render creates both services automatically!

### Method B: Manual Setup (Alternative)

If you prefer to set up manually:

1. **Create Web Service**
   - Dashboard → **"New +"** → **"Web Service"**
   - Connect repository
   - Choose **"Docker"** as environment
   - Set:
     - Name: `livekit-sarvam-agent`
     - Region: **Singapore**
     - Branch: `main`
     - Dockerfile Path: `./Dockerfile`

2. **Select Plan**
   - **Free** - For testing (sleeps after 15 min) ❌
   - **Starter ($7/month)** - Recommended (never sleeps) ✅

3. **Click "Create Web Service"**

---

## Step 4: Configure Environment Variables

**Critical:** Your agent won't work without these variables!

### 4.1 Go to Environment Settings

1. In your service dashboard, click **"Environment"** (left sidebar)
2. Click **"Add Environment Variable"**

### 4.2 Add All Required Variables

Add these one by one (click **"Add Environment Variable"** for each):

#### LiveKit Configuration

```
Key: LIVEKIT_URL
Value: wss://your-livekit-server.livekit.cloud
```

```
Key: LIVEKIT_API_KEY
Value: your_api_key_here
```

```
Key: LIVEKIT_API_SECRET
Value: your_api_secret_here
```

#### AI Provider Keys

```
Key: OPENAI_API_KEY
Value: sk-...your_openai_key
```

```
Key: SARVAM_API_KEY
Value: your_sarvam_key_here
```

#### Convex Database

```
Key: CONVEX_URL
Value: https://your-project.convex.cloud
```

```
Key: CONVEX_DEPLOY_KEY
Value: prod:your-project|...
```

#### Optional: Node Environment

```
Key: NODE_ENV
Value: production
```

```
Key: PORT
Value: 8080
```

### 4.3 Save Variables

Click **"Save Changes"** at the bottom.

**Important:** The service will automatically redeploy when you save.

---

## Step 5: Set Up Keep-Alive Cron Job

### Why Do We Need This?

- **Free Tier:** Service sleeps after 15 minutes → Cron job wakes it up
- **Starter Plan ($7/month):** Doesn't sleep, but cron job acts as health monitor

### 5.1 Create Cron Job (If using Blueprint)

If you used `render.yaml` in Step 3, the cron job is **already created**. Skip to 5.3.

### 5.2 Create Cron Job (Manual Method)

1. **Dashboard → "New +"** → **"Cron Job"**

2. **Connect Repository**
   - Select `livekit_sarvam_agent`

3. **Configure Cron Job:**
   ```
   Name: keep-alive-ping
   Schedule: */5 * * * *  (Every 5 minutes)
   Command: curl -f https://livekit-sarvam-agent.onrender.com/health || exit 0
   ```

   **⚠️ Important:** Replace `livekit-sarvam-agent.onrender.com` with your actual service URL!

4. **Create Cron Job**

### 5.3 Get Your Service URL

1. Go to your web service dashboard
2. Look for the URL at the top (looks like `https://livekit-sarvam-agent.onrender.com`)
3. Copy this URL

### 5.4 Update Cron Job Command

1. Go to your cron job
2. Click **"Settings"**
3. Update the command with your actual URL:
   ```bash
   curl -f https://YOUR-SERVICE-URL.onrender.com/health || exit 0
   ```
4. Save

---

## Step 6: Verify Deployment

### 6.1 Check Build Logs

1. Go to your web service dashboard
2. Click **"Logs"** (left sidebar)
3. You should see:
   ```
   ==> Building...
   ==> Deploying...
   ==> Health check passed
   ==> Service is live
   ```

### 6.2 Test Health Endpoint

Open your browser and visit:
```
https://YOUR-SERVICE-URL.onrender.com/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-21T10:30:00.000Z"
}
```

### 6.3 Check Cron Job

1. Go to cron job dashboard
2. Click **"Logs"**
3. Wait 5 minutes
4. You should see successful health check pings

### 6.4 Monitor Service

1. **Events Tab** - Shows deployments and restarts
2. **Metrics Tab** - Shows CPU, memory, bandwidth usage
3. **Logs Tab** - Real-time application logs

---

## Troubleshooting

### ❌ Build Failed

**Symptom:** Build fails with errors

**Solutions:**

1. **Check Dockerfile:**
   ```bash
   # Test build locally
   docker build -t test-agent .
   ```

2. **Check Dependencies:**
   ```bash
   npm install
   npm run build
   ```

3. **View Build Logs:**
   - Render Dashboard → Logs → Look for error messages

### ❌ Service Not Responding

**Symptom:** Service starts but health check fails

**Solutions:**

1. **Verify Environment Variables:**
   - Go to Environment tab
   - Make sure ALL variables are set (especially `PORT=8080`)

2. **Check Application Logs:**
   - Look for startup errors
   - Common issues:
     - Missing API keys
     - Wrong LiveKit URL format (must be `wss://...`)
     - Convex connection errors

3. **Test Locally:**
   ```bash
   npm run build
   npm start
   # Visit http://localhost:8080/health
   ```

### ❌ Service Keeps Restarting

**Symptom:** Service crashes and restarts repeatedly

**Solutions:**

1. **Check Memory Usage:**
   - Metrics tab → Memory graph
   - If memory > 500MB, upgrade to Starter plan

2. **Check for Crashes:**
   - Logs tab → Look for error messages before restart
   - Common issues:
     - Unhandled promise rejections
     - Out of memory
     - Invalid API keys

3. **Enable Debug Logging:**
   - Add environment variable: `DEBUG=livekit:*`

### ❌ Cron Job Not Running

**Symptom:** Cron job shows no logs

**Solutions:**

1. **Verify Schedule:**
   - Format: `*/5 * * * *` (every 5 minutes)
   - Valid cron syntax: [crontab.guru](https://crontab.guru)

2. **Check Command:**
   - Must use your actual service URL
   - Test command locally:
     ```bash
     curl -f https://YOUR-SERVICE-URL.onrender.com/health
     ```

3. **Verify Service is Running:**
   - Cron job can't ping if service is down

### ❌ High Latency

**Symptom:** Slow response times (>2 seconds)

**Solutions:**

1. **Check Region:**
   - Render only has Singapore (no Mumbai)
   - Expected latency: 1.0-1.5s from India

2. **Optimize API Calls:**
   - Already optimized in your code
   - Main bottleneck: OpenAI US servers (~800ms)

3. **Consider Other Platforms:**
   - Fly.io has Mumbai region (faster)
   - See `docs/DEPLOYMENT.md` for alternatives

---

## Cost & Plans

### Free Plan

| Feature | Value |
|---------|-------|
| **Price** | $0 |
| **Compute** | 512 MB RAM, 0.1 CPU |
| **Sleeps After** | 15 minutes inactivity ❌ |
| **Build Minutes** | 500 per month |
| **Bandwidth** | 100 GB |

**⚠️ Not Suitable For:** Production voice agents (will disconnect during sleep)

**✅ Good For:** Testing, development

### Starter Plan (Recommended)

| Feature | Value |
|---------|-------|
| **Price** | **$7/month** |
| **Compute** | 512 MB RAM, 0.5 CPU |
| **Never Sleeps** | ✅ Always on |
| **Build Minutes** | Unlimited |
| **Bandwidth** | 100 GB |

**✅ Suitable For:** Production voice agents, 100-500 calls/day

### Standard Plan

| Feature | Value |
|---------|-------|
| **Price** | $25/month |
| **Compute** | 2 GB RAM, 1 CPU |
| **Performance** | 4x faster |
| **Bandwidth** | 500 GB |

**✅ Suitable For:** High traffic (1000+ calls/day)

### Choosing a Plan

```
Testing/Development → Free Plan
Production (low traffic) → Starter Plan ($7/month)
Production (high traffic) → Standard Plan ($25/month)
```

---

## Automatic Deployments

### Auto-Deploy on Push

Render automatically deploys when you push to GitHub:

```bash
# Make changes
git add .
git commit -m "Update agent configuration"
git push

# Render automatically:
# 1. Detects push
# 2. Builds new Docker image
# 3. Deploys to production
# 4. Runs health checks
```

### Manual Deploy

If auto-deploy is disabled:

1. Go to service dashboard
2. Click **"Manual Deploy"** → **"Deploy latest commit"**

### Rollback

If something breaks:

1. Go to **"Events"** tab
2. Find previous successful deployment
3. Click **"Rollback"**

---

## Monitoring & Logs

### Real-Time Logs

```bash
# View in browser
Dashboard → Your Service → Logs

# Filter logs
Search box → "error" or "warning"
```

### Metrics

Dashboard → Metrics tab shows:
- **CPU Usage** - Should be <50% average
- **Memory Usage** - Should be <400MB
- **Bandwidth** - Tracks data transfer

### Alerts (Paid Plans)

Set up alerts for:
- Service down
- High memory usage
- Failed health checks

---

## Security Best Practices

### 1. Use Environment Variables for Secrets

✅ **Never commit API keys to git**

```bash
# Check for exposed secrets
git log --all --full-history --source -- '*' | grep -i "api_key"
```

### 2. Enable HTTPS Only

Render enables HTTPS by default - verify:
```bash
curl -I https://YOUR-SERVICE-URL.onrender.com/health
# Should show: Strict-Transport-Security header
```

### 3. Rotate Keys Regularly

Update environment variables in Render dashboard every 90 days.

---

## Next Steps

After successful deployment:

1. ✅ **Test Voice Calls** - Make test calls to verify agent works
2. ✅ **Set Up Monitoring** - Configure alerts for downtime
3. ✅ **Scale as Needed** - Upgrade plan if traffic increases
4. ✅ **Optimize Latency** - Consider Fly.io Mumbai if latency is critical

---

## Additional Resources

- **Render Documentation:** [render.com/docs](https://render.com/docs)
- **Render Status:** [status.render.com](https://status.render.com)
- **Render Community:** [community.render.com](https://community.render.com)
- **LiveKit Docs:** [docs.livekit.io](https://docs.livekit.io)

---

## Support

### If You Get Stuck:

1. **Check Logs First** - 90% of issues show up in logs
2. **Search Render Community** - Someone probably had same issue
3. **Check GitHub Issues** - Known bugs and solutions
4. **Contact Support:**
   - Render: [render.com/support](https://render.com/support)
   - Create issue in this repository

---

## Quick Reference Commands

```bash
# Push code to deploy
git add .
git commit -m "Update"
git push

# Test health locally
curl http://localhost:8080/health

# Test health on Render
curl https://YOUR-SERVICE-URL.onrender.com/health

# Check cron syntax
# Visit: https://crontab.guru
```

---

**🎉 Congratulations!** Your voice agent is now running 24/7 on Render.com!
