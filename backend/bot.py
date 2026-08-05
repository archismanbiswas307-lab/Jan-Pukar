import os
import io
import re
import time
import asyncio
import requests
from pathlib import Path
from typing import Any, cast

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

from geopy.extra.rate_limiter import RateLimiter
from geopy.geocoders import Nominatim
from haversine import Unit, haversine
from supabase._async.client import create_client as create_async_client
from telegram import Bot, KeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove, Update
from telegram.ext import ApplicationBuilder, ContextTypes, MessageHandler, filters
from telegram.request import HTTPXRequest
from supabase import Client, create_client
import smtplib
from email.message import EmailMessage
import json

# --- ENVIRONMENT VARIABLE RESOLUTION ---
backend_dir = Path(__file__).resolve().parent
project_root = backend_dir.parent if backend_dir.name == "backend" else backend_dir
frontend_dir = project_root / "frontend"

if load_dotenv:
    load_dotenv(backend_dir / ".env")
    load_dotenv(project_root / ".env")
    if (frontend_dir / ".env.local").exists():
        load_dotenv(dotenv_path=str(frontend_dir / ".env.local"), override=True)

def normalize_env_value(value):
    if value is None:
        return None
    normalized = value.strip()
    if len(normalized) >= 2 and ((normalized[0] == normalized[-1] == '"') or (normalized[0] == normalized[-1] == "'")):
        normalized = normalized[1:-1].strip()
    return normalized.rstrip("/")

SUPABASE_URL = normalize_env_value(
    os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
)
SUPABASE_KEY = normalize_env_value(
    os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
)
DEFAULT_CLUSTER_ID = normalize_env_value(
    os.getenv("SUPABASE_CLUSTER_ID") or os.getenv("NEXT_PUBLIC_SUPABASE_CLUSTER_ID") or os.getenv("DEFAULT_CLUSTER_ID")
)
BOT_TOKEN = normalize_env_value(os.getenv("TELEGRAM_BOT_TOKEN")) or ""

print(f"Using Supabase URL: {SUPABASE_URL}")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("❌ Missing Supabase credentials in environment variables!")

if not BOT_TOKEN:
    raise ValueError("❌ Missing TELEGRAM_BOT_TOKEN in environment variables!")

# Optional: comma-separated list of admin Telegram chat IDs to receive high-urgency alerts
ADMIN_TELEGRAM_CHAT_IDS_RAW = normalize_env_value(os.getenv("ADMIN_TELEGRAM_CHAT_IDS") or os.getenv("ADMIN_CHAT_ID") or "")
try:
    ADMIN_TELEGRAM_CHAT_IDS = [int(s.strip()) for s in (ADMIN_TELEGRAM_CHAT_IDS_RAW.split(",") if ADMIN_TELEGRAM_CHAT_IDS_RAW else []) if s.strip()]
except Exception:
    ADMIN_TELEGRAM_CHAT_IDS = []

if ADMIN_TELEGRAM_CHAT_IDS:
    print(f"Admin alert chat IDs configured: {ADMIN_TELEGRAM_CHAT_IDS}")

# Webhook endpoints for admin alerts (comma-separated)
ADMIN_WEBHOOKS_RAW = normalize_env_value(os.getenv("ADMIN_WEBHOOK_URLS") or os.getenv("ADMIN_WEBHOOKS") or "")
ADMIN_WEBHOOK_URLS = [u.strip() for u in (ADMIN_WEBHOOKS_RAW.split(",") if ADMIN_WEBHOOKS_RAW else []) if u.strip()]
if ADMIN_WEBHOOK_URLS:
    print(f"Admin webhook URLs configured: {ADMIN_WEBHOOK_URLS}")

# SMTP config for email alerts (optional)
SMTP_HOST = normalize_env_value(os.getenv("SMTP_HOST"))
SMTP_PORT = int(normalize_env_value(os.getenv("SMTP_PORT") or "0") or 0)
SMTP_USER = normalize_env_value(os.getenv("SMTP_USER"))
SMTP_PASS = normalize_env_value(os.getenv("SMTP_PASS"))
EMAIL_FROM = normalize_env_value(os.getenv("EMAIL_FROM") or SMTP_USER or "")
SMTP_ENABLED = bool(SMTP_HOST and SMTP_PORT and SMTP_USER and SMTP_PASS and EMAIL_FROM)
if SMTP_ENABLED:
    print(f"SMTP alerts enabled (from: {EMAIL_FROM})")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
