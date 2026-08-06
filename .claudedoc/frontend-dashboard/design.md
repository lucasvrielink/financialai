# Design: Frontend Dashboard with Firebase Auth

## Overview

The dashboard is a Next.js 14 application using the App Router, deployed as a fully static
export on Static Site hosting. All auth and data access happens client-side via the Firebase
Client SDK — no backend changes are needed. Auth state is managed through a React Context
provider that wraps the app and listens to `onAuthStateChanged`. Protected routes check auth
state before rendering; unauthenticated users are redirected to `/login`. Firestore reads are
performed with the Firebase Client SDK using a query filtered by `user_id == auth.currentUser.uid`,
ordered by `created_at` descending. The root page (`/`) redirects based on auth state.
There is no server-side rendering at runtime — all dynamic behavior (auth checks, Firestore
reads) happens in the browser after hydration.

---

## Backend — Files to Create
_None — this feature requires no backend changes._

## Backend — Files to Modify
_None._

---

## Frontend — Files to Create

| File | Purpose |
|---|---|
| `frontend/src/lib/firebase/client.ts` | Initialize Firebase Client SDK app, export `auth` and `db` singletons |
| `frontend/src/contexts/AuthContext.tsx` | React Context + Provider that tracks `onAuthStateChanged`; exports `useAuth()` hook |
| `frontend/src/components/AuthGuard.tsx` | Client component that wraps protected pages; redirects to `/login` while unauthenticated; shows nothing (or spinner) while auth is loading |
| `frontend/src/app/layout.tsx` | Root layout — wraps children with `AuthProvider`; sets `<html lang="pt-BR">` and metadata |
| `frontend/src/app/page.tsx` | Root redirect page — uses `useAuth()` to send authenticated users to `/transactions`, unauthenticated to `/login`; shows spinner while auth loads |
| `frontend/src/app/login/page.tsx` | Login page — email/password form, Firebase `signInWithEmailAndPassword`, error mapping to Portuguese, redirect on success |
| `frontend/src/app/transactions/page.tsx` | Protected transactions list — wrapped in `AuthGuard`; fetches Firestore `transactions` filtered by `user_id`; renders table/list with loading and empty states; includes logout button |
| `frontend/src/types/transaction.ts` | TypeScript interface `Transaction` and related types |
| `frontend/next.config.js` | `output: 'export'` for static build; disables image optimization (incompatible with static export) |
| `frontend/package.json` | Dependencies: `next`, `react`, `react-dom`, `firebase`, `typescript`, `@types/react`, `@types/node` |
| `frontend/tsconfig.json` | Standard Next.js TypeScript config with strict mode |
| `frontend/.env.local` | (not committed) `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |

---

## TypeScript Interfaces

```typescript
// frontend/src/types/transaction.ts

export interface Transaction {
  id: string;                           // Firestore document ID
  user_id: string;                      // Telegram user ID (string)
  type: 'despesa' | 'receita';
  amount: number;                       // positive float (R$)
  category: string;                     // lowercase PT category name
  description: string;
  installments: number;                 // integer >= 1
  raw_message: string;
  created_at: Date;                     // converted from Firestore Timestamp
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: import('firebase/auth').User }
  | { status: 'unauthenticated' };
```

---

## Firestore Schema (read-only, no changes)

**Collection:** `transactions`

```
transactions/{auto-id}
{
  user_id:      string    — str(Telegram owner user ID)
  type:         string    — "despesa" | "receita"
  amount:       number    — positive float (R$)
  category:     string    — lowercase PT category name
  description:  string
  installments: number    — integer >= 1
  raw_message:  string
  created_at:   Timestamp — Firestore server timestamp
}
```

**Query strategy:**

```typescript
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';

const q = query(
  collection(db, 'transactions'),
  where('user_id', '==', currentUser.uid),   // filter to current user's data
  orderBy('created_at', 'desc')               // most recent first
);
const snapshot = await getDocs(q);
```

Note: This composite query (`where` + `orderBy` on different fields) requires a Firestore
composite index on `(user_id ASC, created_at DESC)`. The index must be created in the
Firebase Console or via `firestore.indexes.json` before the dashboard will work in production.

---

## Auth Flow

```
Browser opens any URL
       │
       ▼
AuthProvider mounts → calls onAuthStateChanged → status: 'loading'
       │
       ├─ Firebase resolves → user found ─────────────────────────────► status: 'authenticated'
       │                                                                        │
       └─ Firebase resolves → no user ──────────────────────────────► status: 'unauthenticated'

status: 'loading'
  → all pages show a full-page spinner / blank screen (no redirect yet)

status: 'unauthenticated' AND on /transactions
  → AuthGuard redirects to /login

status: 'authenticated' AND on /login
  → login/page.tsx useEffect redirects to /transactions

