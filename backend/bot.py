import os
import sys
import logging
import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
import math

from dotenv import load_dotenv
from telegram import Update, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)
from supabase import create_client, Client
import aiohttp

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment Normalization & Loading
# ---------------------------------------------------------------------------
def normalize_env_value(val: str) -> str:
    if not val:
        return ""
    val = val.strip()
    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
        val = val[1:-1].strip()
    return val

# Cascade through possible .env locations
BASE_DIR = Path(__file__).resolve().parent
for env_path in [BASE_DIR / ".env", BASE_DIR.parent / ".env"]:
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)

TELEGRAM_BOT_TOKEN = normalize_env_value(os.getenv("TELEGRAM_BOT_TOKEN"))
SUPABASE_URL = normalize_env_value(os.getenv("SUPABASE_URL"))
SUPABASE_KEY = normalize_env_value(os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY"))
WEBHOOK_ALERT_URL = normalize_env_value(os.getenv("WEBHOOK_ALERT_URL"))

if not TELEGRAM_BOT_TOKEN or not SUPABASE_URL or not SUPABASE_KEY:
    logger.critical("Missing required environment variables (TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY). Exiting.")
    sys.exit(1)

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ---------------------------------------------------------------------------
# State Management & Helpers
# ---------------------------------------------------------------------------
# Memory-bounded dictionary: { chat_id: {"text": str, "timestamp": datetime} }
PENDING_EXPIRATION_MINUTES = 30
pending_complaints = {}

def parse_telegram_chat_id(chat_id) -> int:
    try:
        return int(chat_id)
    except (ValueError, TypeError):
        return None

def validate_coordinates(lat, lon) -> tuple:
    try:
        lat_f, lon_f = float(lat), float(lon)
        if -90.0 <= lat_f <= 90.0 and -180.0 <= lon_f <= 180.0:
            return lat_f, lon_f
    except (ValueError, TypeError):
        pass
    return None, None

def calculate_haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0 # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# ---------------------------------------------------------------------------
# Background Maintenance Tasks
# ---------------------------------------------------------------------------
async def cleanup_expired_pending_complaints():
    """Background task to remove stale pending complaints and prevent memory leaks."""
    while True:
        try:
            await asyncio.sleep(300) # Run every 5 minutes
            now = datetime.now(timezone.utc)
            expired_keys = [
                chat_id for chat_id, data in pending_complaints.items()
                if now - data["timestamp"] > timedelta(minutes=PENDING_EXPIRATION_MINUTES)
            ]
            for key in expired_keys:
                del pending_complaints[key]
                logger.info(f"Cleaned up expired pending complaint for chat_id: {key}")
        except Exception as e:
            logger.error(f"Error in cleanup task: {e}")

# ---------------------------------------------------------------------------
# Notification Helpers
# ---------------------------------------------------------------------------
async def dispatch_webhook_alert(payload: dict):
    """Non-blocking async HTTP webhook dispatcher."""
    if not WEBHOOK_ALERT_URL:
        return
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(WEBHOOK_ALERT_URL, json=payload, timeout=5) as resp:
                logger.info(f"Webhook alert dispatched. Status: {resp.status}")
    except Exception as e:
        logger.error(f"Failed to dispatch webhook alert: {e}")

# ---------------------------------------------------------------------------
# Telegram Bot Command & Message Handlers
# ---------------------------------------------------------------------------
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    welcome_text = (
        "Welcome to the Civic Grievance Reporting Bot.\n\n"
        "Please describe the issue or complaint you would like to submit."
    )
    await update.message.reply_text(welcome_text)

async def handle_text_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    text = update.message.text.strip()

    pending_complaints[chat_id] = {
        "text": text,
        "timestamp": datetime.now(timezone.utc)
    }

    location_keyboard = ReplyKeyboardMarkup(
        [[KeyboardButton("📍 Share Current Location", request_location=True)]],
        one_time_keyboard=True,
        resize_keyboard=True
    )

    await update.message.reply_text(
        "Grievance text recorded. Now, please share the location of the incident using the button below.",
        reply_markup=location_keyboard
    )

async def handle_location_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    location = update.message.location

    if chat_id not in pending_complaints:
        await update.message.reply_text("Please describe your complaint with a text message first.")
        return

    lat, lon = validate_coordinates(location.latitude, location.longitude)
    if lat is None or lon is None:
        await update.message.reply_text("Invalid coordinates received. Please try sharing location again.")
        return

    complaint_data = pending_complaints.pop(chat_id)
    description = complaint_data["text"]

    try:
        # Check for duplicate report within 1 km threshold using RPC or localized check
        response = supabase.table("grievances").insert({
            "chat_id": str(chat_id),
            "description": description,
            "latitude": lat,
            "longitude": lon,
            "status": "PENDING",
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()

        inserted_record = response.data[0] if response.data else {}
        grievance_id = inserted_record.get("id", "N/A")

        await update.message.reply_text(
            f"✅ Grievance submitted successfully!\nTracking ID: #{grievance_id}"
        )

        # Dispatch non-blocking webhook alert
        asyncio.create_task(dispatch_webhook_alert({
            "event": "NEW_GRIEVANCE",
            "grievance_id": grievance_id,
            "chat_id": chat_id,
            "description": description,
            "latitude": lat,
            "longitude": lon
        }))

    except Exception as e:
        logger.error(f"Error persisting grievance to Supabase: {e}")
        await update.message.reply_text("An error occurred while saving your report. Please try again later.")

# ---------------------------------------------------------------------------
# Application Initialization & Lifecycle
# ---------------------------------------------------------------------------
async def post_init(application: Application):
    """Ensure clean long polling by purging any active webhooks."""
    await application.bot.delete_webhook(drop_pending_updates=True)
    logger.info("Webhook dropped. Starting clean long polling...")
    asyncio.create_task(cleanup_expired_pending_complaints())

def main():
    application = (
        Application.builder()
        .token(TELEGRAM_BOT_TOKEN)
        .post_init(post_init)
        .build()
    )

    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text_message))
    application.add_handler(MessageHandler(filters.LOCATION, handle_location_message))

    logger.info("Starting Telegram Bot Runner...")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()