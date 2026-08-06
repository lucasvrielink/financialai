# Design: Telegram Webhook

## Overview
The feature is implemented entirely in the FastAPI backend. Incoming Telegram webhook calls are
authenticated via a header secret, owner-filtered, then handed off to a FastAPI `BackgroundTask`
so the 200 response is returned to Telegram immediately (satisfying the 5-second timeout). The
background task runs the Gemini parsing → Firestore write → Telegram reply pipeline. A startup
lifespan event registers the webhook with Telegram. All external I/O uses `async/await` with
`httpx` (Telegram API) and `firebase-admin` (Firestore). No frontend changes.

---

## Backend — Files to Create

| File | Purpose |
|---|---|
| `backend/main.py` | FastAPI app, lifespan (webhook registration + owner ID validation), `/health` |
| `backend/config.py` | Load and validate all env vars at import time; fail fast if required vars are missing |
| `backend/routers/telegram.py` | `POST /webhook/telegram` — secret validation, owner check, background task dispatch |
| `backend/services/gemini.py` | `parse_transaction(text)` — calls Gemini API, returns `ParsedTransaction` or `None` |
| `backend/services/firestore.py` | `save_transaction(tx)` — writes to Firestore `transactions` collection |
| `backend/services/telegram.py` | `send_message(chat_id, text)` and `register_webhook()` — thin httpx wrappers |
| `backend/models/transaction.py` | All Pydantic models |
| `backend/requirements.txt` | Python dependencies |

## Backend — Files to Modify
_None — this is a greenfield implementation._

## Frontend — Files to Create / Modify
_None — frontend is out of scope for this feature._

---

## Config (`backend/config.py`)

Loads env vars via `python-dotenv` and exposes them as module-level constants. Required vars
raise `RuntimeError` at import time so the app fails fast before binding to a port.

```python
# Required — app will not start without these
GEMINI_API_KEY: str
TELEGRAM_BOT_TOKEN: str
TELEGRAM_WEBHOOK_SECRET: str
TELEGRAM_WEBHOOK_URL: str   # full HTTPS URL, e.g. https://myapp.your-domain.com/webhook/telegram
TELEGRAM_OWNER_ID: int      # parsed to int; ValueError on non-numeric value
FIREBASE_PROJECT_ID: str
FIREBASE_CLIENT_EMAIL: str
FIREBASE_PRIVATE_KEY: str   # newline-escaped; config.py replaces "\\n" → "\n"
```

---

## Pydantic Models (`backend/models/transaction.py`)

```python
from pydantic import BaseModel
from typing import Literal, Optional

# --- Telegram incoming payload ---

class TelegramUser(BaseModel):
    id: int
    first_name: str
    username: Optional[str] = None

class TelegramChat(BaseModel):
    id: int

class TelegramMessage(BaseModel):
    message_id: int
    from_: TelegramUser = Field(alias="from")
    chat: TelegramChat
    text: Optional[str] = None          # absent for stickers, photos, etc.

    model_config = ConfigDict(populate_by_name=True)

class TelegramUpdate(BaseModel):
    update_id: int
    message: Optional[TelegramMessage] = None   # absent for channel posts, etc.

# --- Gemini parsed output ---

class ParsedTransaction(BaseModel):
    parseable: bool
    type: Optional[Literal["despesa", "receita"]] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    installments: int = 1

# --- Firestore document ---

class Transaction(BaseModel):
    user_id: str                          # str(Telegram user ID)
    type: Literal["despesa", "receita"]
    amount: float
    category: str
    description: str
    installments: int
    raw_message: str
    created_at: datetime                  # server-set before write
```

---

## Firestore Schema

**Collection:** `transactions`

```
transactions/{auto-id}
{
  user_id:      string   — str(Telegram owner user ID)
  type:         string   — "despesa" | "receita"
  amount:       number   — positive float (R$)
  category:     string   — normalized lowercase PT category name
  description:  string   — short human-readable label from Gemini
  installments: number   — integer ≥ 1
  raw_message:  string   — original trimmed text sent by the user
  created_at:   timestamp — Firestore SERVER_TIMESTAMP
}
```

