import os
from dotenv import load_dotenv

load_dotenv()


def _require(key: str) -> str:
    value = os.getenv(key)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {key}")
    return value


GEMINI_API_KEY = _require("GEMINI_API_KEY")
TELEGRAM_BOT_TOKEN = _require("TELEGRAM_BOT_TOKEN")
TELEGRAM_WEBHOOK_SECRET = _require("TELEGRAM_WEBHOOK_SECRET")
TELEGRAM_WEBHOOK_URL = _require("TELEGRAM_WEBHOOK_URL")
FIREBASE_PROJECT_ID = _require("FIREBASE_PROJECT_ID")
FIREBASE_CLIENT_EMAIL = _require("FIREBASE_CLIENT_EMAIL")
FIREBASE_PRIVATE_KEY = _require("FIREBASE_PRIVATE_KEY").replace("\\n", "\n")

try:
    TELEGRAM_OWNER_ID = int(_require("TELEGRAM_OWNER_ID"))
except ValueError:
    raise RuntimeError("TELEGRAM_OWNER_ID must be a numeric integer")
