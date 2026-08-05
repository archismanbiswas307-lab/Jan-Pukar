"""
JanPukar backend API.

Provides REST endpoints for grievance CRUD, AI triage (auto-categorization,
urgency scoring, spatial deduplication), and manages the Telegram bot as a
subprocess during startup.
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
from pydantic import BaseModel, Field
from typing import Optional
import os
import subprocess
import sys
import threading
import logging
import asyncio
import httpx
import math
import re
import uuid

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("janpukar.main")

# Resolve absolute paths regardless of current working directory
backend_dir = Path(__file__).resolve().parent
frontend_env = backend_dir.parent / "frontend" / ".env.local"

load_dotenv(dotenv_path=backend_dir / ".env")
if frontend_env.exists():
    load_dotenv(dotenv_path=frontend_env, override=True)


def normalize_env_value(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip()
    if len(normalized) >= 2 and ((normalized[0] == normalized[-1] == '"') or (normalized[0] == normalized[-1] == "'")):
        normalized = normalized[1:-1].strip()
    return normalized.rstrip("/")


raw_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or ""
supabase_url = normalize_env_value(raw_url)
if supabase_url and not supabase_url.startswith("http"):
    supabase_url = "https://" + supabase_url

supabase_key = normalize_env_value(
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
)

frontend_url = normalize_env_value(
    os.getenv("FRONTEND_URL") or os.getenv("NEXT_PUBLIC_FRONTEND_URL") or os.getenv("NEXT_PUBLIC_VERCEL_URL")
)

if not supabase_url or not supabase_key:
    raise ValueError(
        "Missing Supabase credentials. Ensure SUPABASE_URL and "
        "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) are set."
    )

supabase: Client = create_client(supabase_url, supabase_key)

# ---------------------------------------------------------------------------
# AI Triage Engine
# ---------------------------------------------------------------------------

# Category keywords for auto-classification
CATEGORY_KEYWORDS = {
    "Roads & Traffic": [
        "road", "pothole", "crack", "pavement", "traffic", "signal", "highway",
        "lane", "divider", "speed", "bump", "asphalt", "tar", "bridge",
        "overpass", "flyover", "footpath", "sidewalk", "crossing", "zebra",
    ],
    "Sanitation": [
        "garbage", "trash", "waste", "dump", "litter", "bin", "sweeping",
        "sanitation", "dirty", "filth", "smell", "odor", "stench", "debris",
        "compost", "recycle", "rubbish", "sewage overflow",
    ],
    "Water & Sewage": [
        "water", "pipe", "leak", "sewage", "drain", "flood", "clog",
        "manhole", "gutter", "overflow", "supply", "tank", "bore",
        "contaminated", "dirty water", "plumbing",
    ],
    "Electricity": [
        "electric", "wire", "power", "blackout", "outage", "transformer",
        "pole", "cable", "voltage", "spark", "short circuit", "street light",
        "lamp", "bulb", "meter", "current", "exposed wire",
    ],
    "Public Safety": [
        "danger", "hazard", "unsafe", "collapse", "fire", "accident",
        "crime", "theft", "violence", "stray", "dog", "animal", "snake",
        "emergency", "risk", "security", "broken wall", "falling",
    ],
}

# Urgency hazard keywords with severity weights
URGENCY_KEYWORDS = {
    5: [
        "exposed wire", "electrocution", "fire", "collapse", "explosion",
        "gas leak", "emergency", "danger to life", "child trapped",
        "building collapse", "flood", "electr",
    ],
    4: [
        "open manhole", "sewage overflow", "major crack", "road cave",
        "broken bridge", "stray dog attack", "violent", "accident",
        "short circuit", "transformer", "blackout",
    ],
    3: [
        "pothole", "water leak", "garbage pile", "broken pipe",
        "street light out", "fallen tree", "blocked drain",
    ],
    2: [
        "dirty", "smell", "noise", "crack", "minor", "faded",
        "broken bench", "graffiti", "overgrown",
    ],
    1: [
        "suggestion", "feedback", "request", "improvement", "cosmetic",
        "paint", "sign", "marking",
    ],
}


def auto_categorize(text: str) -> str:
    """Classify text into the best matching category using keyword density."""
    if not text:
        return "General"
    text_lower = text.lower()
    scores = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > 0:
            scores[category] = score
    if not scores:
        return "General"
    return max(scores, key=scores.get)


def compute_urgency_score(text: str) -> int:
    """Compute urgency from 1-5 based on hazard keyword matching."""
    if not text:
        return 1
    text_lower = text.lower()
    max_urgency = 1
    for level in sorted(URGENCY_KEYWORDS.keys(), reverse=True):
        for kw in URGENCY_KEYWORDS[level]:
            if kw in text_lower:
                max_urgency = max(max_urgency, level)
                if max_urgency == 5:
                    return 5
    return max_urgency


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute distance between two lat/lon points in meters."""
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def text_similarity(a: str, b: str) -> float:
    """Simple token overlap similarity ratio (Jaccard-like)."""
    if not a or not b:
        return 0.0
    tokens_a = set(re.findall(r'\w+', a.lower()))
    tokens_b = set(re.findall(r'\w+', b.lower()))
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b
    return len(intersection) / len(union)