No schema migration needed — Firestore is schemaless. Index requirements: none at this stage
(future dashboard will add composite indexes as needed).

---

## Gemini Prompt Strategy (`backend/services/gemini.py`)

**Model:** `gemini-1.5-flash` (low latency, cost-efficient for short structured tasks).

**Approach:** Single `generate_content` call with a detailed system instruction and the user
message as the prompt. `response_mime_type="application/json"` forces JSON-only output (no
markdown fences, no prose), making `json.loads` reliable.

**System instruction (sent once per request via `GenerationConfig`):**

```
Você é um parser de transações financeiras para mensagens em português brasileiro informal.
Analise a mensagem e retorne SOMENTE um objeto JSON, sem texto adicional, com este esquema:

{
  "parseable": boolean,
  "type": "despesa" | "receita",
  "amount": número positivo (float),
  "category": string em português (saúde, alimentação, transporte, renda, vestuário,
               lazer, moradia, educação, outros),
  "description": string curta descrevendo a transação,
  "installments": inteiro ≥ 1 (padrão 1)
}

Se a mensagem NÃO for uma transação financeira, retorne exatamente: {"parseable": false}

Regras de interpretação:
- "paguei", "gastei", "comprei", "fui", verbs of spending → type: "despesa"
- "recebi", "salário", "caiu", "entrou", "freela", "pix" de recebimento → type: "receita"
- Valores por extenso → converta para float ("quarenta e cinco" → 45.0)
- Valores negativos → converta para positivo
- Abreviações → expanda para categoria mais provável ("acad" → saúde, "uber" → transporte)
- Parcelamento: "3x 150", "em 3x", "3 vezes" → installments: 3, amount: 150
- Quando só um número sem contexto → tente "despesa" genérica; se impossível → parseable: false
```

**Parsing flow:**
1. Trim and normalize whitespace from the raw message.
2. Call `model.generate_content_async(text, generation_config={"response_mime_type": "application/json"})`.
3. `json.loads(response.text)` → validate with `ParsedTransaction.model_validate(data)`.
4. If `parseable == False` or `amount` is `None` or `amount <= 0` → return `None` (triggers help reply).
5. Force `amount = abs(amount)` before returning.

**Exception handling:**
- `google.api_core.exceptions.GoogleAPIError` or any network error → raise `GeminiUnavailableError`.
- `json.JSONDecodeError` or `ValidationError` → log raw response, return `None` (help reply).

---

## Telegram Service (`backend/services/telegram.py`)

Uses `httpx.AsyncClient` directly against the Bot API (no `python-telegram-bot` Application
overhead needed for a pure webhook setup).

```python
TELEGRAM_API_BASE = f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}"

async def send_message(chat_id: int, text: str) -> None:
    # POST /sendMessage — fire-and-forget called from background task
    # Raises httpx.HTTPStatusError on non-2xx; caller must catch and log

async def register_webhook() -> None:
    # POST /setWebhook with url= and secret_token=
    # Called from lifespan startup; raises on failure (non-fatal, app continues)
```

---

## Router (`backend/routers/telegram.py`)

```
POST /webhook/telegram
Header: X-Telegram-Bot-Api-Secret-Token: <secret>
Body: TelegramUpdate (JSON)
Response: {"ok": true} — always HTTP 200 after auth passes
```

**Request lifecycle:**

```
1. Validate X-Telegram-Bot-Api-Secret-Token header
   → mismatch/missing: return HTTP 403 immediately

2. Parse body as TelegramUpdate (Pydantic)
   → invalid JSON: FastAPI returns HTTP 422 automatically

3. Check update.message exists AND update.message.from_.id == TELEGRAM_OWNER_ID
   → mismatch: return HTTP 200 {"ok": true} silently (no reply)

4. Enqueue process_update(update) as FastAPI BackgroundTask
   → return HTTP 200 {"ok": true} immediately

--- Background task: process_update(update) ---

5. Extract text = update.message.text (stripped)
   → None or empty: send help message, return

6. Call gemini.parse_transaction(text)
   → GeminiUnavailableError: send error message, return
   → returns None (unparseable): send help message, return

7. Call firestore.save_transaction(parsed, raw_message=text, user_id=...)
   → FirestoreWriteError: send error message, return

8. Build confirmation reply string
   → send_message(chat_id, confirmation)
   → any exception: log silently (do not raise — Telegram already got its 200)
```

