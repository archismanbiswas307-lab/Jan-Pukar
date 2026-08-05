"""
JanPukar backend API.

NOTE: Telegram ingestion is spawned as a managed subprocess (`bot.py`) during
FastAPI application startup.
"""

from fastapi import FastAPI
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
import os
import subprocess
import sys
import threading
import logging
import asyncio

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("janpukar.main")

# Load Environment Variables
project_root = Path(__file__).resolve().parent
frontend_env = project_root.parent / "frontend" / ".env.local"

load_dotenv(dotenv_path=project_root / ".env")
if frontend_env.exists():
    load_dotenv(dotenv_path=frontend_env, override=True)


def normalize_env_value(value: str | None) -> str | None:
    if not value:
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

frontend_url = normalize_env_value(
    os.getenv("FRONTEND_URL") or os.getenv("NEXT_PUBLIC_FRONTEND_URL") or os.getenv("NEXT_PUBLIC_VERCEL_URL")
)

if not supabase_url or not supabase_key:
    raise ValueError(
        "Missing Supabase credentials. Ensure SUPABASE_URL and "
        "SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) are set."
    )

supabase: Client = create_client(supabase_url, supabase_key)

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
        logger.warning(f"Could not resolve cluster_id from 'clusters' table: {exc}")

    try:
        grief = supabase.table("grievances").select("cluster_id").limit(1).single().execute()
        grief_data = getattr(grief, "data", None)
        if isinstance(grief_data, dict) and grief_data.get("cluster_id"):
            _cluster_id_cache = grief_data["cluster_id"]
            return _cluster_id_cache
    except Exception as exc:
        logger.warning(f"Could not resolve cluster_id from 'grievances' table: {exc}")

    return None


# ---------------------------------------------------------------------------
# Bot Subprocess Lifespan Manager
# ---------------------------------------------------------------------------
def _stream_output(pipe, log_func):
    """Safely stream process logs line-by-line without blocking or memory buffer leaks."""
    try:
        with pipe:
            for line in iter(pipe.readline, ''):
                if line:
                    log_func(f"[bot.py] {line.strip()}")
    except Exception as e:
        logger.error(f"Error reading bot process output: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager replacing deprecated @app.on_event startup/shutdown."""
    bot_path = project_root / "bot.py"
    app.state.bot_process = None

    if bot_path.exists():
        python_exe = sys.executable or "python"
        # Force unbuffered python output (-u) so logs print in real-time
        cmd = [python_exe, "-u", str(bot_path)]
        env = os.environ.copy()

        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(project_root),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=env,
                text=True,
                bufsize=1
            )
            app.state.bot_process = proc

            # Dedicated thread to consume stdout and prevent OS pipe buffer deadlocks
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
        logger.warning(f"⚠️ bot.py not found at {bot_path}; skipping bot execution.")

    yield  # Application serves requests here

    # Shutdown sequence
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
    allow_methods=["GET"],
    allow_headers=["*"],
)


# Endpoints
@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/ready")
async def readiness():
    cluster_id = resolve_cluster_id()
    return {
        "status": "ok" if cluster_id else "degraded",
        "cluster_id": cluster_id,
    }


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