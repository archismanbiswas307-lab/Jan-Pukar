# JanPukar - Render Deployment Guide

## Prerequisites

- GitHub/GitLab repository with this code pushed
- Supabase project with:
  - `grievances` table
  - `profiles` table
  - `clusters` table
  - `grievance-images` storage bucket
- Telegram Bot token from [@BotFather](https://t.me/botfather)

---

## 1. Frontend Deployment (Next.js)

### Create Web Service on Render

1. Go to [render.com](https://render.com)
2. Create **New Web Service**
3. Configure:

| Setting | Value |
|---------|-------|
| **Repository** | Select your GitHub repo |
| **Runtime** | Node |
| **Root Directory** | `frontend` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start` |
| **Environment** | Production |

### Environment Variables

Set these in Render dashboard:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...your-anon-key...
NEXT_PUBLIC_SUPABASE_CLUSTER_ID=00000000-0000-0000-0000-000000000000
```

### Expected URL

```
https://janpukar-frontend.onrender.com
```

---

## 2. Backend Deployment (FastAPI)

### Create Web Service on Render

1. Create **New Web Service**
2. Configure:

| Setting | Value |
|---------|-------|
| **Repository** | Same GitHub repo |
| **Runtime** | Python 3 |
| **Root Directory** | `backend` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Environment** | Production |

### Environment Variables

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...your-service-role-key...
SUPABASE_CLUSTER_ID=00000000-0000-0000-0000-000000000000
CORS_ALLOWED_ORIGINS=https://janpukar-frontend.onrender.com
```

### Verify Deployment

- Health check: `https://<your-backend-url>/health` → `{"status":"ok"}`
- Readiness check: `https://<your-backend-url>/health/ready` → `{"status":"ok","cluster_id":"..."}`

---

## 3. Telegram Bot Deployment (Background Worker)

### Create Background Worker on Render

1. Create **New Background Worker**
2. Configure:

| Setting | Value |
|---------|-------|
| **Repository** | Same GitHub repo |
| **Runtime** | Python 3 |
| **Root Directory** | `backend` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `python bot.py` |
| **Environment** | Production |

### Environment Variables

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...your-service-role-key...
SUPABASE_CLUSTER_ID=00000000-0000-0000-0000-000000000000
TELEGRAM_BOT_TOKEN=9999999999:AAE_PjM...your-bot-token...
ADMIN_TELEGRAM_CHAT_IDS=123456789
ADMIN_WEBHOOK_URLS=https://your-webhook-endpoint.com/notify
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
```

### Important Notes

- This is the **authoritative Telegram ingestion path** — do NOT run a webhook simultaneously
- Long polling runs continuously and consumes a background worker slot
- Logs appear in the worker's live logs (check for startup messages like "Using Supabase URL...")

---

## 4. Verification Checklist

After all services are deployed, verify in this order:

### Frontend
- [ ] Visit `https://janpukar-frontend.onrender.com`
- [ ] Click "Login" — should reach login page
- [ ] Navigate to `/admin` — should load the map

### Backend API
- [ ] Visit `https://<your-backend-url>/health`
- [ ] Response: `{"status":"ok"}`
- [ ] Visit `https://<your-backend-url>/health/ready`
- [ ] Response should include `cluster_id`

### Telegram Bot
- [ ] Watch worker logs for startup output
- [ ] Should print: `Using Supabase URL: https://...`
- [ ] Should NOT print any error about missing env vars
- [ ] Send a test message to bot via Telegram — should receive "Please share your location..." response

---

## 5. Troubleshooting

### Frontend build fails
- Check `package.json` exists and is valid
- Verify Node version supports Next.js 16.2.12
- Check build logs for specific errors

### Backend fails to start
- Check Python version (must be 3.13+)
- Verify `requirements.txt` exists in `backend/` directory
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Look at build logs for pip install errors

### Bot doesn't process messages
- Check `TELEGRAM_BOT_TOKEN` is valid and not copied with extra spaces
- Verify bot is running (worker logs should show "Polling started")
- Ensure `SUPABASE_*` vars match backend settings
- Check Supabase table `grievances` exists and has correct schema

### Health checks fail
- Verify API is using correct root directory (`backend`)
- Check `SUPABASE_SERVICE_ROLE_KEY` is a valid service role key (not anon key)
- Look at deployment logs in Render dashboard

---

## 6. Environment Variables Reference

### Frontend (Next.js)
- `NEXT_PUBLIC_SUPABASE_URL` — Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Your Supabase anon public key
- `NEXT_PUBLIC_SUPABASE_CLUSTER_ID` (optional)

### Backend (FastAPI)
- `SUPABASE_URL` — Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Your Supabase **service role** key (secret)
- `SUPABASE_CLUSTER_ID` (optional)
- `CORS_ALLOWED_ORIGINS` — frontend URL (e.g., `https://janpukar-frontend.onrender.com`)

### Bot (Python Worker)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_CLUSTER_ID` (optional)
- `TELEGRAM_BOT_TOKEN` — 12+ digit token from @BotFather
- `ADMIN_TELEGRAM_CHAT_IDS` (optional) — comma-separated chat IDs to alert on high-urgency reports
- `ADMIN_WEBHOOK_URLS` (optional) — comma-separated webhook URLs for alerts
- `SMTP_*` (optional) — email alerting configuration

---

## 7. Local Testing Before Render

Test locally first to catch issues early:

### Frontend
```bash
cd frontend
npm install
npm run build
npm run start
```

Visit `http://localhost:3000`

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # or .\.venv\Scripts\Activate.ps1 on Windows
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Visit `http://localhost:8000/health`

### Bot
```bash
cd backend
# (same venv as above)
python bot.py
```

Watch logs for startup messages.

---

## Support

For issues, check:
1. Render service logs (click service → Logs)
2. Environment variable values (no extra spaces, correct keys)
3. Supabase project settings and schema
4. Telegram bot token validity