def generate_tracking_id() -> str:
    """Generate a short tracking ID like G-1024."""
    short = uuid.uuid4().int % 100000
    return f"G-{short}"


async def find_duplicate(lat: float | None, lon: float | None, description: str) -> dict | None:
    """Check for existing nearby active grievances with similar text."""
    try:
        result = supabase.table("grievances").select("*").in_(
            "status", ["Pending", "PENDING", "In Progress", "IN_PROGRESS"]
        ).execute()
        candidates = getattr(result, "data", None) or []
    except Exception as e:
        logger.warning(f"Deduplication query failed: {e}")
        return None

    best_match = None
    best_score = 0.0

    for c in candidates:
        # Spatial check: must be within 500m
        c_lat = c.get("latitude")
        c_lon = c.get("longitude")
        if lat is not None and lon is not None and c_lat is not None and c_lon is not None:
            try:
                dist = haversine_distance(lat, lon, float(c_lat), float(c_lon))
                if dist > 500:
                    continue
            except (ValueError, TypeError):
                continue
        elif lat is not None or c_lat is not None:
            continue  # One has location, other doesn't — skip

        # Text similarity check
        c_desc = c.get("description", "")
        sim = text_similarity(description, c_desc)
        if sim >= 0.6 and sim > best_score:
            best_score = sim
            best_match = c

    return best_match


# ---------------------------------------------------------------------------
# Pydantic Models
# ---------------------------------------------------------------------------
class GrievanceCreate(BaseModel):
    title: Optional[str] = "Citizen Report"
    description: str = ""
    category: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    image_url: Optional[str] = None
    urgency_score: Optional[int] = None
    user_id: Optional[str] = None
    chat_id: Optional[str] = None


class GrievanceUpdate(BaseModel):
    status: Optional[str] = None
    category: Optional[str] = None
    urgency_score: Optional[int] = None
    assigned_team: Optional[str] = None
    is_duplicate: Optional[bool] = None
    duplicate_of: Optional[int] = None


# ---------------------------------------------------------------------------
# Bot Subprocess & Keep-Alive Lifespan Manager
# ---------------------------------------------------------------------------
def _stream_output(pipe, log_func):
    """Safely stream process logs line-by-line."""
    try:
        with pipe:
            for line in iter(pipe.readline, ''):
                if line:
                    log_func(f"[bot.py] {line.strip()}")
    except Exception as e:
        logger.error(f"Error reading bot process output: {e}")