**Secret validation** is done inline at the top of the route handler (not a FastAPI `Depends`)
to keep the 403 path simple and free of dependency injection overhead.

---

## Main App (`backend/main.py`)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup:
    #   1. Validate config (import already raised if missing)
    #   2. Register Telegram webhook — log warning on failure, do not raise
    yield
    # Shutdown: nothing to clean up

app = FastAPI(lifespan=lifespan)
app.include_router(telegram_router, prefix="/webhook")

@app.get("/health")
async def health():
    return {"status": "ok"}
```

---

## API Contract

### `POST /webhook/telegram`
| | |
|---|---|
| **Auth** | `X-Telegram-Bot-Api-Secret-Token: {TELEGRAM_WEBHOOK_SECRET}` |
| **Content-Type** | `application/json` |
| **Request body** | Telegram `Update` object |
| **Response 200** | `{"ok": true}` — always returned after secret validates |
| **Response 403** | Secret token missing or wrong |
| **Response 422** | Malformed JSON body (FastAPI default) |

### `GET /health`
| | |
|---|---|
| **Response 200** | `{"status": "ok"}` |

---

## Error Handling Summary

| Scenario | Where caught | Action |
|---|---|---|
| Wrong/missing secret token | Router, step 1 | Return HTTP 403, stop |
| Non-owner user ID | Router, step 3 | Return HTTP 200, no reply, stop |
| No text / non-text message | Background task, step 5 | Send help message |
| Gemini API exception | `gemini.py` → background task | Send `⚠️ Não consegui processar…` |
| Gemini returns bad JSON | `gemini.py` → background task | Log raw response; send help message |
| `parseable: false` from Gemini | background task | Send help message |
| Firestore write error | `firestore.py` → background task | Send `⚠️ Erro ao salvar…`, log error |
| Telegram `send_message` error | background task, step 8 | Log silently, do not re-raise |
| `setWebhook` fails at startup | `main.py` lifespan | Log warning, app continues |

---

## Reply Messages (exact strings)

```python
REPLY_CONFIRMATION_EXPENSE = "✅ Despesa R${amount} — {category}"
REPLY_CONFIRMATION_EXPENSE_INSTALLMENTS = "✅ Despesa R${amount}x{n} — {category}"
REPLY_CONFIRMATION_INCOME = "✅ Receita R${amount} — {category}"

REPLY_HELP = (
    "Não entendi 🤔\n\n"
    "Exemplos que funcionam:\n"
    "• 45 academia\n"
    "• salario 5000\n"
    "• paguei janta 60\n"
    "• 3x 150 sapato"
)

REPLY_GEMINI_ERROR = "⚠️ Não consegui processar sua mensagem agora. Tente novamente em instantes."
REPLY_FIRESTORE_ERROR = "⚠️ Erro ao salvar a transação. Tente novamente."
```

---

## Security

- `X-Telegram-Bot-Api-Secret-Token` validated on every request before any processing.
- `TELEGRAM_OWNER_ID` checked before any data is read or written.
- `TELEGRAM_OWNER_ID` missing at startup → `RuntimeError` (fail fast).
- Firebase Admin SDK credentials never exposed to the frontend; only used server-side.
- All secrets loaded from environment variables via `python-dotenv`.

---

## Dependencies (`backend/requirements.txt`)

```
fastapi
uvicorn[standard]
python-dotenv
httpx
google-generativeai
firebase-admin
pydantic>=2.0
```

_`python-telegram-bot` is NOT required — we call the Telegram Bot API directly via httpx,
which is sufficient for a pure webhook (send-only) use case._
