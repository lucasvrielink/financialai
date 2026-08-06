# Requirements: Frontend Dashboard with Firebase Auth

## Overview
The frontend dashboard is a Next.js web application that allows the owner of the personal
finance bot to log in with their email and password, view all financial transactions recorded
by the Telegram bot, and log out. It is the primary visual interface for reviewing spending
and income data saved in Firestore. Authentication is handled exclusively via Firebase Auth
with email and password — no social login (Google, GitHub, etc.) is offered or planned.
The UI language is Brazilian Portuguese throughout.

---

## User Stories

- As a user, I want to open the dashboard and be redirected to a login page so that
  unauthenticated access to my financial data is prevented.
- As a user, I want to enter my email and password and click "Entrar" so that I can
  authenticate and access my transaction list.
- As a user, I want to see a clear error message in Portuguese when my credentials are wrong
  so that I know what went wrong and can try again.
- As a user, I want to be redirected to my transactions page immediately after a successful
  login so that I can start viewing my data without extra steps.
- As a user, I want to see all my transactions listed with their value, type, category,
  description, and date so that I have a full history of my finances.
- As a user, I want to distinguish despesas (expenses) from receitas (income) visually so
  that I can quickly understand the nature of each transaction.
- As a user, I want to see a loading state while transactions are being fetched from
  Firestore so that I know the page is working and not frozen.
- As a user, I want to see a friendly message when I have no transactions yet so that I know
  the page is working correctly, not broken.
- As a user, I want to click a "Sair" (logout) button so that I can end my session securely.
- As a user, I want to be redirected back to the login page after logging out so that the
  session is cleanly closed.
- As a user, I want the app to remember my session across page refreshes so that I do not
  have to log in every time I reload the page.

---

## Functional Requirements

- **FR-01:** The root path (`/`) must redirect authenticated users to `/transactions` and
  unauthenticated users to `/login`.
- **FR-02:** The `/login` page must present a form with two fields: "E-mail" and "Senha",
  and a submit button labeled "Entrar".
- **FR-03:** The login form must validate that both fields are non-empty before submitting.
  Client-side only; no server round-trip for empty fields.
- **FR-04:** On successful login, the app must redirect the user to `/transactions`.
- **FR-05:** On failed login, the app must display a human-readable error message in
  Portuguese below the form. The message must map Firebase Auth error codes to friendly text
  (see Error Scenarios).
- **FR-06:** Already-authenticated users who navigate to `/login` must be redirected to
  `/transactions` automatically.
- **FR-07:** The `/transactions` page must be protected: unauthenticated users who access
  this URL must be redirected to `/login`.
- **FR-08:** The `/transactions` page must fetch all transactions from the Firestore
  `transactions` collection that belong to the current user (`user_id` field), ordered by
  `created_at` descending (most recent first).
- **FR-09:** Each transaction row must display: amount (formatted as `R$ X.XXX,XX` in
  Brazilian locale), type label (`Despesa` / `Receita`), category, description, and date
  (formatted as `DD/MM/AAAA`).
- **FR-10:** Despesas must be visually distinct from receitas (e.g., red/green color
  coding or a badge/icon).
- **FR-11:** While transactions are loading, a loading indicator must be shown.
- **FR-12:** When there are no transactions, a placeholder message in Portuguese must be
  shown (e.g., "Nenhuma transação registrada ainda.").
- **FR-13:** The `/transactions` page must include a "Sair" button that calls Firebase Auth
  `signOut()` and redirects the user to `/login`.
- **FR-14:** Auth state must persist across page refreshes using Firebase Auth's built-in
  session persistence (default `LOCAL` persistence).
- **FR-15:** The app must not expose any Firebase Admin credentials to the browser. Only
  `NEXT_PUBLIC_` prefixed env vars are used on the frontend.

---

## Non-Functional Requirements

- **NFR-01:** The app must be a static export compatible with Static Site hosting deployment
  (`next export` / `output: 'export'` in `next.config.js`). No server-side rendering at
  runtime.
- **NFR-02:** All UI text must be in Brazilian Portuguese.
- **NFR-03:** Initial page load (login page) must feel responsive; no noticeable layout
  shift once Firebase initializes.
- **NFR-04:** The login form must not submit while a previous authentication request is
  in-flight (button disabled / loading state during request).
- **NFR-05:** The transaction list must display the most recent transactions first.
- **NFR-06:** Installment transactions must show the installment count (e.g.,
  `R$ 150,00 × 3`).
- **NFR-07:** The app must work in the latest versions of Chrome, Firefox, and Safari.
- **NFR-08:** No `console.error` or unhandled promise rejections in the browser for normal
  user flows.

---

## Edge Cases

- **EC-01:** User opens `/transactions` directly while not logged in → must redirect to
  `/login`, not show a flash of protected content.
- **EC-02:** User opens `/login` while already logged in → must redirect to `/transactions`
  without showing the login form.
- **EC-03:** Firebase Auth is slow to initialize on first load (the auth state is
  asynchronous). The app must wait for auth resolution before deciding to redirect or render
  content — no premature redirect to `/login` while auth is still loading.
- **EC-04:** Firestore query returns zero documents → show empty state message, not an error.
- **EC-05:** A transaction document in Firestore is missing optional fields (e.g., no
  `description`) → display a safe fallback ("—") instead of crashing.
