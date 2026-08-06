# Tasks: Telegram Webhook

## Setup Tasks (manual — do these first, in order)

- [x] SETUP-01: Create a Telegram bot via BotFather
  - Open Telegram → search @BotFather → `/newbot` → follow prompts
  - Copy the **Bot Token** → will be `TELEGRAM_BOT_TOKEN`

- [x] SETUP-02: Get your Telegram user ID (owner ID)
  - Send any message to @userinfobot on Telegram
  - Copy the numeric **Id** field → will be `TELEGRAM_OWNER_ID`

- [x] SETUP-03: Create a Firebase project and enable Firestore
  - Go to Firebase Console → Add project → Enable Firestore in **Native mode**
  - In Project Settings → Service Accounts → Generate new private key (downloads JSON)
  - Extract `project_id` → `FIREBASE_PROJECT_ID`
  - Extract `client_email` → `FIREBASE_CLIENT_EMAIL`
  - Extract `private_key` (the full `-----BEGIN...END-----` block) → `FIREBASE_PRIVATE_KEY`

- [x] SETUP-04: Get a Gemini API key
  - Go to Google AI Studio → Get API key
  - Copy the key → `GEMINI_API_KEY`

- [x] SETUP-05: Fill in `backend/.env`
  - Create `backend/.env` with all six variables:
    ```
    GEMINI_API_KEY=...
    TELEGRAM_BOT_TOKEN=...
    TELEGRAM_WEBHOOK_SECRET=<any random string you choose, e.g. output of `openssl rand -hex 32`>
    TELEGRAM_WEBHOOK_URL=https://<your-domain.com>/webhook/telegram
    TELEGRAM_OWNER_ID=<numeric id from SETUP-02>
    FIREBASE_PROJECT_ID=...
    FIREBASE_CLIENT_EMAIL=...
    FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
    ```
  - For local testing, replace `TELEGRAM_WEBHOOK_URL` with your ngrok URL (see SETUP-06)

- [x] SETUP-06: Install ngrok for local webhook testing
  - `brew install ngrok` (or download from ngrok.com)
  - Run `ngrok http 8000` and copy the `https://` forwarding URL
  - Set `TELEGRAM_WEBHOOK_URL=https://<ngrok-subdomain>.ngrok.io/webhook/telegram` in `backend/.env`

---

## Backend Tasks

- [x] BE-01: Create `backend/requirements.txt`
  - Depends on: nothing
  - Contents:
    ```
    fastapi
    uvicorn[standard]
    python-dotenv
    httpx
    google-generativeai
    firebase-admin
    pydantic>=2.0
    ```

- [x] BE-02: Create `backend/config.py` — load and validate all env vars
  - Depends on: BE-01
  - Load vars with `python-dotenv`; raise `RuntimeError` for any missing required var
  - Parse `TELEGRAM_OWNER_ID` to `int`; raise `ValueError` on non-numeric value
  - Replace `\\n` with `\n` in `FIREBASE_PRIVATE_KEY` (common copy-paste issue)
  - Expose as module-level constants: `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`,
    `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_OWNER_ID`,
    `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

- [x] BE-03: Create `backend/models/transaction.py` — all Pydantic models
  - Depends on: nothing
  - Models to implement (exact field names and types from design.md):
    - `TelegramUser` — `id: int`, `first_name: str`, `username: Optional[str]`
    - `TelegramChat` — `id: int`
    - `TelegramMessage` — `message_id: int`, `from_: TelegramUser` (alias `"from"`),
      `chat: TelegramChat`, `text: Optional[str]`
    - `TelegramUpdate` — `update_id: int`, `message: Optional[TelegramMessage]`
    - `ParsedTransaction` — `parseable: bool`, `type: Optional[Literal["despesa","receita"]]`,
      `amount: Optional[float]`, `category: Optional[str]`, `description: Optional[str]`,
      `installments: int = 1`
    - `Transaction` — `user_id: str`, `type`, `amount: float`, `category: str`,
      `description: str`, `installments: int`, `raw_message: str`, `created_at: datetime`

- [x] BE-04: Create `backend/services/telegram.py` — Telegram Bot API client
  - Depends on: BE-02
  - Implement `async send_message(chat_id: int, text: str) -> None`
    - `POST https://api.telegram.org/bot{TOKEN}/sendMessage`
    - Raises `httpx.HTTPStatusError` on non-2xx (caller catches and logs)
  - Implement `async register_webhook() -> None`
    - `POST https://api.telegram.org/bot{TOKEN}/setWebhook`
    - Body: `{"url": TELEGRAM_WEBHOOK_URL, "secret_token": TELEGRAM_WEBHOOK_SECRET}`
    - Raises on failure (non-fatal — caught in lifespan)
  - Use a single shared `httpx.AsyncClient` instance (module-level)

