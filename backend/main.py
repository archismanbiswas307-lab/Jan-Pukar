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
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
import os
import subprocess
import sys
import threading
import logging

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

frontend_url = normalize_env_value(os.getenv("FRONTEND_URL") or os.getenv("NEXT_PUBLIC_FRONTEND_URL") or os.getenv("NEXT_PUBLIC_VERCEL_URL"))

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


@app.get("/")
async def root():
    """Root handler: redirect to frontend if `FRONTEND_URL` is set, otherwise
    return a minimal JSON status to confirm the API is live and indicate
    whether the bot subprocess has been spawned.
    """
    # Redirect to frontend if configured
    if frontend_url:
        return RedirectResponse(frontend_url)

    bot_proc = getattr(app.state, "bot_process", None)
    bot_pid = getattr(bot_proc, "pid", None) if bot_proc else None
    return JSONResponse({"service": "JanPukar API", "status": "running", "bot_pid": bot_pid})


# ---------------------------------------------------------------------------
# Bot process management: spawn bot.py on startup and terminate on shutdown
# ---------------------------------------------------------------------------
logger = logging.getLogger("janpukar.main")


@app.on_event("startup")
async def _startup_start_bot():
    """Spawn backend/bot.py as a child process so the Telegram bot runs
    alongside the FastAPI app. The child process' stdout will be streamed
    into the main app logger for visibility.
    """
    bot_path = project_root / "bot.py"
    if not bot_path.exists():
        logger.warning("bot.py not found; skipping bot auto-start")
        return

    python_exe = sys.executable or "python"
    env = os.environ.copy()

    try:
        proc = subprocess.Popen(
            [python_exe, str(bot_path)],
            cwd=str(project_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=env,
            text=True,
            bufsize=1,
        )
        app.state.bot_process = proc

        def _stream_proc_output(p):
            try:
                for line in p.stdout:
                    if line is None:
                        continue
                    logger.info("[bot] %s", line.rstrip())
            except Exception as e:
                logger.exception("Error streaming bot output: %s", e)

        t = threading.Thread(target=_stream_proc_output, args=(proc,), daemon=True)
        t.start()
        logger.info("Spawned bot.py (pid=%s)", getattr(proc, "pid", "?"))
    except Exception as exc:
        logger.exception("Failed to start bot.py as subprocess: %s", exc)


@app.on_event("shutdown")
async def _shutdown_stop_bot():
    """Attempt to gracefully stop the child bot process on application shutdown."""
    proc = getattr(app.state, "bot_process", None)
    if not proc:
        return

    try:
        logger.info("Terminating bot process (pid=%s)", getattr(proc, "pid", "?"))
        proc.terminate()
        try:
            proc.wait(timeout=5)
            logger.info("Bot process exited cleanly")
        except Exception:
            logger.warning("Bot process did not exit in time; killing")
            proc.kill()
    except Exception as exc:
        logger.exception("Error stopping bot process: %s", exc)