- **EC-06:** User submits the login form with leading/trailing whitespace in the email field
  → trim the email before calling Firebase Auth.
- **EC-07:** User double-clicks "Entrar" → second submission must be ignored while the
  first request is in-flight.
- **EC-08:** User's Firebase Auth session token expires while viewing `/transactions` →
  Firebase SDK will sign the user out; the auth listener must catch this and redirect to
  `/login`.
- **EC-09:** The `transactions` collection contains documents owned by other `user_id`
  values (if the app ever becomes multi-user). The Firestore query must filter by the
  authenticated user's UID to show only their data.
- **EC-10:** Browser has JavaScript disabled → static export will not work at all; this is
  accepted as out of scope (SPA limitation).

---

## Error Scenarios

- **ES-01:** Firebase Auth — wrong password (`auth/wrong-password`): display "Senha
  incorreta. Tente novamente."
- **ES-02:** Firebase Auth — user not found (`auth/user-not-found`): display "Nenhuma
  conta encontrada com este e-mail."
- **ES-03:** Firebase Auth — invalid email format (`auth/invalid-email`): display "E-mail
  inválido."
- **ES-04:** Firebase Auth — too many failed attempts (`auth/too-many-requests`): display
  "Muitas tentativas. Aguarde alguns minutos e tente novamente."
- **ES-05:** Firebase Auth — network error during login (no internet / Firebase
  unreachable): display "Erro de conexão. Verifique sua internet e tente novamente."
- **ES-06:** Firebase Auth — generic / unexpected error code: display "Erro ao entrar.
  Tente novamente." (do not expose raw Firebase error codes to the user).
- **ES-07:** Firestore — permission denied when querying transactions (Firestore Security
  Rules block the read): show an error banner "Erro ao carregar transações. Tente
  recarregar a página." Do not crash the page.
- **ES-08:** Firestore — network error during transaction fetch (no internet after login):
  show error banner "Erro de conexão ao carregar transações." with a retry option or
  instructions to reload.
- **ES-09:** Firebase Auth — `signOut()` fails: log the error silently and still redirect
  to `/login` (from the user's perspective, logout should always succeed visually).
- **ES-10:** Missing or invalid `NEXT_PUBLIC_FIREBASE_*` env vars at build time: the
  Firebase client initialization will throw; the build or first load should surface a
  meaningful console error. This is a deployment configuration error, not a user-facing error.

---

## Acceptance Criteria

- [ ] **AC-01:** Navigating to `/` redirects unauthenticated users to `/login`.
- [ ] **AC-02:** Navigating to `/transactions` while unauthenticated redirects to `/login`.
- [ ] **AC-03:** The `/login` page renders a form with e-mail field, password field, and
  "Entrar" button — all labeled in Portuguese.
- [ ] **AC-04:** Submitting with empty fields shows a client-side validation message without
  making a Firebase request.
- [ ] **AC-05:** Logging in with valid credentials redirects to `/transactions`.
- [ ] **AC-06:** Logging in with a wrong password shows "Senha incorreta. Tente novamente."
- [ ] **AC-07:** Logging in with an unregistered email shows "Nenhuma conta encontrada com
  este e-mail."
- [ ] **AC-08:** The login button is disabled while the auth request is in-flight.
- [ ] **AC-09:** After login, `/transactions` shows a loading indicator while fetching data.
- [ ] **AC-10:** After fetching, each transaction row shows amount, type, category,
  description, and date formatted correctly in Brazilian Portuguese conventions.
- [ ] **AC-11:** Despesas appear with a visual distinction from receitas (color or badge).
- [ ] **AC-12:** When no transactions exist, the page shows "Nenhuma transação registrada
  ainda." (or equivalent Portuguese empty state).
- [ ] **AC-13:** Clicking "Sair" signs the user out and redirects to `/login`.
- [ ] **AC-14:** Refreshing the page while on `/transactions` (with a valid session) keeps
  the user on `/transactions` — no redirect to `/login`.
- [ ] **AC-15:** A Firestore fetch error shows an error message in Portuguese, not a crash.

---

## Definition of Done

The feature is working when:
1. A developer can open the deployed URL, land on `/login`, enter valid
   Firebase Auth credentials, and see their real transaction list loaded from Firestore.
2. Entering incorrect credentials shows a friendly Portuguese error message.
3. Clicking "Sair" returns the developer to `/login` and navigating back to `/transactions`
   redirects to `/login` again.
4. Refreshing the page while authenticated stays on `/transactions`.
5. All acceptance criteria above are checked off.

---

## Out of Scope

- Social login (Google, GitHub, Apple, etc.) — email/password only.
- User registration flow (creating new accounts from the dashboard).
- Password reset / "Esqueci minha senha" flow.
- Transaction creation, editing, or deletion from the dashboard.
- Transaction filtering, sorting, or searching.
- Pagination (load all transactions in one query for now).
- Charts or analytics views.
- Multi-user support (dashboard is for the single bot owner).
- Push notifications or real-time transaction updates (Firestore `onSnapshot`).
- Mobile-native app (web only).
- Dark mode.
- Backend API changes (the dashboard reads Firestore directly via the Client SDK).