- [x] BE-05: Create `backend/services/gemini.py` — transaction parser
  - Depends on: BE-02, BE-03
  - Define `class GeminiUnavailableError(Exception)`
  - Implement `async parse_transaction(text: str) -> Optional[ParsedTransaction]`
    - Initialize `google.generativeai` with `GEMINI_API_KEY`
    - Use model `gemini-1.5-flash`
    - Set `generation_config={"response_mime_type": "application/json"}`
    - Include the full system instruction from design.md (the PT-BR rules block)
    - On `google.api_core.exceptions.GoogleAPIError` or network error → raise `GeminiUnavailableError`
    - On `json.JSONDecodeError` or `ValidationError` → log raw response text, return `None`
    - If `parsed.parseable == False` or `parsed.amount` is None or `<= 0` → return `None`
    - Force `parsed.amount = abs(parsed.amount)` before returning

- [x] BE-06: Create `backend/services/firestore.py` — Firestore write
  - Depends on: BE-02, BE-03
  - Define `class FirestoreWriteError(Exception)`
  - Initialize `firebase_admin` with `credentials.Certificate(...)` using config vars;
    guard with `if not firebase_admin._apps` to avoid re-initialization
  - Implement `async save_transaction(parsed: ParsedTransaction, raw_message: str, user_id: str) -> str`
    - Build `Transaction` model; set `created_at = datetime.utcnow()`
    - Use `firestore.SERVER_TIMESTAMP` for `created_at` in the dict sent to Firestore
    - Write to `transactions` collection using `add()` (auto-generated ID)
    - Return the document ID
    - Wrap in `try/except Exception` → raise `FirestoreWriteError` with original error chained
  - Note: `firebase_admin` Firestore client is sync; run via `asyncio.get_event_loop().run_in_executor(None, ...)` to avoid blocking the event loop

- [x] BE-07: Create `backend/routers/telegram.py` — webhook route and background processor
  - Depends on: BE-03, BE-04, BE-05, BE-06
  - Define the reply string constants (from design.md "Reply Messages" section)
  - Implement `POST /webhook/telegram`:
    1. Read `X-Telegram-Bot-Api-Secret-Token` header; return `HTTP 403` if missing or wrong
    2. Accept body as `TelegramUpdate`
    3. Check `update.message` exists and `update.message.from_.id == TELEGRAM_OWNER_ID`
       → if not, return `{"ok": True}` silently
    4. Enqueue `process_update(update)` via FastAPI `BackgroundTasks`
    5. Return `{"ok": True}` immediately
  - Implement `async process_update(update: TelegramUpdate)`:
    1. Extract and strip `text`; if `None` or empty → `send_message(chat_id, REPLY_HELP)`; return
    2. Call `parse_transaction(text)`
       - `GeminiUnavailableError` → `send_message(chat_id, REPLY_GEMINI_ERROR)`; return
       - Returns `None` → `send_message(chat_id, REPLY_HELP)`; return
    3. Call `save_transaction(parsed, text, str(user_id))`
       - `FirestoreWriteError` → `send_message(chat_id, REPLY_FIRESTORE_ERROR)`; return
    4. Build confirmation string based on `type` and `installments`
    5. `send_message(chat_id, confirmation)` — wrap in `try/except`, log on failure, do not raise

- [x] BE-08: Create `backend/main.py` — FastAPI app entry point
  - Depends on: BE-07
  - Use `@asynccontextmanager` lifespan:
    - Startup: call `register_webhook()`; catch all exceptions, log warning, continue
  - Register `telegram_router` with prefix `/webhook`
  - Add `GET /health` returning `{"status": "ok"}`
  - Instantiate `app = FastAPI(lifespan=lifespan)`

---

## Verification Checklist

- [x] VER-01: Start the backend locally (`uvicorn main:app --reload` from `/backend`) — confirm no startup errors and `/health` returns `{"status": "ok"}`
- [x] VER-02: Start ngrok (`ngrok http 8000`), update `TELEGRAM_WEBHOOK_URL` in `.env`, restart server — confirm `setWebhook` succeeds (check logs)
- [x] VER-03: Send "45 academia" from your Telegram account → confirm bot replies `✅ Despesa R$45.0 — saúde` and the transaction appears in Firestore console
- [x] VER-04: Send "salario 5000" → confirm bot replies `✅ Receita R$5000.0 — renda`
- [x] VER-05: Send "3x 150 sapato" → confirm bot replies `✅ Despesa R$150.0x3 — vestuário`
- [x] VER-06: Send "oi tudo bem?" → confirm bot replies with the help message, no Firestore write
- [x] VER-07: Send a sticker or photo → confirm bot replies with help message, no crash
- [x] VER-08: Make a request with wrong `X-Telegram-Bot-Api-Secret-Token` → confirm HTTP 403
- [x] VER-09: Send a message from a different Telegram account → confirm no reply and no Firestore write
