"""
JanPukar backend API.

NOTE: Telegram ingestion is handled exclusively by backend/bot.py (long polling).
This app intentionally does NOT expose a Telegram webhook — running a webhook
here at the same time as bot.py's polling loop would cause Telegram 409
Conflict errors and duplicate grievance rows. If you need a webhook instead of
polling in production, switch bot.py to webhook mode and do not run this
alongside it.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
import os

project_root = Path(__file__).resolve().parent
frontend_env = project_root.parent / "frontend" / ".env.local"
load_dotenv()
if frontend_env.exists():
    load_dotenv(dotenv_path=str(frontend_env), override=True)


def normalize_env_value(value):
    if value is None:
        return None
    normalized = value.strip()
    if len(normalized) >= 2 and ((normalized[0] == normalized[-1] == '"') or (normalized[0] == normalized[-1] == "'")):
        normalized = normalized[1:-1].strip()
    return normalized.rstrip("/")


supabase_url = normalize_env_value(
    os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
)
supabase_key = normalize_env_value(
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or os.getenv("SUPABASE_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
)
supabase_cluster_id = normalize_env_value(
    os.getenv("SUPABASE_CLUSTER_ID") or os.getenv("NEXT_PUBLIC_SUPABASE_CLUSTER_ID") or os.getenv("DEFAULT_CLUSTER_ID")
)

if not supabase_url or not supabase_key:
    raise ValueError(
        "Missing Supabase credentials. Ensure SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and "
        "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY) are set."
    )

app = FastAPI(title="JanPukar API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in (normalize_env_value(os.getenv("CORS_ALLOWED_ORIGINS")) or "").split(",") if o] or ["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

supabase: Client = create_client(supabase_url, supabase_key)

# Cluster id is resolved lazily and cached — a Supabase hiccup at boot must
# never prevent the API from starting.
_cluster_id_cache: str | None = None


def resolve_cluster_id() -> str | None:
    global _cluster_id_cache
    if _cluster_id_cache:
        return _cluster_id_cache
    if supabase_cluster_id:
        _cluster_id_cache = supabase_cluster_id
        return _cluster_id_cache

    try:
        result = supabase.table("clusters").select("id").limit(1).execute()
        data = getattr(result, "data", None)
        if isinstance(data, list) and data and isinstance(data[0], dict) and data[0].get("id"):
            _cluster_id_cache = data[0]["id"]
            return _cluster_id_cache
    except Exception as exc:
        print(f"⚠️ Could not resolve cluster_id from 'clusters' table: {exc}")

    try:
        grief = supabase.table("grievances").select("cluster_id").limit(1).single().execute()
        grief_data = getattr(grief, "data", None)
        if isinstance(grief_data, dict) and grief_data.get("cluster_id"):
            _cluster_id_cache = grief_data["cluster_id"]
            return _cluster_id_cache
    except Exception as exc:
        print(f"⚠️ Could not resolve cluster_id from 'grievances' table: {exc}")

    return None


@app.get("/health")
async def health():
    """Lightweight liveness check — does not touch Supabase, so it can never
    false-negative just because the database is briefly unreachable."""
    return {"status": "ok"}


@app.get("/health/ready")
async def readiness():
    """Readiness check that confirms Supabase + cluster resolution are working."""
    cluster_id = resolve_cluster_id()
    return {
        "status": "ok" if cluster_id else "degraded",
        "cluster_id": cluster_id,
    }