async def _keep_alive_ping(app_url: str):
    """Background task to ping self health endpoint every 4 minutes."""
    await asyncio.sleep(15)
    async with httpx.AsyncClient() as client:
        while True:
            try:
                resp = await client.get(f"{app_url}/health", timeout=10)
                logger.info(f"Self-ping status: {resp.status_code}")
            except Exception as e:
                logger.warning(f"Self-ping failed: {e}")
            await asyncio.sleep(240)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for bot subprocess and keep-alive."""
    bot_path = backend_dir / "bot.py"
    app.state.bot_process = None

    if bot_path.exists():
        python_exe = sys.executable or "python"
        cmd = [python_exe, "-u", str(bot_path)]
        env = os.environ.copy()
        env["PYTHONPATH"] = str(backend_dir)

        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(backend_dir),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=env,
                text=True,
                bufsize=1
            )
            app.state.bot_process = proc

            out_thread = threading.Thread(
                target=_stream_output,
                args=(proc.stdout, logger.info),
                daemon=True
            )
            out_thread.start()
            logger.info(f"✅ Spawned bot.py successfully (PID: {proc.pid})")
        except Exception as exc:
            logger.exception(f"❌ Failed to start bot.py subprocess: {exc}")
    else:
        logger.error(f"❌ bot.py not found at path: {bot_path}; skipping bot execution.")

    render_url = normalize_env_value(os.getenv("RENDER_EXTERNAL_URL"))
    ping_task = None
    if render_url:
        ping_task = asyncio.create_task(_keep_alive_ping(render_url))

    yield

    if ping_task:
        ping_task.cancel()

    proc = getattr(app.state, "bot_process", None)
    if proc and proc.poll() is None:
        logger.info(f"Terminating bot process (PID: {proc.pid})...")
        proc.terminate()
        try:
            await asyncio.to_thread(proc.wait, timeout=5)
            logger.info("Bot process terminated cleanly.")
        except subprocess.TimeoutExpired:
            logger.warning("Bot process unresponsive; sending SIGKILL...")
            proc.kill()


# Initialize App with Lifespan
app = FastAPI(title="JanPukar API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in (normalize_env_value(os.getenv("CORS_ALLOWED_ORIGINS")) or "").split(",") if o] or ["*"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root():
    if frontend_url:
        return RedirectResponse(frontend_url)

    bot_proc = getattr(app.state, "bot_process", None)
    bot_alive = (bot_proc.poll() is None) if bot_proc else False
    bot_pid = bot_proc.pid if bot_proc else None

    return JSONResponse({
        "service": "JanPukar API",
        "status": "running",
        "bot_running": bot_alive,
        "bot_pid": bot_pid
    })


# --- Grievance CRUD ---

@app.post("/grievances")
async def create_grievance(body: GrievanceCreate):
    """Create a new grievance with AI triage (categorization, urgency, dedup)."""
    description = body.description or ""
    title = body.title or "Citizen Report"

    # AI auto-categorization
    category = body.category
    if not category or category == "General":
        category = auto_categorize(f"{title} {description}")

    # AI urgency scoring
    urgency = body.urgency_score
    if urgency is None:
        urgency = compute_urgency_score(f"{title} {description}")

    # Deduplication check
    duplicate = await find_duplicate(body.latitude, body.longitude, description)
    if duplicate:
        # Increment report_count on existing instead of creating new
        existing_id = duplicate["id"]
        new_count = (duplicate.get("report_count") or 1) + 1
        # Boost urgency if many people report same issue
        boosted_urgency = min(5, (duplicate.get("urgency_score") or 1) + (1 if new_count >= 3 else 0))
        try:
            update_result = supabase.table("grievances").update({
                "report_count": new_count,
                "urgency_score": boosted_urgency,
            }).eq("id", existing_id).select().execute()

            updated = update_result.data[0] if update_result.data else duplicate
            return JSONResponse({
                "status": "duplicate_merged",
                "message": f"Similar report already exists (#{existing_id}). Your report has been merged. Total reports: {new_count}",
                "grievance": updated,
                "tracking_id": updated.get("tracking_id", f"#{existing_id}"),
            })
        except Exception as e:
            logger.warning(f"Failed to merge duplicate: {e}")
            # Fall through to create new if merge fails

    # Generate tracking ID
    tracking_id = generate_tracking_id()

    payload = {
        "title": title,
        "description": description,
        "category": category,
        "urgency_score": urgency,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "image_url": body.image_url,
        "status": "Pending",
        "tracking_id": tracking_id,
        "report_count": 1,
    }

    if body.user_id:
        payload["user_id"] = body.user_id
    if body.chat_id:
        payload["chat_id"] = body.chat_id

    try:
        result = supabase.table("grievances").insert(payload).select().execute()
        inserted = result.data[0] if result.data else {}
        return JSONResponse({
            "status": "created",
            "message": f"Grievance created successfully",
            "grievance": inserted,
            "tracking_id": tracking_id,
        }, status_code=201)
    except Exception as e:
        logger.error(f"Failed to create grievance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/grievances")
async def list_grievances(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    min_urgency: Optional[int] = Query(None),
):
    """List grievances with optional filters."""
    try:
        query = supabase.table("grievances").select("*").order("created_at", desc=True)
        if status:
            query = query.eq("status", status)
        if category:
            query = query.eq("category", category)
        if min_urgency:
            query = query.gte("urgency_score", min_urgency)
        result = query.execute()
        return {"grievances": result.data or [], "count": len(result.data or [])}
    except Exception as e:
        logger.error(f"Failed to list grievances: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/grievances/stats")
async def grievance_stats():
    """Get aggregate stats for the dashboard."""
    try:
        result = supabase.table("grievances").select("*").execute()
        data = result.data or []

        total = len(data)
        pending = sum(1 for g in data if (g.get("status") or "").lower() in ("pending",))
        in_progress = sum(1 for g in data if (g.get("status") or "").lower() in ("in progress", "in_progress"))
        resolved = sum(1 for g in data if (g.get("status") or "").lower() == "resolved")
        high_urgency = sum(1 for g in data if (g.get("urgency_score") or 1) >= 4)

        # Average resolution time
        avg_hours = None
        resolved_items = [g for g in data if g.get("status", "").lower() == "resolved" and g.get("created_at") and g.get("updated_at")]
        if resolved_items:
            from datetime import datetime
            diffs = []
            for r in resolved_items:
                try:
                    created = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
                    updated = datetime.fromisoformat(r["updated_at"].replace("Z", "+00:00"))
                    diffs.append((updated - created).total_seconds() / 3600)
                except Exception:
                    pass
            if diffs:
                avg_hours = round(sum(diffs) / len(diffs), 1)

        return {
            "total": total,
            "pending": pending,
            "in_progress": in_progress,
            "resolved": resolved,
            "high_urgency": high_urgency,
            "avg_resolution_hours": avg_hours,
        }
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/grievances/{grievance_id}")
async def get_grievance(grievance_id: str):
    """Get a single grievance by ID or tracking_id."""
    try:
        result = supabase.table("grievances").select("*").or_(
            f"id.eq.{grievance_id},tracking_id.eq.{grievance_id}"
        ).limit(1).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Grievance not found")
        return {"grievance": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get grievance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/grievances/{grievance_id}")
async def update_grievance(grievance_id: str, body: GrievanceUpdate):
    """Update grievance status, category, urgency, assignment, or duplicate flag."""
    update_data = {}
    if body.status is not None:
        update_data["status"] = body.status
    if body.category is not None:
        update_data["category"] = body.category
    if body.urgency_score is not None:
        update_data["urgency_score"] = body.urgency_score
    if body.assigned_team is not None:
        update_data["assigned_team"] = body.assigned_team
    if body.is_duplicate is not None:
        update_data["is_duplicate"] = body.is_duplicate
    if body.duplicate_of is not None:
        update_data["duplicate_of"] = body.duplicate_of

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    from datetime import datetime, timezone
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        result = supabase.table("grievances").update(update_data).eq(
            "id", grievance_id
        ).select().execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Grievance not found")
        return {"grievance": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update grievance: {e}")
        raise HTTPException(status_code=500, detail=str(e))