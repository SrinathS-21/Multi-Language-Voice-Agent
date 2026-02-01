# 🚀 Complete Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  PRODUCTION DEPLOYMENT (3 Services)                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Backend (Docker Container)                          │
│     ├── API Server (port 8000) ← REST endpoints        │
│     └── LiveKit Agent ← Voice call handling            │
│                                                          │
│  2. Frontend (Vercel/Netlify)                          │
│     └── Next.js App (port 3000)                        │
│                                                          │
│  3. Convex (Already in Cloud)                          │
│     └── Database + Functions ✅ No deployment needed    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 📦 COMPONENT 1: Backend (API + Agent)

### Local Development

```bash
# Terminal 1: API Server
npm run dev:api        # Port 8000

# Terminal 2: Agent
npm run dev            # LiveKit WebSocket
```

### Production Build

```bash
npm run build          # Compiles TypeScript → dist/
```

### Production Deployment Options

#### **Option A: Render.com (Recommended)**

1. **Create Render Account**: https://render.com
2. **Update `render.yaml`**:
   ```yaml
   services:
     - type: web
       name: livekit-agent-backend
       runtime: docker
       dockerfilePath: ./Dockerfile
       region: singapore
       plan: starter
       healthCheckPath: /health
       
       envVars:
         # Copy from your .env file
         - key: LIVEKIT_URL
           value: wss://your-livekit.cloud
         - key: OPENAI_API_KEY
           sync: false
         - key: CONVEX_URL
           value: https://your-convex.cloud
   ```

3. **Deploy**:
   ```bash
   # Push to GitHub
   git add .
   git commit -m "Production ready"
   git push
   
   # Render auto-deploys from GitHub
   ```

4. **Get Backend URL**: `https://livekit-agent-backend.onrender.com`

#### **Option B: Docker (Any Platform)**

```bash
# Build
docker build -t voice-agent-backend .

# Run locally
docker run -p 8000:8000 --env-file .env voice-agent-backend

# Deploy to cloud
docker tag voice-agent-backend your-registry/voice-agent
docker push your-registry/voice-agent
```

#### **Option C: Railway/Fly.io**

Similar to Render - push to GitHub and connect repository.

---

## 🎨 COMPONENT 2: Frontend (Next.js)

### Local Development

```bash
cd Frontend
npm run dev            # Port 3000
```

### Production Build

```bash
cd Frontend
npm run build          # Creates .next/ folder
```

### Production Deployment Options

#### **Option A: Vercel (Recommended for Next.js)**

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   cd Frontend
   vercel --prod
   ```

3. **Environment Variables** (in Vercel Dashboard):
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
   NEXT_PUBLIC_DEFAULT_TENANT_ID=your-org-id
   ```

#### **Option B: Netlify**

```bash
cd Frontend
npm run build
netlify deploy --prod --dir=.next
```

#### **Option C: Self-hosted**

```bash
cd Frontend
npm run build
npm run start          # Port 3000
```

---

## ☁️ COMPONENT 3: Convex (Already Deployed)

✅ **No action needed** - Convex is already running in cloud

Your `.env` already has:
```
CONVEX_URL=https://...
```

---

## 🔧 Environment Variables Setup

### Backend (.env in root)

```env
# LiveKit
LIVEKIT_URL=wss://your-livekit.livekit.cloud
LIVEKIT_API_KEY=APIxxx
LIVEKIT_API_SECRET=xxx

# AI Services
OPENAI_API_KEY=sk-xxx
SARVAM_API_KEY=xxx

# Database
CONVEX_URL=https://xxx.convex.cloud
CONVEX_DEPLOY_KEY=xxx

# Organization
DEFAULT_ORGANIZATION_ID=your-org-id

# Server
PORT=8000
NODE_ENV=production
```

### Frontend (.env.local in Frontend/)

```env
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
NEXT_PUBLIC_DEFAULT_TENANT_ID=your-org-id
```

---

## 🎯 Deployment Checklist

### Before Deployment

- [x] ✅ TypeScript errors fixed
- [x] ✅ Duration calculation fixed
- [x] ✅ Build succeeds (`npm run build`)
- [ ] 📝 Update environment variables
- [ ] 📝 Test locally with production build
- [ ] 📝 Update frontend API URL

### Deploy Backend First

1. Push code to GitHub
2. Connect Render/Railway to repo
3. Set environment variables in dashboard
4. Deploy and get URL: `https://xxx.onrender.com`
5. Test health endpoint: `https://xxx.onrender.com/health`

### Deploy Frontend Second

1. Update `NEXT_PUBLIC_API_URL` to backend URL
2. Deploy to Vercel: `vercel --prod`
3. Get frontend URL: `https://xxx.vercel.app`

### Test End-to-End

1. Open frontend URL
2. Create test agent
3. Make test call
4. Check duration displays correctly ✅

---

## 📊 Cost Estimate

| Service | Plan | Cost | Purpose |
|---------|------|------|---------|
| Render | Starter | $7/mo | Backend (API + Agent) |
| Vercel | Hobby | Free | Frontend |
| Convex | Free | $0 | Database (already deployed) |
| **Total** | | **$7/mo** | |

---

## 🆘 Troubleshooting

### Backend won't start
```bash
# Check logs
docker logs container-id

# Check environment
curl https://your-backend.onrender.com/health
```

### Frontend can't connect
- Verify `NEXT_PUBLIC_API_URL` points to backend
- Check CORS settings in backend
- Check browser console for errors

### Duration still shows "--"
- Clear browser cache
- Check API response: `https://backend/api/v1/calls`
- Verify `duration_seconds` field exists

---

## 🎉 Success Criteria

✅ Backend API responds: `curl https://backend/health`  
✅ Frontend loads: Open browser  
✅ Can create agents  
✅ Can make calls  
✅ Duration displays correctly (no more "--")  
✅ Call history shows in dashboard

---

## 📝 Quick Commands Reference

```bash
# Development
npm run dev:api              # Backend API only
npm run dev                  # Agent only
cd Frontend && npm run dev   # Frontend

# Production Build
npm run build                # Backend
cd Frontend && npm run build # Frontend

# Production Run
npm start                    # Starts both API + Agent
cd Frontend && npm start     # Frontend
```

---

## 🔗 Important URLs After Deployment

- Backend API: `https://your-backend.onrender.com`
- Frontend: `https://your-frontend.vercel.app`
- Health Check: `https://your-backend.onrender.com/health`
- API Docs: `https://your-backend.onrender.com/api/v1/`
- Convex Dashboard: `https://dashboard.convex.dev`
