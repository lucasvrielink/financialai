# Requirements: Telegram Webhook

## Overview
The Telegram webhook feature is the core entry point of the personal finance bot. It exposes a
FastAPI endpoint that receives incoming Telegram messages, authenticates them via a secret token,
filters to a single authorized owner, sends the message text to Gemini AI for transaction parsing,
persists the resulting structured transaction to Firestore, and replies to the user with a
confirmation or help message — all in Brazilian Portuguese.

## User Stories
- As the bot owner, I want to send a casual message like "45 academia" and have it automatically
  saved as a R$45 health expense, so I can track my finances without any manual data entry.
- As the bot owner, I want the bot to confirm what it saved ("✅ Despesa R$45 — saúde"), so I
  know the transaction was understood and stored correctly.
- As the bot owner, I want the bot to reply with usage instructions if it doesn't understand my
  message, so I know what format to use.
- As a non-owner Telegram user, I want the bot to not process my messages, so the owner's data
  remains private.

## Functional Requirements
- FR-01: The backend must expose a `POST /webhook/telegram` endpoint that receives Telegram Update
  objects as JSON.
- FR-02: Every incoming request must be validated against the `TELEGRAM_WEBHOOK_SECRET` env var
  using the `X-Telegram-Bot-Api-Secret-Token` header. Requests with a missing or mismatched
  token must return HTTP 403 and not be processed further.
- FR-03: Only messages from the Telegram user ID stored in `TELEGRAM_OWNER_ID` env var must be
  processed. Messages from any other user must be silently dropped (return HTTP 200 with no reply).
- FR-04: The message text must be forwarded to Gemini AI with a prompt that instructs it to parse
  informal Brazilian Portuguese into a structured transaction: `type` (receita/despesa),
  `amount` (float), `category` (string), `description` (string), and optionally `installments`
  (int, defaults to 1).
- FR-05: The parsed transaction must be saved to the Firestore `transactions` collection with a
  server-generated timestamp (`created_at`) and the owner's Telegram `user_id`.
- FR-06: After a successful save, the bot must reply to the owner in the same Telegram chat with
  a simple confirmation in the format:
  `✅ {Despesa|Receita} R${amount} — {category}` (for installments: `✅ Despesa R${amount}x{n} — {category}`).
- FR-07: If Gemini cannot parse the message as a financial transaction (e.g. greeting, question,
  unrecognizable text), the bot must reply with a help message showing usage examples in
  Brazilian Portuguese.
- FR-08: On application startup, the backend must automatically register the webhook URL with
  Telegram by calling the Telegram Bot API `setWebhook` method using the `TELEGRAM_WEBHOOK_URL`
  env var and the `TELEGRAM_WEBHOOK_SECRET`.
- FR-09: The backend must expose a `GET /health` endpoint returning `{"status": "ok"}` for
  the hosting provider's health check.

## Non-Functional Requirements
- NFR-01: The webhook endpoint must return an HTTP 200 response within Telegram's 5-second
  timeout. If Gemini or Firestore takes longer, the reply must still be attempted asynchronously
  (fire-and-forget the Telegram reply if needed).
- NFR-02: The endpoint must be served over HTTPS (enforced by your hosting provider; the app itself does not
  need to handle TLS).
- NFR-03: No credentials or secrets may be hardcoded; all are loaded from environment variables
  via python-dotenv.
- NFR-04: The Gemini prompt must explicitly instruct the model to respond only with structured
  data (JSON), never with free-form text, to make parsing deterministic.
- NFR-05: All Firestore and Telegram API calls must be `async/await`.

## Edge Cases
- EC-01: Abbreviated category names — "acad", "mec", "uber" — Gemini must infer the full
  category (saúde, transporte, etc.).
- EC-02: Amount as words — "quarenta e cinco reais", "cinquenta conto" — Gemini must parse to
  numeric float.
- EC-03: Income slang — "caiu o salário", "recebi o freela", "entrou o pix" — must be classified
  as `receita`.
