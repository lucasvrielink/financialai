# Tasks: Frontend Dashboard with Firebase Auth

## Setup Tasks (manual — do these first)

- [x] **SETUP-01:** In the Firebase Console, enable **Email/Password** sign-in method under
  Authentication → Sign-in method. Confirm no social providers are enabled.

- [x] **SETUP-02:** In the Firebase Console, create a test user under Authentication → Users
  with the owner's email and a strong password. This account will be used to log into the
  dashboard.

- [x] **SETUP-03:** In the Firebase Console, go to Firestore → Indexes and create a
  **Composite Index** on the `transactions` collection:
  - Field 1: `user_id` — Ascending
  - Field 2: `created_at` — Descending
  - Query scope: Collection
  This index is required for the `where('user_id', '==', ...) + orderBy('created_at', 'desc')`
  query to work without throwing a Firestore missing-index error.

- [x] **SETUP-04:** Resolve the `user_id` identity mapping issue flagged in design.md.
  Add `FIREBASE_OWNER_UID` to `backend/.env` (the Firebase Auth UID of the owner account
  created in SETUP-02). Update the backend's `firestore.py` to write `user_id` as the
  Firebase Auth UID rather than the Telegram numeric ID. This ensures Firestore Security
  Rules can match `resource.data.user_id == request.auth.uid`.
  - Depends on: SETUP-02

