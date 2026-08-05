#!/bin/bash
# Deployment Configuration Checklist
# Complete this checklist before and during Render deployment

echo "📋 JanPukar Deployment Configuration Checklist"
echo "=============================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Initialize checklist
TOTAL_ITEMS=0
COMPLETED_ITEMS=0

check_item() {
    local description=$1
    local completed=${2:-false}
    
    ((TOTAL_ITEMS++))
    
    if [ "$completed" = true ]; then
        echo -e "${GREEN}✅${NC} $description"
        ((COMPLETED_ITEMS++))
    else
        echo -e "${RED}❌${NC} $description"
    fi
}

echo "## Pre-Deployment (Local)"
echo ""

check_item "Git repository initialized" $([ -d ".git" ] && echo true || echo false)
check_item "frontend/package.json exists" $([ -f "frontend/package.json" ] && echo true || echo false)
check_item "backend/requirements.txt exists" $([ -f "backend/requirements.txt" ] && echo true || echo false)
check_item "backend/runtime.txt exists (Python 3.13.12)" $([ -f "backend/runtime.txt" ] && echo true || echo false)
check_item ".env files not tracked in git" $(! git ls-files | grep -q "\.env" && echo true || echo false)
check_item "node_modules not tracked (use .gitignore)" $(! git ls-files | grep -q "^node_modules/" && echo true || echo false)
check_item "__pycache__ not tracked (use .gitignore)" $(! git ls-files | grep -q "^__pycache__/" && echo true || echo false)

echo ""
echo "## Supabase Setup"
echo ""

# These require manual checking
echo -e "${YELLOW}⚠️${NC}  You need to verify the following manually:"
echo "  - Navigate to https://supabase.com/dashboard"
echo "  - Select your project"
echo "  - Verify database tables exist:"
echo "    • grievances (id, title, description, latitude, longitude, status, created_at)"
echo "    • profiles (id, email, telegram_chat_id)"
echo "    • clusters (id, count, center_lat, center_lon)"
echo "  - Verify storage bucket exists: grievance-images (public)"
echo "  - Get your API credentials:"
echo ""

read -p "Press Enter to continue..." -t 30

echo ""
echo "## GitHub/GitLab Configuration"
echo ""

check_item "Repository pushed to GitHub/GitLab" $(grep -q "github.com\|gitlab.com" <(git remote -v 2>/dev/null) && echo true || echo false)
check_item "Main/master branch is up to date" true  # Requires manual check

echo ""
echo "## Render Account Setup"
echo ""

echo -e "${YELLOW}⚠️${NC}  Create Render account if you don't have one:"
echo "  - Go to https://render.com"
echo "  - Sign up with GitHub/GitLab"
echo "  - Connect your repository"
echo ""

read -p "Press Enter after creating Render account..." -t 30

echo ""
echo "## Service 1: Frontend Web Service"
echo ""

echo -e "${YELLOW}📝 Configuration for Frontend:${NC}"
echo "  - Name: janpukar-frontend"
echo "  - Repository: your-github-repo"
echo "  - Runtime: Node"
echo "  - Root Directory: frontend"
echo "  - Build Command: npm install && npm run build"
echo "  - Start Command: npm run start"
echo "  - Environment: Production"
echo ""

echo -e "${YELLOW}🔐 Environment Variables (Frontend):${NC}"
echo "  NEXT_PUBLIC_SUPABASE_URL = https://your-project.supabase.co"
echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY = (from Supabase dashboard)"
echo "  NEXT_PUBLIC_SUPABASE_CLUSTER_ID = (from your database)"
echo ""

read -p "Press Enter after creating frontend service..." -t 30

echo ""
echo "## Service 2: Backend Web Service"
echo ""

echo -e "${YELLOW}📝 Configuration for Backend:${NC}"
echo "  - Name: janpukar-backend"
echo "  - Repository: your-github-repo"
echo "  - Runtime: Python 3"
echo "  - Root Directory: backend"
echo "  - Build Command: pip install -r requirements.txt"
echo "  - Start Command: uvicorn main:app --host 0.0.0.0 --port \$PORT"
echo "  - Environment: Production"
echo ""

echo -e "${YELLOW}🔐 Environment Variables (Backend):${NC}"
echo "  SUPABASE_URL = https://your-project.supabase.co"
echo "  SUPABASE_SERVICE_ROLE_KEY = (from Supabase dashboard - SECRET)"
echo "  SUPABASE_CLUSTER_ID = (from your database)"
echo "  CORS_ALLOWED_ORIGINS = https://janpukar-frontend.onrender.com"
echo ""

