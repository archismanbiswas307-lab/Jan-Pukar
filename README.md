# JanPukar - Grievance Tracking System

A full-stack grievance tracking platform with real-time Telegram integration, geolocation mapping, and administrative dashboards.

---

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.13+
- Supabase account
- Telegram Bot token

### Local Setup

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# Visit http://localhost:3000
```

**Backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
# Visit http://localhost:8000
```

**Telegram Bot (separate terminal):**
```bash
cd backend
python bot.py
```

---

## Architecture

### Frontend (`frontend/`)
- **Framework:** Next.js 16.2.12 (App Router)
- **Styling:** Tailwind CSS 4
- **State:** React 19.2.4
- **Database:** Supabase JS client 2.112.0
- **Maps:** Leaflet + react-leaflet

**Key Pages:**
- `/login` — Email/password or magic link
- `/submit` — Report a grievance with location
- `/track` — View submitted grievances
- `/profile` — User profile + Telegram linking
- `/admin` — Grievance management dashboard

### Backend (`backend/`)
- **Framework:** FastAPI ≥0.110.0
- **Server:** uvicorn ≥0.28.0
- **Database:** Supabase ≥2.7.0
- **Telegram:** python-telegram-bot ≥21.4 (polling mode)
- **Geolocation:** geopy, haversine

**Key Endpoints:**
- `GET /health` — Service status
- `GET /health/ready` — Readiness check with cluster info
- `POST /grievances` — Submit grievance (requires auth)
- `GET /grievances` — List grievances with filters
- `PATCH /grievances/{id}` — Update grievance status (admin only)
- `POST /verify-admin` — Verify admin Telegram ID (optional)

**Async Workers:**
- `bot.py` — Telegram bot with long polling (authoritative ingestion)
- Supabase realtime listeners for database updates
- Notification pipeline: Telegram + optional webhook/email

### Database Schema

#### `grievances` table
```sql
id (uuid, primary key)
title (text)
description (text)
category (text)
latitude (double precision)
longitude (double precision)
urgency_score (smallint)
image_url (text)
cluster_id (uuid, foreign key)
status (text: 'open', 'in_progress', 'resolved')
created_at (timestamp)
updated_at (timestamp)
```

#### `profiles` table
```sql
id (uuid, primary key)
email (text, unique)
telegram_chat_id (bigint)
created_at (timestamp)
updated_at (timestamp)
```

#### `clusters` table
```sql
id (uuid, primary key)
count (integer)
center_lat (double precision)
center_lon (double precision)
```

---

## Environment Setup

### Frontend (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...
NEXT_PUBLIC_SUPABASE_CLUSTER_ID=00000000-0000-0000-0000-000000000000
```

### Backend (`.env`)
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_CLUSTER_ID=00000000-0000-0000-0000-000000000000
CORS_ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend.com
TELEGRAM_BOT_TOKEN=9999999999:AAE_PjM...
ADMIN_TELEGRAM_CHAT_IDS=123456789,987654321
ADMIN_WEBHOOK_URLS=https://webhook.site/your-id
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
```

---

## Deployment

### Render

See [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md) for complete step-by-step guide.

**Summary:**
1. Create web service for frontend (Node, root: `frontend`)
2. Create web service for backend (Python 3, root: `backend`)
3. Create background worker for bot (Python 3, root: `backend`, start: `python bot.py`)
4. Set environment variables for each service
5. Verify health endpoints and Telegram connectivity

**Services:**
- Frontend web service → `https://janpukar-frontend.onrender.com`
- Backend web service → `https://janpukar-backend.onrender.com`
- Telegram bot worker → background process (logs visible in workers tab)

---

## Development

### Running Tests
```bash
cd backend
pytest
```

### Code Quality
```bash
cd frontend
npm run lint

cd backend
pylint *.py
```

### Database Migrations
Managed via Supabase dashboard or `supabase-cli`:
```bash
supabase db pull  # Pull schema
supabase db push  # Push schema
```

---

## Features

### User Features
- 🔐 Secure authentication (email/magic link)
- 📍 Report grievances with precise location
- 📸 Upload images with reports
- 🗺️ Interactive map with clustered grievances
- 💬 Telegram bot integration
- 📊 Track grievance status in real-time

### Admin Features
- 👥 Manage grievance statuses
- 📈 View clustering and urgency metrics
- 🤖 Telegram notifications for high-priority reports
- 📧 Email/webhook alerts
- 🔍 Filter by category, urgency, date range

### Bot Features
- 📱 Telegram user registration (chat ID linking)
- 📍 Location-based grievance submission
- 🔔 Real-time admin notifications
- ✅ Request acknowledgment

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Frontend build fails | Ensure `node_modules` not in git; run `npm install` |
| Backend API 500 error | Check SUPABASE_SERVICE_ROLE_KEY is valid (not anon key) |
| Telegram bot not responding | Verify TELEGRAM_BOT_TOKEN and bot is polling (not webhook) |
| Map markers not visible | Check latitude/longitude are within ±90/±180 range |
| Image upload fails | Ensure Supabase storage bucket `grievance-images` exists and is public |

---

## Project Structure

```
JanPukar/
├── frontend/               # Next.js app
│   ├── app/               # API routes + pages
│   │   ├── api/telegram/
│   │   ├── admin/
│   │   ├── login/
│   │   ├── profile/
│   │   ├── submit/
│   │   └── track/
│   ├── components/        # Reusable React components
│   │   ├── Map.js
│   │   ├── Nav.js
│   │   └── UploadUtils.js
│   ├── lib/               # Utilities
│   │   └── supabase.js
│   ├── package.json
│   └── tsconfig.json
├── backend/               # FastAPI + bot
│   ├── main.py            # FastAPI app
│   ├── bot.py             # Telegram bot (polling)
│   ├── requirements.txt    # Python dependencies
│   ├── runtime.txt        # Python version
│   └── .python-version    # pyenv/asdf version
├── .gitignore
├── README.md              # This file
└── RENDER_DEPLOYMENT.md   # Render setup guide
```

---

## Contribution Guidelines

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes and test locally
3. Commit with clear messages: `git commit -m "Add feature: description"`
4. Push and create pull request
5. Ensure CI passes and code is reviewed

---

## License

This project is provided as-is for educational and non-commercial use.

---

## Support & Contact

For issues or questions:
- Check existing issues on GitHub
- Review [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md) for deployment help
- Contact project maintainers

---

**Last Updated:** [Current Date]  
**Status:** Ready for deployment