- EC-04: Installment variations — "3x 150 sapato", "parcelei em 3x", "150 em 3 vezes" — must
  produce `installments: 3`.
- EC-05: Mixed case and extra whitespace — "  PAGUEI Academia 45  " — must be trimmed and
  normalized before sending to Gemini.
- EC-06: Message with only a number and no context — "45" — Gemini may return a best-guess
  despesa or flag as unparseable; bot must not crash either way.
- EC-07: Non-text message types (sticker, photo, voice, document) — the `text` field will be
  absent; must be treated the same as an unrecognized message (reply with help, no crash).
- EC-08: Very large amounts or negative values — "salario -500" — must be handled gracefully
  (treat negative as absolute value or flag as unparseable).
- EC-09: Duplicate rapid messages — user sends the same message twice quickly — both must be
  processed independently; no deduplication at this stage.

## Error Scenarios
- ES-01: **Gemini unavailable** — API call raises an exception or returns a non-200 status. Bot
  must reply: "⚠️ Não consegui processar sua mensagem agora. Tente novamente em instantes."
  Transaction must NOT be saved.
- ES-02: **Gemini returns unparseable JSON** — model responds with free text instead of valid JSON.
  Bot must fall back to the help message (same as FR-07) and log the raw Gemini response.
- ES-03: **Firestore write fails** — network error or permission denied. Bot must reply:
  "⚠️ Erro ao salvar a transação. Tente novamente." and log the error.
- ES-04: **Telegram reply fails** — `sendMessage` call raises an exception. Must log the error
  silently; the HTTP response to Telegram's webhook call must still be 200 to avoid retries.
- ES-05: **Invalid JSON in webhook payload** — FastAPI's Pydantic validation will reject it with
  HTTP 422; no special handling needed beyond the framework default.
- ES-06: **`setWebhook` fails on startup** — must log the error and continue starting the app
  (non-fatal); the endpoint will still be available for manual registration.
- ES-07: **`TELEGRAM_OWNER_ID` not set** — must raise a startup error (fail fast) so the app
  does not run in an insecure state that accepts all users.

## Acceptance Criteria
- [ ] AC-01: Sending "45 academia" from the owner's Telegram account saves a despesa of R$45.00
  in the `saúde` category and replies "✅ Despesa R$45.0 — saúde".
- [ ] AC-02: Sending "salario 5000" saves a receita of R$5000.00 in the `renda` category.
- [ ] AC-03: Sending "3x 150 sapato" saves a despesa of R$150.00 with `installments: 3` in the
  `vestuário` category.
- [ ] AC-04: Sending "oi tudo bem?" triggers the help message, with no transaction saved.
- [ ] AC-05: A request with a wrong or missing `X-Telegram-Bot-Api-Secret-Token` returns HTTP 403.
- [ ] AC-06: A message from a non-owner Telegram user ID returns HTTP 200 with no reply and no
  saved transaction.
- [ ] AC-07: A photo or sticker message from the owner triggers the help message, with no crash.
- [ ] AC-08: On app startup, the Telegram Bot API `setWebhook` is called with the correct URL
  and secret token.
- [ ] AC-09: `GET /health` returns `{"status": "ok"}` with HTTP 200.

## Definition of Done
The feature is working when: the owner can open Telegram, send any natural-language financial
message in informal Brazilian Portuguese, and within 5 seconds receive a confirmation reply with
the correctly parsed type, amount, and category — and the same transaction appears in Firestore
with the correct fields. Error and non-transaction messages produce the appropriate reply without
crashing the server.

## Out of Scope
- Multi-user support (other Telegram accounts logging their own transactions).
- Editing or deleting previously saved transactions via Telegram.
- Voice message transcription.
- Recurring transaction scheduling via Telegram.
- Dashboard / frontend (separate feature).
- Telegram group or channel support (DM only).
- Manual webhook registration (handled automatically on startup).
