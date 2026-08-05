from fastapi import FastAPI, Request
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
    os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY")
)
supabase_cluster_id = normalize_env_value(
    os.getenv("SUPABASE_CLUSTER_ID") or os.getenv("NEXT_PUBLIC_SUPABASE_CLUSTER_ID") or os.getenv("DEFAULT_CLUSTER_ID")
)

if not supabase_url or not supabase_key:
    raise ValueError(
        "Missing Supabase credentials. Ensure SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY are set."
    )

app = FastAPI()
supabase: Client = create_client(supabase_url, supabase_key)


def resolve_cluster_id():
    if supabase_cluster_id:
        return supabase_cluster_id

    try:
        result = supabase.table("clusters").select("id").limit(1).single().execute()
        data = getattr(result, "data", None)
        if isinstance(data, dict) and data.get("id"):
            return data["id"]
    except Exception:
        pass

    grief = supabase.table("grievances").select("cluster_id").limit(1).single().execute()
    grief_data = getattr(grief, "data", None)
    if isinstance(grief_data, dict) and grief_data.get("cluster_id"):
        return grief_data["cluster_id"]

    raise RuntimeError(
        "Could not resolve a default cluster_id. Set SUPABASE_CLUSTER_ID or add a clusters table."
    )

CLUSTER_ID = resolve_cluster_id()
print(f"Using Supabase cluster_id: {CLUSTER_ID}")

@app.post("/api/telegram")
async def telegram_webhook(request: Request):
    data = await request.json()
    message = data.get("message", {})
    
    if not message:
        return {"status": "ignored"}

    text = message.get("text") or message.get("caption") or (message.get("venue") or {}).get("title") or "Telegram Complaint"
    location = message.get("location") or (message.get("venue") or {}).get("location")
    if not isinstance(location, dict):
        return {"status": "missing_location", "detail": "Location is required for complaints."}

    lat = location.get("latitude")
    if lat is None:
        lat = location.get("lat")
    if lat is None:
        return {"status": "missing_location", "detail": "Location is required for complaints."}

    lng = location.get("longitude")
    if lng is None:
        lng = location.get("lng")
    if lng is None:
        return {"status": "missing_location", "detail": "Location is required for complaints."}

    response = supabase.table("grievances").insert({
        "user_id": f"telegram_{message.get('from', {}).get('id')}",
        "title": "Telegram Grievance",
        "description": text,
        "category": "General",
        "latitude": float(lat),
        "longitude": float(lng),
        "urgency_score": 3,
        "cluster_id": CLUSTER_ID,
    }).execute()

    response_error = getattr(response, "error", None)
    if response_error:
        return {"status": "error", "detail": response_error}


    return {"status": "success"}