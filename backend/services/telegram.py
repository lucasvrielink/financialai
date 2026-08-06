import logging

import httpx

import config

logger = logging.getLogger(__name__)

_client = httpx.AsyncClient()
_BASE = f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}"


async def send_message(chat_id: int, text: str) -> None:
    response = await _client.post(
        f"{_BASE}/sendMessage",
        json={"chat_id": chat_id, "text": text},
    )
    response.raise_for_status()


async def register_webhook() -> None:
    response = await _client.post(
        f"{_BASE}/setWebhook",
        json={
            "url": config.TELEGRAM_WEBHOOK_URL,
            "secret_token": config.TELEGRAM_WEBHOOK_SECRET,
        },
    )
    response.raise_for_status()
    result = response.json()
    if not result.get("ok"):
        raise RuntimeError(f"setWebhook rejected by Telegram: {result}")
    logger.info("setWebhook response: %s", result.get("description"))