status: 'authenticated' AND on /transactions
  → AuthGuard renders children; page fetches Firestore data

Login form submit:
  signInWithEmailAndPassword(auth, email.trim(), password)
  → success: onAuthStateChanged fires → redirect to /transactions
  → failure: map FirebaseError.code to Portuguese message (see Error Handling)

Logout:
  signOut(auth)
  → always redirect to /login regardless of whether signOut() throws
```

---

## File-by-file Implementation Detail

### `frontend/src/lib/firebase/client.ts`

```typescript
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:     process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
};

// Guard against duplicate initialization in development (React StrictMode double-mounts)
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
```

### `frontend/src/contexts/AuthContext.tsx`

- `'use client'` directive.
- Creates `AuthContext` with initial value `{ status: 'loading' }`.
- `AuthProvider` component calls `onAuthStateChanged(auth, callback)` in a `useEffect`
  (dependency array `[]`). On each callback: set state to `{ status: 'authenticated', user }`
  or `{ status: 'unauthenticated' }`.
- Unsubscribes from the listener on unmount (return value of `onAuthStateChanged`).
- Exports `useAuth()` hook that reads the context; throws if used outside `AuthProvider`.

### `frontend/src/components/AuthGuard.tsx`

- `'use client'` directive.
- Reads `authState` from `useAuth()`.
- If `status === 'loading'`: render a full-page centered spinner (e.g., a simple CSS
  animation or text "Carregando…").
- If `status === 'unauthenticated'`: call `router.replace('/login')` in a `useEffect` and
  render `null` (no flash of content).
- If `status === 'authenticated'`: render `{children}`.

### `frontend/src/app/page.tsx`

- `'use client'` directive.
- Reads `authState` from `useAuth()`.
- `useEffect` on `authState.status`:
  - `'loading'`: do nothing.
  - `'authenticated'`: `router.replace('/transactions')`.
  - `'unauthenticated'`: `router.replace('/login')`.
- Renders a centered spinner while deciding.

### `frontend/src/app/login/page.tsx`

- `'use client'` directive.
- Local state: `email: string`, `password: string`, `error: string | null`,
  `loading: boolean`.
- On mount: if `authState.status === 'authenticated'`, `router.replace('/transactions')`.
- `handleSubmit`:
  1. `e.preventDefault()`
  2. Validate non-empty (client-side); set `error` if blank.
  3. Set `loading = true`, clear `error`.
  4. Call `signInWithEmailAndPassword(auth, email.trim(), password)`.
  5. On success: `router.replace('/transactions')` (or let `onAuthStateChanged` trigger root redirect).
  6. On `FirebaseError`: map `.code` to Portuguese message (see Error Handling); set `error`.
  7. Finally: `loading = false`.
- Render: centered card with title "Entrar", two `<input>` fields, error paragraph (if
  `error`), submit `<button>` (disabled while `loading`, text "Entrar" / "Entrando…").

### `frontend/src/app/transactions/page.tsx`

- `'use client'` directive (needs auth state and Firestore).
- Wrapped with `<AuthGuard>` inside the component render.
- Local state: `transactions: Transaction[]`, `fetchState: 'loading' | 'error' | 'done'`,
  `errorMessage: string | null`.
- `useEffect` that runs when `authState.status === 'authenticated'`: calls
  `fetchTransactions(user.uid)`.
- `fetchTransactions(uid)`:
  - Set `fetchState = 'loading'`.
  - Execute Firestore query (see above).
  - Map each `DocumentSnapshot` → `Transaction` (convert `Timestamp` to `Date`; fall back
    missing fields to safe defaults).
  - On success: `setTransactions(results)`, `fetchState = 'done'`.
  - On `FirebaseError` with code `permission-denied`: `errorMessage = "Sem permissão para ler as transações."`, `fetchState = 'error'`.
  - On other errors: `errorMessage = "Erro ao carregar transações. Tente recarregar a página."`, `fetchState = 'error'`.
- Render layout:
  - Header: "Minhas Transações" title + "Sair" button (right-aligned).
  - `fetchState === 'loading'`: loading indicator.
  - `fetchState === 'error'`: error banner with `errorMessage`.
  - `fetchState === 'done'` and `transactions.length === 0`: empty state message.
  - `fetchState === 'done'` and `transactions.length > 0`: transaction list/table.
- Each transaction row:
  - Amount: `amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })` +
    installments suffix if `installments > 1` (` × N`).
  - Type badge: "Despesa" (red) / "Receita" (green).
  - Category: capitalized display.
  - Description: raw string, fallback "—" if empty.
  - Date: `created_at.toLocaleDateString('pt-BR')`.
- Logout handler: `await signOut(auth).catch(() => {})` then `router.replace('/login')`.

### `frontend/next.config.js`

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },   // required for static export
};

module.exports = nextConfig;
```