pending_complaints: dict[int, dict[str, Any]] = {}

g = Nominatim(user_agent="jansamadhan-bot")
geocode = RateLimiter(g.geocode, min_delay_seconds=1)
LOCATION_KEYWORDS = re.compile(r"\b(street|road|lane|park|station|bridge|market|circle|mall|ganj|chowk|bazar|hotel|station|metro)\b", re.I)


def upload_photo_to_supabase(photo_bytes: bytes, filename: str) -> str | None:
    try:
        # Attempt to compress image server-side to save storage and bandwidth when Pillow is available
        try:
            from PIL import Image
            from io import BytesIO
            img = Image.open(BytesIO(photo_bytes))
            out_io = BytesIO()
            img = img.convert("RGB")
            img.save(out_io, format="JPEG", optimize=True, quality=72)
            out_io.seek(0)
            upload_data = out_io.read()
        except Exception:
            upload_data = photo_bytes

        storage_url = f"{SUPABASE_URL}/storage/v1/object/grievance-images/{filename}"
        headers = {
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "apikey": SUPABASE_KEY,
            "Content-Type": "image/jpeg",
        }
        response = requests.post(storage_url, headers=headers, data=upload_data, timeout=15)
        if response.status_code in (200, 201):
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/grievance-images/{filename}"
            print(f"📸 Image uploaded to Supabase: {public_url}")
            return public_url
        else:
            print(f"⚠️ Supabase Storage Upload Failed: {response.text}")
            return None
    except Exception as exc:
        print(f"⚠️ Image upload exception: {exc}")
        return None


def analyze_grievance(text: str) -> tuple[str, int, str]:
    text_lower = text.lower()
    if any(k in text_lower for k in ["bomb", "blast", "fire", "explosion", "gas leak", "collapse", "accident", "terror", "weapon", "shooting"]):
        return "Public Safety", 5, "Emergency Incident Report"
    if any(k in text_lower for k in ["short circuit", "spark", "live wire", "transformer", "electric pole", "power outage"]):
        urgency = 5 if any(k in text_lower for k in ["spark", "wire", "live"]) else 4
        return "Electricity", urgency, "Electrical Hazard Report"
    if any(k in text_lower for k in ["pothole", "accident prone", "road broken", "traffic jam", "flyover", "street light"]):
        urgency = 4 if "pothole" in text_lower or "broken" in text_lower else 3
        return "Roads & Traffic", urgency, "Road Infrastructure Grievance"
    if any(k in text_lower for k in ["water leak", "pipeline", "sewage", "drain overflow", "waterlogging", "no water"]):
        urgency = 4 if "overflow" in text_lower or "waterlogging" in text_lower else 3
        return "Water & Sewage", urgency, "Water Utility Report"
    if any(k in text_lower for k in ["garbage", "trash", "waste", "stink", "smell", "dump", "cleaning"]):
        urgency = 3 if "overflowing" in text_lower or "stink" in text_lower else 2
        return "Sanitation", urgency, "Sanitation Grievance"
    return "General", 2, "General Municipal Grievance"


def get_location_from_message(message):
    if message.location:
        return message.location.latitude, message.location.longitude
    if getattr(message, "venue", None) and message.venue.location:
        return message.venue.location.latitude, message.venue.location.longitude
    return None


def extract_location_query(text: str) -> str | None:
    if not text or len(text.strip()) < 5:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9\s,-]", "", text).strip()
    if LOCATION_KEYWORDS.search(cleaned):
        return cleaned
    return None


def geocode_text_location(text: str) -> tuple[float, float] | None:
    query = extract_location_query(text)
    if not query:
        return None
    try:
        location = geocode(f"{query}, Kolkata, West Bengal, India")
        if location:
            return location.latitude, location.longitude
    except Exception as exc:
        print(f"⚠️ Geocoding error: {exc}")
    return None


def build_location_keyboard():
    return ReplyKeyboardMarkup(
        [[KeyboardButton(text="Share location", request_location=True)]],
        one_time_keyboard=True,
        resize_keyboard=True,
    )


def resolve_cluster_id():
    if DEFAULT_CLUSTER_ID and DEFAULT_CLUSTER_ID != "00000000-0000-0000-0000-000000000000":
        return DEFAULT_CLUSTER_ID
    try:
        result = supabase.table("clusters").select("id").limit(1).execute()
        data = getattr(result, "data", None)
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict) and data[0].get("id"):
            return data[0]["id"]
    except Exception as e:
        print(f"⚠️ Error resolving cluster ID: {e}")
    return None