read -p "Press Enter after creating backend service..." -t 30

echo ""
echo "## Service 3: Telegram Bot Worker"
echo ""

echo -e "${YELLOW}📝 Configuration for Telegram Bot:${NC}"
echo "  - Name: janpukar-telegram-bot"
echo "  - Repository: your-github-repo"
echo "  - Runtime: Python 3"
echo "  - Root Directory: backend"
echo "  - Build Command: pip install -r requirements.txt"
echo "  - Start Command: python bot.py"
echo "  - Environment: Production"
echo ""

echo -e "${YELLOW}🔐 Environment Variables (Bot):${NC}"
echo "  SUPABASE_URL = (same as backend)"
echo "  SUPABASE_SERVICE_ROLE_KEY = (same as backend - SECRET)"
echo "  SUPABASE_CLUSTER_ID = (same as backend)"
echo "  TELEGRAM_BOT_TOKEN = (from @BotFather on Telegram)"
echo "  ADMIN_TELEGRAM_CHAT_IDS = (your admin chat IDs, comma-separated)"
echo "  ADMIN_WEBHOOK_URLS = (optional, for alerts)"
echo "  SMTP_HOST = (optional, for email alerts)"
echo "  SMTP_PORT = (optional)"
echo "  SMTP_USER = (optional)"
echo "  SMTP_PASS = (optional)"
echo "  EMAIL_FROM = (optional)"
echo ""

read -p "Press Enter after creating bot worker..." -t 30

echo ""
echo "## Post-Deployment Verification"
echo ""

echo -e "${YELLOW}🧪 Test each service:${NC}"
echo ""
echo "1. Frontend:"
echo "   - Visit https://janpukar-frontend.onrender.com"
echo "   - Should load login page"
echo "   - Check browser console for errors"
echo ""

echo "2. Backend API:"
echo "   - Visit https://janpukar-backend.onrender.com/health"
echo "   - Should return: {\"status\":\"ok\"}"
echo "   - Visit https://janpukar-backend.onrender.com/health/ready"
echo "   - Should return status with cluster info"
echo ""

echo "3. Telegram Bot:"
echo "   - Check Render background worker logs"
echo "   - Look for message: 'Using Supabase URL:...'"
echo "   - Send test message to bot: /start or location"
echo "   - Bot should respond"
echo ""

read -p "Press Enter after testing all services..." -t 30

echo ""
echo "## Troubleshooting"
echo ""

echo -e "${RED}If frontend doesn't load:${NC}"
echo "  1. Check Render dashboard logs for build errors"
echo "  2. Verify NEXT_PUBLIC_SUPABASE_* variables are set"
echo "  3. Ensure npm build passed locally: cd frontend && npm run build"
echo "  4. Check that frontend/app/page.js exists"
echo ""

echo -e "${RED}If backend API fails:${NC}"
echo "  1. Check logs: Render dashboard → backend service → Logs"
echo "  2. Verify SUPABASE_SERVICE_ROLE_KEY (not anon key)"
echo "  3. Test locally: python -m venv .venv && pip install -r requirements.txt"
echo "  4. Ensure backend/main.py exists and imports work"
echo "  5. Check /health endpoint returns valid JSON"
echo ""

echo -e "${RED}If bot doesn't respond:${NC}"
echo "  1. Check worker logs for startup errors"
echo "  2. Verify TELEGRAM_BOT_TOKEN is valid"
echo "  3. Ensure bot.py has proper Supabase configuration"
echo "  4. Check 'Polling started' message in logs"
echo "  5. Test locally: python bot.py with .env file"
echo ""

echo ""
echo "## Maintenance Checklist"
echo ""

echo -e "${YELLOW}📌 Keep these in mind:${NC}"
echo "  - [ ] Never commit .env files (use .env.example)"
echo "  - [ ] Rotate SUPABASE_SERVICE_ROLE_KEY periodically"
echo "  - [ ] Monitor Telegram bot logs for errors"
echo "  - [ ] Back up Supabase database regularly"
echo "  - [ ] Review and update dependencies monthly"
echo "  - [ ] Monitor Render usage and billing"
echo "  - [ ] Keep Python version compatible (3.13+)"
echo "  - [ ] Test bot locally before major changes"
echo ""

echo ""
echo "=============================================="
echo "✅ Deployment checklist complete!"
echo "Your JanPukar system should now be live on Render."
echo ""
