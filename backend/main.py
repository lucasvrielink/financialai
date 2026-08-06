import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from routers.telegram import router as telegram_router
from services.telegram import register_webhook

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await register_webhook()
        logger.info("Telegram webhook registered successfully")
    except Exception:
        logger.warning("Failed to register Telegram webhook — set it manually if needed", exc_info=True)
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(telegram_router, prefix="/webhook")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
