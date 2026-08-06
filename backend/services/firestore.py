import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

import firebase_admin
from firebase_admin import credentials, firestore

import config
from models.transaction import ParsedTransaction

logger = logging.getLogger(__name__)


class FirestoreWriteError(Exception):
    pass


def _init_firebase() -> None:
    if not firebase_admin._apps:
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": config.FIREBASE_PROJECT_ID,
            "client_email": config.FIREBASE_CLIENT_EMAIL,
            "private_key": config.FIREBASE_PRIVATE_KEY,
            "token_uri": "https://oauth2.googleapis.com/token",
        })
        firebase_admin.initialize_app(cred)


_init_firebase()


def _write_batch(docs: list[dict]) -> None:
    db = firestore.client()
    batch = db.batch()
    for data in docs:
        ref = db.collection("transactions").document()
        batch.set(ref, data)
    batch.commit()


def _make_installment_date(base: datetime, offset_months: int) -> datetime:
    month = base.month - 1 + offset_months
    year = base.year + month // 12
    month = month % 12 + 1
    return datetime(year, month, 1, 12, 0, 0, tzinfo=timezone.utc)


def _query_firebase_uid(telegram_user_id: str) -> Optional[str]:
    db = firestore.client()
    docs = db.collection("users").where("telegram_user_id", "==", telegram_user_id).limit(1).get()
    return docs[0].get("firebase_uid") if docs else None


async def get_firebase_uid(telegram_user_id: str) -> Optional[str]:
    return await asyncio.to_thread(_query_firebase_uid, telegram_user_id)


async def save_transaction(
    parsed: ParsedTransaction,
    raw_message: str,
    telegram_user_id: str,
    firebase_uid: str,
) -> None:
    now = datetime.now(timezone.utc)
    n = parsed.installments or 1

    base = {
        "user_id": firebase_uid,
        "telegram_user_id": telegram_user_id,
        "type": parsed.type,
        "amount": parsed.amount,
        "category": parsed.category,
        "description": parsed.description,
        "installments": n,
        "raw_message": raw_message,
    }

    docs = []
    for i in range(n):
        doc = dict(base)
        doc["installment_index"] = i + 1
        doc["created_at"] = _make_installment_date(now, i)
        docs.append(doc)

    try:
        await asyncio.to_thread(_write_batch, docs)
    except Exception as e:
        raise FirestoreWriteError("Firestore write failed") from e
