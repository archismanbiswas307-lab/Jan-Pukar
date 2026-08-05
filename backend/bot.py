import os
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

raw_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or ""
SUPABASE_URL = normalize_env_value(raw_url)
if SUPABASE_URL and not SUPABASE_URL.startswith("http"):
    SUPABASE_URL = "https://" + SUPABASE_URL

SUPABASE_KEY = normalize_env_value(
    os.getenv("SUPABASE_SERVICE_ROLE_KEY") 
    or os.getenv("SUPABASE_KEY") 
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)
WEBHOOK_ALERT_URL = normalize_env_value(os.getenv("WEBHOOK_ALERT_URL"))

supabase: Client | None = None


def missing_settings() -> list[str]:
    """Return the server-side settings required to process Telegram updates."""
    settings = {
        "TELEGRAM_BOT_TOKEN": TELEGRAM_BOT_TOKEN,
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_KEY,
    }
    return [name for name, value in settings.items() if not value]


def require_settings() -> None:
    missing = missing_settings()
    if missing:
        raise RuntimeError(
            "Missing required environment variables: " + ", ".join(missing)
        )


def get_supabase() -> Client:
    """Create the client lazily so FastAPI can run without local bot settings."""
    global supabase
    require_settings()
    if supabase is None:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    return supabase

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
            get_supabase().storage.from_("grievance-images").upload(
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
        # Import the shared AI triage logic directly to avoid HTTP network issues on PaaS deployments
        from main import auto_categorize, compute_urgency_score, find_duplicate, generate_tracking_id
        
        full_text = f"{'Telegram Image Report' if image_url else 'Telegram Report'} {description}"
        category = auto_categorize(full_text)
        urgency = compute_urgency_score(full_text)
        
        # Deduplication check
        duplicate = await find_duplicate(lat, lon, description)
        tracking_id = None
        
        if duplicate:
            existing_id = duplicate["id"]
            new_count = (duplicate.get("report_count") or 1) + 1
            boosted_urgency = min(5, (duplicate.get("urgency_score") or 1) + (1 if new_count >= 3 else 0))
            
            try:
                update_result = get_supabase().table("grievances").update({
                    "report_count": new_count,
                    "urgency_score": boosted_urgency,
                }).eq("id", existing_id).select().execute()
                
                updated = update_result.data[0] if update_result.data else duplicate
                tracking_id = updated.get("tracking_id", f"#{existing_id}")
                
                await update.message.reply_text(
                    f"✅ Similar report already exists and has been merged.\nTracking ID: {tracking_id}"
                )
            except Exception as e:
                logger.warning(f"Failed to merge duplicate: {e}")
                
        # If not duplicate or merge failed, create new
        if not tracking_id:
            tracking_id = generate_tracking_id()
            final_payload = {
                "title": "Telegram Image Report" if image_url else "Telegram Report",
                "description": description,
                "category": category,
                "urgency_score": urgency,
                "latitude": lat,
                "longitude": lon,
                "image_url": image_url,
                "status": "Pending",
                "tracking_id": tracking_id,
                "report_count": 1,
                "chat_id": str(chat_id)
            }
            
            result = get_supabase().table("grievances").insert(final_payload).select().execute()
            
            await update.message.reply_text(
                f"✅ Grievance submitted successfully!\nTracking ID: {tracking_id}"
            )

        asyncio.create_task(dispatch_webhook_alert({
            "event": "NEW_GRIEVANCE",
            "grievance_id": tracking_id,
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
async def prepare_polling(application: Application):
    """Switch to polling only when this module is run as the local CLI."""
    await application.bot.delete_webhook(drop_pending_updates=False)
    logger.info("Webhook removed. Long polling active.")


def build_application() -> Application:
    """Build the shared PTB application used by webhook and local polling modes."""
    require_settings()
    application = (
        Application.builder()
        .token(TELEGRAM_BOT_TOKEN)
        .post_init(prepare_polling)
        .build()
    )

    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text_message))
    application.add_handler(MessageHandler(filters.PHOTO, handle_photo_message))
    application.add_handler(MessageHandler(filters.LOCATION, handle_location_message))
    return application

def main():
    try:
        application = build_application()
    except RuntimeError as exc:
        logger.critical("Telegram bot configuration error: %s", exc)
        raise SystemExit(1) from exc

    logger.info("Starting Telegram Bot Runner...")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