---

## Error Handling

### Login page — Firebase Auth error code mapping

| Firebase error code | Portuguese message |
|---|---|
| `auth/wrong-password` | "Senha incorreta. Tente novamente." |
| `auth/user-not-found` | "Nenhuma conta encontrada com este e-mail." |
| `auth/invalid-email` | "E-mail inválido." |
| `auth/invalid-credential` | "Credenciais inválidas. Verifique e-mail e senha." |
| `auth/too-many-requests` | "Muitas tentativas. Aguarde alguns minutos e tente novamente." |
| `auth/network-request-failed` | "Erro de conexão. Verifique sua internet e tente novamente." |
| _(any other code)_ | "Erro ao entrar. Tente novamente." |

Implementation: a `mapAuthError(code: string): string` function in
`frontend/src/lib/firebase/authErrors.ts` with a `Record<string, string>` lookup and a
default fallback.

### Transactions page — Firestore error handling

| Scenario | UI response |
|---|---|
| `FirebaseError` `permission-denied` | Error banner: "Sem permissão para ler as transações." |
| `FirebaseError` `unavailable` / network | Error banner: "Erro de conexão ao carregar transações." |
| Any other error | Error banner: "Erro ao carregar transações. Tente recarregar a página." |
| Zero results (not an error) | Empty state: "Nenhuma transação registrada ainda." |

### Logout error handling

`signOut()` errors are swallowed silently (`catch(() => {})`). The redirect to `/login`
happens regardless. The user will see the login page; if their session was actually still
valid, revisiting `/transactions` would bounce them back — acceptable edge case.

---

## Firestore Security Rules (required, must be set in Firebase Console)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /transactions/{txId} {
      allow read: if request.auth != null
                  && resource.data.user_id == request.auth.uid;
      allow write: if false;  // only backend writes via Admin SDK
    }
  }
}
```

Note: The `user_id` field stored by the backend is currently the Telegram user's numeric ID
converted to a string (`str(telegram_user_id)`), NOT the Firebase Auth UID. This means the
Firestore Security Rule `resource.data.user_id == request.auth.uid` will NOT match unless
you either:
- (a) Update the backend to store the Firebase Auth UID as `user_id`, or
- (b) Store the Telegram-to-Firebase mapping in a `users` collection and do a server-side
  join, or
- (c) Use a single known Firebase UID for the bot owner and hard-code the Telegram ID
  mapping.

**Recommended resolution for a single-owner bot:** Store a `telegram_user_id` field
separately and keep `user_id` as the Firebase Auth UID of the bot owner. The bot should
always write with the owner's Firebase UID. This requires passing the owner Firebase UID
to the backend as an env var (`FIREBASE_OWNER_UID`). **This is a cross-feature concern and
is flagged here as a design dependency; it must be resolved before Firestore Security Rules
can enforce per-user reads.**

For initial development, Firestore rules can temporarily allow read for any authenticated
user while the identity mapping is resolved:
```
allow read: if request.auth != null;
```

---

## Security Notes

- Never import or use `firebase-admin` in the frontend. Admin SDK is backend-only.
- All Firebase Client SDK config keys (`NEXT_PUBLIC_*`) are safe to expose in the browser —
  they identify the Firebase project, not grant admin access. Firestore Security Rules
  enforce access control.
- Do not store the user's password in any state variable beyond the transient login form
  controlled input. Password state should be cleared on any navigation.
- Auth persistence is `browserLocalStorage` by default in the Firebase Client SDK
  (`indexedDB`-backed). No extra configuration needed.
- The Firestore query filters by `user_id` client-side AND Firestore Security Rules enforce
  it server-side (once `user_id` identity mapping is resolved).

---

## API Contract

No new backend API endpoints. All frontend-to-data communication goes directly through the
Firebase Client SDK:

| Operation | SDK call |
|---|---|
| Login | `signInWithEmailAndPassword(auth, email, password)` |
| Observe auth state | `onAuthStateChanged(auth, callback)` |
| Logout | `signOut(auth)` |
| Fetch transactions | `getDocs(query(collection(db, 'transactions'), where(...), orderBy(...)))` |

---

## Deployment Notes

- Static Site hosting settings: root `/frontend`, build command `npm run build`, publish
  dir `out`.
- All `NEXT_PUBLIC_*` env vars must be set in your hosting provider's environment panel before
  building — they are baked into the static bundle at build time.
- Because the app uses client-side routing, The server must be configured to serve `index.html`
  for all paths (SPA fallback / rewrite rule): redirect all `/*` to `/index.html` with
  status 200. Without this, direct navigation to `/transactions` returns a 404.