- [x] **SETUP-05:** In the Firebase Console, set the Firestore Security Rules to allow
  authenticated reads where `user_id == request.auth.uid`, and deny all writes from the
  client:
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /transactions/{txId} {
        allow read: if request.auth != null
                    && resource.data.user_id == request.auth.uid;
        allow write: if false;
      }
    }
  }
  ```
  During development (before SETUP-04 is done), temporarily use `allow read: if request.auth != null;`.
  - Depends on: SETUP-04 (for production rules)

- [x] **SETUP-06:** Collect the three Firebase Client SDK config values from the Firebase
  Console (Project Settings → General → Your apps → Web app → SDK setup and configuration):
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  Create `frontend/.env.local` with these values. **Do not commit this file.**

- [x] **SETUP-07:** Initialize the Next.js project in `frontend/` by running:
  ```bash
  cd frontend
  npx create-next-app@latest . --typescript --app --no-src-dir --eslint --no-tailwind --import-alias "@/*"
  ```
  Then install the Firebase SDK:
  ```bash
  npm install firebase
  ```
  Confirm `package.json`, `tsconfig.json`, and `next.config.js` (or `.ts`) exist after setup.

- [x] **SETUP-08:** In your deployment dashboard, add the three
  `NEXT_PUBLIC_FIREBASE_*` environment variables to the Static Site service. These are baked
  into the bundle at build time and must be present before any deploy.

- [x] **SETUP-09:** Configure the Static Site hosting SPA fallback: add a rewrite rule that
  redirects all requests matching `/*` to `/index.html` with HTTP status 200. Without this,
  direct navigation to `/transactions` returns a 404.

---

## Frontend Tasks

- [x] **FE-01:** Configure `frontend/next.config.js` for static export.
  - Set `output: 'export'` and `images: { unoptimized: true }`.
  - Verify `npm run build` produces an `out/` directory with no errors.
  - Depends on: SETUP-07

- [x] **FE-02:** Create `frontend/src/lib/firebase/client.ts`.
  - Initialize Firebase app (guard against double-init with `getApps()` check).
  - Export `auth` (`getAuth(app)`) and `db` (`getFirestore(app)`).
  - Read all config from `NEXT_PUBLIC_*` env vars.
  - Depends on: SETUP-06, SETUP-07

- [x] **FE-03:** Create `frontend/src/types/transaction.ts`.
  - Define `Transaction` interface (fields: `id`, `user_id`, `type`, `amount`, `category`,
    `description`, `installments`, `raw_message`, `created_at`).
  - Define `AuthState` union type (`loading` / `authenticated` / `unauthenticated`).
  - Depends on: nothing

- [x] **FE-04:** Create `frontend/src/lib/firebase/authErrors.ts`.
  - Implement `mapAuthError(code: string): string` using a `Record<string, string>` lookup
    table covering all error codes listed in design.md.
  - Include a default fallback for unknown codes.
  - Depends on: nothing

- [x] **FE-05:** Create `frontend/src/contexts/AuthContext.tsx`.
  - `'use client'` directive.
  - `AuthContext` with initial value `{ status: 'loading' }`.
  - `AuthProvider` that subscribes to `onAuthStateChanged(auth, ...)` in `useEffect([])` and
    updates state. Unsubscribes on unmount.
  - `useAuth()` hook that throws if used outside provider.
  - Depends on: FE-02, FE-03

- [x] **FE-06:** Create `frontend/src/components/AuthGuard.tsx`.
  - `'use client'` directive.
  - Reads `authState` from `useAuth()`.
  - Renders spinner while `status === 'loading'`.
  - Calls `router.replace('/login')` and renders `null` while `status === 'unauthenticated'`.
  - Renders `{children}` when `status === 'authenticated'`.
  - Depends on: FE-05

- [x] **FE-07:** Create `frontend/src/app/layout.tsx`.
  - Root layout: wraps `{children}` with `<AuthProvider>`.
  - Sets `<html lang="pt-BR">`.
  - Sets metadata title "Finanças Pessoais".
  - Imports any global CSS baseline (or minimal reset styles).
  - Depends on: FE-05

- [x] **FE-08:** Create `frontend/src/app/page.tsx` (root redirect).
  - `'use client'` directive.
  - Reads `authState` from `useAuth()`.
  - `useEffect` on `authState.status`: `authenticated` → `router.replace('/transactions')`;
    `unauthenticated` → `router.replace('/login')`; `loading` → do nothing.
  - Renders a centered "Carregando…" spinner.
  - Depends on: FE-05

- [x] **FE-09:** Create `frontend/src/app/login/page.tsx`.
  - `'use client'` directive.
  - State: `email`, `password`, `error`, `loading`.
  - On mount: if already authenticated, redirect to `/transactions`.
  - Form with: e-mail input, senha input, error paragraph (conditional), submit button
    ("Entrar" / "Entrando…" disabled while loading).
  - `handleSubmit`: trim email, validate non-empty, call
    `signInWithEmailAndPassword(auth, email.trim(), password)`, map `FirebaseError` codes
    to Portuguese using `mapAuthError()`.
  - Depends on: FE-02, FE-04, FE-05

- [x] **FE-10:** Create `frontend/src/app/transactions/page.tsx`.
  - `'use client'` directive.
  - Wrapped with `<AuthGuard>` at the top of the render.
  - State: `transactions: Transaction[]`, `fetchState`, `errorMessage`.
  - `useEffect` triggered when auth is `authenticated`: runs `fetchTransactions(uid)`.
  - `fetchTransactions`: Firestore query `where('user_id', '==', uid) + orderBy('created_at', 'desc')`;
    maps `DocumentSnapshot` to `Transaction` (convert Timestamp → Date, default missing fields
    to safe fallbacks).
  - Error handling: map Firestore `FirebaseError` codes to Portuguese banners (see design.md).
  - Render: header ("Minhas Transações" + "Sair" button), then loading / error / empty / list states.
  - Each row: amount formatted with `toLocaleString('pt-BR', ...)` + installments suffix,
    type badge (color-coded), category, description (fallback "—"), date via
    `toLocaleDateString('pt-BR')`.
  - Logout: `signOut(auth).catch(() => {})` then `router.replace('/login')`.
  - Depends on: FE-02, FE-03, FE-05, FE-06

- [x] **FE-11:** Add basic CSS styling.
  - Minimal styles for: page centering, login card, transaction list/table, type badges
    (red for despesa, green for receita), loading spinner, error banner, empty state.
  - Use CSS Modules (`.module.css`) or a global `globals.css` — no external CSS framework.
  - Applies to: login page, transactions page, AuthGuard spinner.
  - Depends on: FE-09, FE-10

---

## Verification Checklist

- [x] `npm run build` in `frontend/` completes without TypeScript errors or Next.js warnings,
  and produces an `out/` directory.
- [x] Opening `out/index.html` locally (or the deployed URL) redirects to `/login`
  when not authenticated.
- [x] The `/login` page renders the form with all labels in Portuguese.
- [x] Submitting the login form with empty fields shows a client-side validation message
  without a network request (check browser DevTools Network tab).
- [x] Logging in with invalid credentials shows the correct Portuguese error message
  (test at least: wrong password, unregistered email).
- [x] Logging in with valid credentials (SETUP-02 user) redirects to `/transactions`.
- [x] The `/transactions` page shows a loading indicator while the Firestore query is
  running.
- [x] After loading, real transactions saved by the Telegram bot appear in the list,
  ordered from most recent to oldest.
- [x] Each transaction row shows: formatted amount (e.g., `R$ 45,00`), type badge, category,
  description, and date in `DD/MM/AAAA` format.
- [x] Installment transactions show the `× N` suffix on the amount.
- [x] Despesas display with red styling; receitas display with green styling.
- [x] When no transactions exist for the user, "Nenhuma transação registrada ainda." is shown.
- [x] Clicking "Sair" redirects to `/login`.
- [x] After clicking "Sair", navigating to `/transactions` redirects back to `/login`.
- [x] Refreshing the browser while on `/transactions` (with a valid session) keeps the user
  on `/transactions` — no unwanted redirect to `/login`.
- [x] Directly navigating to `/transactions` (typing the URL in the browser) while
  unauthenticated redirects to `/login`.
- [x] The Firestore Security Rules block unauthenticated reads (verify in Firebase Console
  → Firestore → Rules playground).
- [x] No Firebase Admin credentials appear in the browser bundle (check `out/` files for any
  private key strings).
