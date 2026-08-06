from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class TelegramUser(BaseModel):
    id: int
    first_name: str
    username: Optional[str] = None


class TelegramChat(BaseModel):
    id: int


class TelegramMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    message_id: int
    from_: TelegramUser = Field(alias="from")
    chat: TelegramChat
    text: Optional[str] = None


class TelegramUpdate(BaseModel):
    update_id: int
    message: Optional[TelegramMessage] = None


class ParsedTransaction(BaseModel):
    parseable: bool
    type: Optional[Literal["despesa", "receita"]] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    installments: int = 1


class Transaction(BaseModel):
    user_id: str
    type: Literal["despesa", "receita"]
    amount: float
    category: str
    description: str
    installments: int
    raw_message: str
    created_at: datetime