def find_duplicate_report(lat: float, lng: float, category: str | None):
    category_value = category or "General"
    try:
        response = supabase.table("grievances").select("*").neq("status", "Resolved").eq("category", category_value).execute()
        data = getattr(response, "data", []) or []
    except Exception as exc:
        print(f"⚠️ Duplicate search error: {exc}")
        return None

    if not isinstance(data, list):
        return None

    for row in data:
        try:
            row_lat = float(row.get("latitude"))
            row_lng = float(row.get("longitude"))
        except (TypeError, ValueError):
            continue
        distance_km = haversine((lat, lng), (row_lat, row_lng), unit=Unit.KILOMETERS)
        if distance_km <= 0.2:
            return row
    return None


def update_duplicate_report(existing_id, duplicate, updated_count, updated_urgency):
    try:
        supabase.table("grievances").update({
            "report_count": updated_count,
            "urgency_score": updated_urgency
        }).eq("id", existing_id).execute()
    except Exception as exc:
        print(f"⚠️ Duplicate update warning: {exc}")


# --- UNIFIED REAL-TIME STATUS UPDATE LISTENER ---
async def start_realtime_listener(bot: Bot):
    """Subscribes directly to Supabase realtime websocket inside the primary async loop."""
    loop = asyncio.get_running_loop()
    try:
        async_client = await create_async_client(str(SUPABASE_URL), str(SUPABASE_KEY))
        channel = async_client.channel("realtime-grievances")

        async def send_telegram_notification(chat_id: int, text: str):
            try:
                await bot.send_message(chat_id=chat_id, text=text, parse_mode="Markdown")
                print(f"✅ Notification delivered to Telegram Chat ID: {chat_id}")
            except Exception as err:
                print(f"❌ Failed to send Telegram message to {chat_id}: {err}")

        async def send_admin_alerts(text: str):
            if not ADMIN_TELEGRAM_CHAT_IDS:
                return
            for admin_id in ADMIN_TELEGRAM_CHAT_IDS:
                try:
                    await bot.send_message(chat_id=admin_id, text=text, parse_mode="Markdown")
                    print(f"✅ Admin alert sent to {admin_id}")
                except Exception as e:
                    print(f"❌ Failed to send admin alert to {admin_id}: {e}")

        def send_webhook_alerts(payload: dict):
            if not ADMIN_WEBHOOK_URLS:
                return
            for url in ADMIN_WEBHOOK_URLS:
                try:
                    requests.post(url, json=payload, timeout=8)
                    print(f"✅ Webhook posted to {url}")
                except Exception as ex:
                    print(f"❌ Webhook post failed for {url}: {ex}")

        def send_email_alert(subject: str, body: str, to_emails: list[str] | None = None):
            if not SMTP_ENABLED:
                return
            recipients = to_emails or []
            if not recipients:
                # fallback to admin list if no specific recipients
                recipients = [str(x) for x in ADMIN_TELEGRAM_CHAT_IDS] if ADMIN_TELEGRAM_CHAT_IDS else []
            if not recipients:
                return
            try:
                msg = EmailMessage()
                msg["Subject"] = subject
                msg["From"] = EMAIL_FROM
                msg["To"] = ",".join(recipients)
                msg.set_content(body)
                with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
                    smtp.login(SMTP_USER, SMTP_PASS)
                    smtp.send_message(msg)
                print(f"✅ Email alert sent to {recipients}")
            except Exception as e:
                print(f"❌ Email alert failed: {e}")

        def status_change_handler(payload):
            print("\n🔔 REALTIME EVENT TRIGGERED!")

            # Safely extract dictionary record payload across various SDK versions
            if isinstance(payload, dict):
                inner_data = payload.get("data", {})
                data = inner_data.get("record") or inner_data.get("new") or payload.get("record") or payload.get("new") or {}
            else:
                data = getattr(payload, "record", None) or getattr(payload, "new", None) or {}
                if not data and hasattr(payload, "data"):
                    inner_data = getattr(payload, "data", {})
                    if isinstance(inner_data, dict):
                        data = inner_data.get("record") or inner_data.get("new") or {}
                    else:
                        data = getattr(inner_data, "record", None) or getattr(inner_data, "new", None) or {}

            if not isinstance(data, dict) or not data:
                print("⚠️ Payload did not contain expected dictionary record:", payload)
                return

            print(f"📊 Updated Record Data: {data}")

            # Prefer explicit telegram_chat_id in the row; fall back to user_id if available.
            record = data
            chat_id_field = record.get("telegram_chat_id")

            # Verify that chat_id exists and consists only of digits (allow negative IDs if your bot uses them)
            chat_id = None
            if chat_id_field is not None and str(chat_id_field).replace("-", "").isdigit():
                chat_id = int(chat_id_field)
            else:
                # fall back to user_id like 'telegram_12345'
                raw_user = record.get("user_id")
                if raw_user and isinstance(raw_user, str) and raw_user.startswith("telegram_"):
                    candidate = raw_user.replace("telegram_", "")
                    if candidate.replace("-", "").isdigit():
                        chat_id = int(candidate)

            if chat_id is None:
                print(f"⚠️ Skipped Telegram notification: No valid numeric telegram_chat_id found for record {record.get('id')}")
                return

            report_id = data.get("id", "N/A")
            status = data.get("status")
            title = data.get("title", "Grievance Report")

            if status == "In Progress":
                text = (
                    f"⚙️ *Status Update on Your Report*\n\n"
                    f"Your complaint *'{title}'* (ID: `#{report_id}`) is now *IN PROGRESS*.\n"
                    f"Municipal field teams have been dispatched."
                )
            elif status == "Resolved":
                text = (
                    f"🎉 *Complaint Resolved!*\n\n"
                    f"Your report *'{title}'* (ID: `#{report_id}`) has been marked as *RESOLVED* by authorities.\n"
                    f"Thank you for helping keep the city clean and safe!"
                )
            else:
                print(f"ℹ️ Status changed to '{status}' (Ignored for notification).")
                return

            asyncio.run_coroutine_threadsafe(
                send_telegram_notification(chat_id, text), loop
            )

        def insert_handler(payload):
            print("\n🔔 INSERT event received for grievances table")
            # normalize payload to dict record similar to update handler
            if isinstance(payload, dict):
                inner_data = payload.get("data", {})
                data = inner_data.get("record") or inner_data.get("new") or payload.get("record") or payload.get("new") or {}
            else:
                data = getattr(payload, "record", None) or getattr(payload, "new", None) or {}
                if not data and hasattr(payload, "data"):
                    inner_data = getattr(payload, "data", {})
                    if isinstance(inner_data, dict):
                        data = inner_data.get("record") or inner_data.get("new") or {}

            if not isinstance(data, dict) or not data:
                print("⚠️ Insert payload did not contain expected data:", payload)
                return

            try:
                urgency = int(data.get("urgency_score") or 0)
            except Exception:
                urgency = 0

            if urgency >= 4:
                report_id = data.get("id", "N/A")
                title = data.get("title", "Grievance Report")
                lat = data.get("latitude")
                lng = data.get("longitude")
                category = data.get("category") or "Unspecified"
                created = data.get("created_at") or ""
                admin_text = (
                    f"🚨 *High-Urgency Report Submitted*\n\n"
                    f"*{title}* (ID: `#{report_id}`)\n"
                    f"Category: {category} — Urgency: {urgency}/5\n"
                    f"Location: {lat},{lng}\n"
                    f"Reported: {created}"
                )
                # Telegram admins
                asyncio.run_coroutine_threadsafe(send_admin_alerts(admin_text), loop)
                # Webhook admins (send structured JSON)
                try:
                    payload = {
                        "type": "high_urgency_insert",
                        "id": report_id,
                        "title": title,
                        "category": category,
                        "urgency": urgency,
                        "latitude": lat,
                        "longitude": lng,
                        "created_at": created,
                    }
                    # run in thread to avoid blocking
                    loop.run_in_executor(None, send_webhook_alerts, payload)
                except Exception as ex:
                    print(f"⚠️ Failed to queue webhook alerts: {ex}")
                # Email admins
                try:
                    subj = f"High-Urgency Report: {title} (#{report_id})"
                    body = f"{title}\nID: {report_id}\nCategory: {category}\nUrgency: {urgency}/5\nLocation: {lat},{lng}\nReported: {created}"
                    loop.run_in_executor(None, send_email_alert, subj, body, None)
                except Exception as ex:
                    print(f"⚠️ Failed to queue email alerts: {ex}")

        channel.on_postgres_changes(
            event="UPDATE",
            schema="public",
            table="grievances",
            callback=status_change_handler,
        )

        await channel.subscribe()
        print("⚡ Realtime database listener is active and waiting for updates...")
    except Exception as exc:
        print(f"❌ Realtime listener failed to initialize: {exc}")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    message = update.message
    if not message:
        return

    text = message.text or message.caption or ""
    image_url = None
    user_id = message.from_user.id if message.from_user else None

    if message.photo:
        try:
            photo_file = await message.photo[-1].get_file()
            photo_bytes = await photo_file.download_as_bytearray()
            filename = f"grievance_{user_id if user_id else 'anon'}_{int(time.time())}.jpg"
            image_url = await asyncio.to_thread(upload_photo_to_supabase, bytes(photo_bytes), filename)
        except Exception as img_err:
            print(f"⚠️ Error processing photo: {img_err}")

    coords = get_location_from_message(message)
    if not coords and text:
        coords = await asyncio.to_thread(geocode_text_location, text)

    if not coords:
        if user_id is not None:
            existing = pending_complaints.get(user_id, {})
            pending_complaints[user_id] = {
                "text": text or existing.get("text", ""),
                "image_url": image_url or existing.get("image_url", None)
            }
        await message.reply_text(
            "Please share your location so I can register your complaint accurately.",
            reply_markup=build_location_keyboard(),
        )
        return

    lat, lng = coords

    if user_id is not None and user_id in pending_complaints:
        saved_data = pending_complaints.pop(user_id)
        if not text:
            text = saved_data.get("text", "")
        if not image_url:
            image_url = saved_data.get("image_url", None)

    if not text:
        venue = getattr(message, "venue", None)
        text = venue.title if venue and getattr(venue, "title", None) else "Telegram Grievance"

    category, calculated_urgency, title = analyze_grievance(text)

    duplicate = await asyncio.to_thread(find_duplicate_report, lat, lng, category)
    if duplicate:
        existing_id = duplicate.get("id")
        current_count = int(duplicate.get("report_count") or duplicate.get("upvote_count") or 0)
        updated_count = current_count + 1
        current_urgency = int(duplicate.get("urgency_score") or 1)
        updated_urgency = min(5, max(current_urgency + 1, calculated_urgency))

        await asyncio.to_thread(update_duplicate_report, existing_id, duplicate, updated_count, updated_urgency)

        await message.reply_text(
            f"⚠️ Existing {category} report found nearby! Priority updated to {updated_urgency}/5.",
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    try:
        raw_telegram_id = message.from_user.id if message.from_user else None
        
        active_cluster_id = await asyncio.to_thread(resolve_cluster_id)

        insert_payload = {
            "user_id": f"telegram_{raw_telegram_id}" if raw_telegram_id else "telegram_unknown",
            "telegram_chat_id": raw_telegram_id,
            "title": title,
            "description": text,
            "category": category,
            "latitude": float(lat),
            "longitude": float(lng),
            "status": "Pending",
            "urgency_score": calculated_urgency,
            "report_count": 1,
            "image_url": image_url,
        }

        if active_cluster_id:
            insert_payload["cluster_id"] = active_cluster_id

        await asyncio.to_thread(supabase.table("grievances").insert(insert_payload).execute)
        print(f"✅ Report successfully saved to Supabase (Cluster ID: {active_cluster_id}).")

        await message.reply_text(
            f"✅ Your complaint has been registered on the JanSamadhan Map!\n\n📌 Category: {category}\n🚨 Urgency Score: {calculated_urgency}/5",
            reply_markup=ReplyKeyboardRemove(),
        )
    except Exception as e:
        print(f"❌ Error inserting into Supabase: {e}")
        await message.reply_text("❌ Failed to register complaint.")


async def main():
    print("🤖 Starting JanPukar Bot Engine...")

    httpx_request = HTTPXRequest(connect_timeout=20.0, read_timeout=20.0)
    
    app = (
        ApplicationBuilder()
        .token(BOT_TOKEN)
        .request(httpx_request)
        .build()
    )

    app.add_handler(
        MessageHandler(filters.TEXT | filters.LOCATION | filters.VENUE | filters.PHOTO, handle_message)
    )

    await app.initialize()
    await app.bot.delete_webhook(drop_pending_updates=True)
    await app.start()

    await app.updater.start_polling()

    realtime_task = asyncio.create_task(start_realtime_listener(app.bot))

    print("🚀 Bot and Realtime WebSocket actively listening!")

    try:
        await asyncio.gather(realtime_task, asyncio.Event().wait())
    finally:
        await app.updater.stop()
        await app.stop()
        await app.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        print("Bot shut down cleanly.")