# 🎯 Render.com Deployment - Quick Reference

## 🚀 One-Command Preparation

```bash
npm run prepare:render
```

This script automatically:
- ✅ Checks git status
- ✅ Updates render.yaml
- ✅ Verifies GitHub connection
- ✅ Pushes code
- ✅ Shows next steps

---

## 📝 Manual Steps (3 Minutes)

### 1. Push Code to GitHub

```bash
git add .
git commit -m "Ready for Render deployment"
git push
```

### 2. Deploy on Render.com

1. Go to [render.com](https://render.com) → Sign up with GitHub
2. **New +** → **Blueprint**
3. Select repository: `livekit_sarvam_agent`
4. Click **"Apply"**

### 3. Add Environment Variables

Go to service → **Environment** tab → Add:

| Key | Example Value |
|-----|---------------|
| `LIVEKIT_URL` | `wss://your-project.livekit.cloud` |
| `LIVEKIT_API_KEY` | `APIxxx...` |
| `LIVEKIT_API_SECRET` | `secret...` |
| `OPENAI_API_KEY` | `sk-...` |
| `SARVAM_API_KEY` | `...` |
| `CONVEX_URL` | `https://your-project.convex.cloud` |
| `CONVEX_DEPLOY_KEY` | `prod:...` |

Click **"Save Changes"** → Service redeploys automatically

### 4. Verify Deployment

Visit: `https://YOUR-SERVICE.onrender.com/health`

Expected: `{"status":"healthy",...}`

---

## 🔄 Keep-Alive Cron Job

### Auto-Created (via render.yaml)

Cron job is created automatically. Just update the URL:

1. Go to cron job → **Settings**
2. Update command:
   ```bash
   curl -f https://YOUR-ACTUAL-URL.onrender.com/health || exit 0
   ```
3. Save

### Test Manually

```bash
# Test health endpoint
curl https://YOUR-SERVICE.onrender.com/health

# Test keep-alive script locally
npm run health-check
```

---

## 💰 Pricing

| Plan | Price | Use Case |
|------|-------|----------|
| **Free** | $0 | Testing (sleeps after 15 min) ❌ |
| **Starter** | **$7/mo** | Production (never sleeps) ✅ |
| **Standard** | $25/mo | High traffic |

**Recommendation:** Starter plan for production voice agents.

---

## 📊 Monitoring

### View Logs

```
Dashboard → Your Service → Logs
```

### Check Metrics

```
Dashboard → Your Service → Metrics
```

Shows: CPU, Memory, Bandwidth

### Health Check

```bash
curl https://YOUR-SERVICE.onrender.com/health
```

---

## 🐛 Common Issues & Fixes

### Build Fails

```bash
# Test locally first
npm run build
```

**Solution:** Fix TypeScript errors, then push again

### Service Not Responding

**Check:**
1. All environment variables are set
2. PORT = 8080
3. Service logs for errors

### Cron Job Not Working

**Check:**
1. URL in cron command is correct
2. Service is running
3. Schedule syntax: `*/5 * * * *`

---

## 🔗 Quick Links

| Resource | Link |
|----------|------|
| **Full Guide** | [docs/RENDER_DEPLOYMENT.md](../docs/RENDER_DEPLOYMENT.md) |
| **Checklist** | [docs/RENDER_CHECKLIST.md](../docs/RENDER_CHECKLIST.md) |
| **Render Dashboard** | [dashboard.render.com](https://dashboard.render.com) |
| **Render Docs** | [render.com/docs](https://render.com/docs) |
| **Render Status** | [status.render.com](https://status.render.com) |

---

## 🆘 Need Help?

1. **Check logs first** - Most issues show up in logs
2. **Read full guide** - [RENDER_DEPLOYMENT.md](../docs/RENDER_DEPLOYMENT.md)
3. **Search Render Community** - [community.render.com](https://community.render.com)
4. **Create issue** - GitHub Issues

---

## ✅ Success Checklist

- [ ] Code pushed to GitHub
- [ ] Deployed on Render
- [ ] Environment variables set
- [ ] Health check passes
- [ ] Cron job running
- [ ] Test call successful

**🎉 Done! Your agent is live 24/7!**
