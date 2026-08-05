import os
import sys
import logging
import asyncio
from datetime import datetime, timezone
from pathlib import Path

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
    """Sanitize strings, strip quotes, spaces, and trailing slashes to prevent DNS errors."""
    if not val:
        return ""
    val = val.strip()
    if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
        val = val[1:-1].strip()
    return val.rstrip("/")

BASE_DIR = Path(__file__).resolve().parent
for env_path in [BASE_DIR / ".env", BASE_DIR.parent / ".env"]:
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)

TELEGRAM_BOT_TOKEN = normalize_env_value(os.getenv("TELEGRAM_BOT_TOKEN"))
SUPABASE_URL = normalize_env_value(
    os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
)
SUPABASE_KEY = normalize_env_value(
    os.getenv("SUPABASE_SERVICE_ROLE_KEY") 
    or os.getenv("SUPABASE_KEY") 
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)
WEBHOOK_ALERT_URL = normalize_env_value(os.getenv("WEBHOOK_ALERT_URL"))

if not TELEGRAM_BOT_TOKEN or not SUPABASE_URL or not SUPABASE_KEY:
    logger.critical("Missing required environment variables (TELEGRAM_BOT_TOKEN / SUPABASE_URL / SUPABASE_KEY). Exiting.")
    sys.exit(1)

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# State Store: { chat_id: {"text": str, "image_url": str, "timestamp": datetime} }
pending_complaints = {}

# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
def validate_coordinates(lat, lon):
    try:
        lat_f, lon_f = float(lat), float(lon)
        if -90.0 <= lat_f <= 90.0 and -180.0 <= lon_f <= 180.0:
            return lat_f, lon_f
    except (ValueError, TypeError):
        pass
    return None, None

async def dispatch_webhook_alert(payload: dict):
    if not WEBHOOK_ALERT_URL:
        return
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(WEBHOOK_ALERT_URL, json=payload, timeout=5) as resp:
                logger.info(f"Webhook alert dispatched, status: {resp.status}")
    except Exception as e:
        logger.error(f"Failed to dispatch webhook alert: {e}")

# ---------------------------------------------------------------------------
# Telegram Event Handlers
# ---------------------------------------------------------------------------
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    welcome_text = (
        "Welcome to JanPukar Civic Reporting Bot.\n\n"
        "Please describe your grievance or upload a photo with a caption to get started."
    )
    await update.message.reply_text(welcome_text)

async def handle_text_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    text = update.message.text.strip()

    if chat_id not in pending_complaints:
        pending_complaints[chat_id] = {
            "text": text,
            "image_url": None,
            "timestamp": datetime.now(timezone.utc)
        }
    else:
        pending_complaints[chat_id]["text"] = text

    location_keyboard = ReplyKeyboardMarkup(
        [[KeyboardButton("📍 Share Current Location", request_location=True)]],
        one_time_keyboard=True,
        resize_keyboard=True
    )

    await update.message.reply_text(
        "Grievance text recorded. Now, please share the location of the incident using the button below.",
        reply_markup=location_keyboard
    )

async def handle_photo_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    photo = update.message.photo[-1]  # Get highest resolution image
    caption = update.message.caption or ""

    try:
        photo_file = await photo.get_file()
        photo_bytes = await photo_file.download_as_bytearray()
        file_name = f"grievance_{chat_id}_{int(datetime.now(timezone.utc).timestamp())}.jpg"

        # Safe upload to Supabase Storage Bucket
        try:
            supabase.storage.from_("grievance-images").upload(
                path=file_name,
                file=bytes(photo_bytes),
                file_options={"content-type": "image/jpeg"}
            )
            image_url = f"{SUPABASE_URL}/storage/v1/object/public/grievance-images/{file_name}"
        except Exception as storage_err:
            logger.warning(f"Supabase storage upload skipped/failed: {storage_err}")
            image_url = None

        if chat_id not in pending_complaints:
            pending_complaints[chat_id] = {
                "text": caption if caption else "Photo Report",
                "image_url": image_url,
                "timestamp": datetime.now(timezone.utc)
            }
        else:
            pending_complaints[chat_id]["image_url"] = image_url
            if caption:
                pending_complaints[chat_id]["text"] = caption

        location_keyboard = ReplyKeyboardMarkup(
            [[KeyboardButton("📍 Share Current Location", request_location=True)]],
            one_time_keyboard=True,
            resize_keyboard=True
        )

        await update.message.reply_text(
            "Photo received! Now, please share the location of the incident using the button below.",
            reply_markup=location_keyboard
        )

    except Exception as e:
        logger.error(f"Error handling photo upload: {e}", exc_info=True)
        await update.message.reply_text("Could not process photo. Please send a text description instead.")

async def handle_location_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    location = update.message.location

    if chat_id not in pending_complaints:
        await update.message.reply_text("Please send a description or photo of your complaint first.")
        return

    lat, lon = validate_coordinates(location.latitude, location.longitude)
    if lat is None or lon is None:
        await update.message.reply_text("Invalid coordinates received. Please try sharing location again.")
        return

    complaint_data = pending_complaints.pop(chat_id)
    description = complaint_data.get("text", "Report")
    image_url = complaint_data.get("image_url")

    payload = {
        "chat_id": str(chat_id),
        "description": description,
        "latitude": lat,
        "longitude": lon,
        "status": "PENDING"
    }

    if image_url:
        payload["image_url"] = image_url

    try:
        import httpx
        
        # We route through our own API to get AI categorization, score, and deduplication applied
        api_url = os.getenv("API_URL", "http://127.0.0.1:8000")
        
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{api_url}/grievances",
                json={
                    "title": "Telegram Image Report" if image_url else "Telegram Report",
                    "description": description,
                    "latitude": lat,
                    "longitude": lon,
                    "image_url": image_url,
                    "chat_id": str(chat_id)
                },
                timeout=15.0
            )
            resp.raise_for_status()
            data = resp.json()
            
        grievance_id = data.get("tracking_id", "Submitted")
        
        if data.get("status") == "duplicate_merged":
            await update.message.reply_text(
                f"✅ {data.get('message', 'Similar report exists and has been merged.')}\nTracking ID: {grievance_id}"
            )
        else:
            await update.message.reply_text(
                f"✅ Grievance submitted successfully!\nTracking ID: {grievance_id}"
            )

        asyncio.create_task(dispatch_webhook_alert({
            "event": "NEW_GRIEVANCE",
            "grievance_id": grievance_id,
            "chat_id": chat_id,
            "description": description,
            "latitude": lat,
            "longitude": lon,
            "image_url": image_url
        }))

    except Exception as e:
        logger.error(f"Error persisting grievance via API: {e}", exc_info=True)
        await update.message.reply_text(f"An error occurred while saving your report: {str(e)[:100]}")

# ---------------------------------------------------------------------------
# Initialization & Startup
# ---------------------------------------------------------------------------
async def post_init(application: Application):
    await application.bot.delete_webhook(drop_pending_updates=True)
    logger.info("Webhook purged. Clean long-polling active.")

def main():
    application = (
        Application.builder()
        .token(TELEGRAM_BOT_TOKEN)
        .post_init(post_init)
        .build()
    )

    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text_message))
    application.add_handler(MessageHandler(filters.PHOTO, handle_photo_message))
    application.add_handler(MessageHandler(filters.LOCATION, handle_location_message))

    logger.info("Starting Telegram Bot Runner...")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()