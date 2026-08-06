import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, status

import config
from models.transaction import TelegramUpdate, ParsedTransaction
from services.gemini import GeminiUnavailableError, parse_transactions
from services.firestore import FirestoreWriteError, get_firebase_uid, save_transaction
from services import telegram as tg

logger = logging.getLogger(__name__)
router = APIRouter()

_REPLY_NOT_LINKED = "⚠️ Sua conta Telegram não está vinculada a nenhum usuário. Contate o administrador."
_REPLY_HELP = (
    "Não entendi 🤔\n\n"
    "Exemplos que funcionam:\n"
    "• 45 academia\n"
    "• salario 5000\n"
    "• paguei janta 60\n"
    "• 3x 150 sapato"
)
_REPLY_GEMINI_ERROR = "⚠️ Não consegui processar sua mensagem agora. Tente novamente em instantes."
_REPLY_FIRESTORE_ERROR = "⚠️ Erro ao salvar a transação. Tente novamente."


def _format_one(parsed: ParsedTransaction) -> str:
    tipo = "Despesa" if parsed.type == "despesa" else "Receita"
    if parsed.installments > 1:
        return f"• {tipo} R${parsed.amount}x{parsed.installments} — {parsed.category}"
    return f"• {tipo} R${parsed.amount} — {parsed.category}"


def _build_confirmation(items: list[ParsedTransaction]) -> str:
    if len(items) == 1:
        return "✅ " + _format_one(items[0]).lstrip("• ")
    lines = "\n".join(_format_one(p) for p in items)
    return f"✅ {len(items)} transações registradas:\n{lines}"


async def _safe_send(chat_id: int, text: str) -> None:
    try:
        await tg.send_message(chat_id, text)
    except Exception:
        logger.exception("Telegram send_message failed for chat_id=%s", chat_id)


async def _process_update(update: TelegramUpdate) -> None:
    msg = update.message
    chat_id = msg.chat.id
    user_id = str(msg.from_.id)
    text = (msg.text or "").strip()

    if not text:
        await _safe_send(chat_id, _REPLY_HELP)
        return

    try:
        items = await parse_transactions(text)
    except GeminiUnavailableError:
        logger.exception("Gemini unavailable")
        await _safe_send(chat_id, _REPLY_GEMINI_ERROR)
        return

    if not items:
        await _safe_send(chat_id, _REPLY_HELP)
        return

    firebase_uid = await get_firebase_uid(user_id)
    if firebase_uid is None:
        await _safe_send(chat_id, _REPLY_NOT_LINKED)
        return

    try:
        for parsed in items:
            await save_transaction(parsed, text, user_id, firebase_uid)
    except FirestoreWriteError:
        logger.exception("Firestore write failed")
        await _safe_send(chat_id, _REPLY_FIRESTORE_ERROR)
        return

    await _safe_send(chat_id, _build_confirmation(items))


@router.post("/telegram")
async def telegram_webhook(
    update: TelegramUpdate,
    background_tasks: BackgroundTasks,
    x_telegram_bot_api_secret_token: Optional[str] = Header(default=None),
) -> dict:
    if x_telegram_bot_api_secret_token != config.TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    msg = update.message
    if msg is None:
        return {"ok": True}

    background_tasks.add_task(_process_update, update)
    return {"ok": True}
