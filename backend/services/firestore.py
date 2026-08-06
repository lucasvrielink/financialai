import asyncio
import logging
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


def _write(data: dict) -> str:
    db = firestore.client()
    _, doc_ref = db.collection("transactions").add(data)
    return doc_ref.id


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
) -> str:
    data = {
        "user_id": firebase_uid,
        "telegram_user_id": telegram_user_id,
        "type": parsed.type,
        "amount": parsed.amount,
        "category": parsed.category,
        "description": parsed.description,
        "installments": parsed.installments,
        "raw_message": raw_message,
        "created_at": firestore.SERVER_TIMESTAMP,
    }

    try:
        doc_id = await asyncio.to_thread(_write, data)
        return doc_id
    except Exception as e:
        raise FirestoreWriteError("Firestore write failed") from e
