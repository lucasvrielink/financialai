# Requirements: Dashboard Completo com KPIs, Gráficos e Auto-refresh

## Overview
This feature upgrades the existing basic transaction list at `/transactions` into a full
financial dashboard. The page gains four prominent KPI cards (total receitas, total despesas,
saldo, and transaction count), two charts (spending breakdown by category and income vs.
expenses over time by month), a period filter (current month / last 3 months / last 6 months /
all time), and automatic data refresh every 30 seconds — so new transactions sent via the
Telegram bot appear without the user having to reload the page. The existing transaction list
is preserved below the new sections. All UI text is in Brazilian Portuguese. No backend changes
are required; all data is read directly from Firestore via the Firebase Client SDK.

---

## User Stories

- As a user, I want to see my total receitas, total despesas, saldo, and transaction count at
  a glance so that I can immediately understand my financial position.
- As a user, I want to see a chart of my spending broken down by category so that I can
  identify where my money is going.
- As a user, I want to see a chart comparing my income versus expenses month by month so that
  I can spot trends over time.
- As a user, I want to filter all dashboard data by a time period (this month, last 3 months,
  last 6 months, or all time) so that I can analyze different time windows without navigating
  away.
- As a user, I want the dashboard to refresh automatically every 30 seconds so that
  transactions I send via Telegram appear without me having to reload the page.
- As a user, I want to see a friendly empty state when I have no transactions in the selected
  period so that I know the dashboard is working, not broken.
- As a user, I want to keep using the detailed transaction list I already have so that I can
  audit individual entries.
- As a user, I want to click "Sair" and be logged out as before so that I can end my session.

---

## Functional Requirements

- **FR-01:** The page must display four KPI cards at the top: **Total Receitas** (sum of all
  `receita` transactions), **Total Despesas** (sum of all `despesa` transactions), **Saldo**
  (receitas − despesas), and **Transações** (count of transactions in the selected period).
- **FR-02:** All KPI values must respect the active period filter.
- **FR-03:** The **Saldo** KPI must be visually highlighted as positive (green) when ≥ 0 and
  negative (red) when < 0.
- **FR-04:** Below the KPIs, the page must show a **period filter** control with four options:
  `Este mês`, `Últimos 3 meses`, `Últimos 6 meses`, `Todo o período`. Default selection is
  `Este mês`.
- **FR-05:** Changing the period filter must instantly recompute all KPIs, charts, and the
  transaction list without re-fetching from Firestore.
- **FR-06:** Below the period filter, the page must show a **spending-by-category chart**
  (bar or pie) that breaks down total `despesa` amounts by `category` for the selected period.
  Only categories with at least one despesa are included.
- **FR-07:** Below or beside the category chart, the page must show a **monthly income vs.
  expenses chart** (bar or line) that groups `receita` and `despesa` totals by calendar month
  for the selected period. The x-axis shows month labels (e.g., "Jan/25", "Fev/25").
- **FR-08:** The dashboard must automatically re-fetch all transactions from Firestore every
  **30 seconds**. The interval must be cleared when the component unmounts.
- **FR-09:** Auto-refresh must not reset the active period filter or cause visible flicker if
  the data has not changed.
- **FR-10:** The existing transaction list must remain below the charts, filtered by the
  active period, ordered by `created_at` descending.
- **FR-11:** Each transaction row retains its current display: amount, type badge, category,
  description, date (all in Brazilian Portuguese formatting).
- **FR-12:** While the initial data load is in progress, a full-page loading spinner must be
  shown (reusing the existing `.spinner-page` / `.spinner` CSS).
- **FR-13:** If a Firestore fetch fails (initial or refresh), an error banner must be shown in
  Portuguese. The period filter and any previously loaded data remain accessible.
- **FR-14:** The "Sair" button must continue to work as before: call `signOut()` and redirect
  to `/login`.
- **FR-15:** The page header title changes to "Meu Painel Financeiro" (replacing "Minhas
  Transações").

---

## Non-Functional Requirements

- **NFR-01:** The page must remain a static export (`output: 'export'`). No server-side
  rendering. All logic runs in the browser.
- **NFR-02:** All UI text must be in Brazilian Portuguese.
- **NFR-03:** Charts must use the **Recharts** library only. No other charting dependency.
- **NFR-04:** Styling must use pure CSS only — no Tailwind, no CSS-in-JS, no external
  component library. New class names must follow the BEM-like convention used in `globals.css`.
- **NFR-05:** Period filtering must be computed client-side (JavaScript `Date` arithmetic on
  the in-memory transaction array). No extra Firestore query per filter change.
- **NFR-06:** KPI computations must use `useMemo` so they do not recalculate on unrelated
  re-renders.
- **NFR-07:** Auto-refresh must use `setInterval` inside a `useEffect` with proper cleanup
  (`clearInterval` on unmount).
- **NFR-08:** Currency amounts must be formatted as `R$ X.XXX,XX` using
  `Intl.NumberFormat` or `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`.
- **NFR-09:** The dashboard must not break existing auth flows: `AuthGuard`, `AuthContext`,
  and `useAuth()` must remain unchanged.
- **NFR-10:** Chart components must handle an empty data array gracefully (render a placeholder
  message, not a crashed component).

---

## Edge Cases

- **EC-01:** No transactions at all (new user or empty Firestore collection) — KPI cards
  must show R$ 0,00 / 0 with no error. Charts must display a "Sem dados para exibir"
  placeholder instead of rendering broken axes.
- **EC-02:** All transactions are `despesa` (zero receitas) — `Total Receitas` shows R$ 0,00,
  `Saldo` is negative. Charts must not crash when the receitas series is all-zero.
- **EC-03:** All transactions are `receita` (zero despesas) — the category chart (despesas
  only) must show "Sem dados para exibir" while the monthly chart renders the receitas bars
  normally.
- **EC-04:** Negative saldo — the Saldo KPI card must use red color treatment, matching the
  `type-badge--despesa` convention.
- **EC-05:** Only one month of data — the monthly chart must render with a single bar/column
  group and not crash due to axis range issues.
- **EC-06:** A single category accounts for 100% of despesas — the category chart must render
  one bar/slice without visual errors.
- **EC-07:** Auto-refresh fires while the user is interacting with the period filter — the
  filter selection must not reset; only the underlying data store updates.
- **EC-08:** Auto-refresh fires while a previous fetch is still in-flight — the new fetch
  request must be skipped (or the in-flight request cancelled/ignored) to avoid a race
  condition.
- **EC-09:** `created_at` field is missing or malformed on a Firestore document — the
  transaction must be mapped with `created_at = new Date()` as a safe fallback (already
  handled in existing code) and not cause the period filter to crash.
- **EC-10:** The selected period is "Este mês" at the very start of the month (day 1) —
  the filter must include the entire current day.
- **EC-11:** User changes the period filter rapidly multiple times — KPIs and charts must
  update synchronously on each change with no debounce delay needed (pure client-side
  computation is fast enough).
- **EC-12:** Recharts receives a `data` prop of `[]` — verify the library does not throw;
  wrap in a conditional render showing a placeholder.

---

## Error Scenarios

- **ES-01:** **Firestore unavailable on initial load** — show the existing error banner
  ("Erro de conexão ao carregar transações."). KPI cards and charts are not rendered.
  Auto-refresh continues to retry every 30 seconds.
- **ES-02:** **Firestore permission-denied on initial load** — show "Sem permissão para
  ler as transações." banner. Do not retry automatically (permission errors are not transient).
- **ES-03:** **Firestore fetch fails on auto-refresh** — show or update the error banner
  with "Erro ao atualizar dados. Tentativa automática em 30 segundos." Previously loaded
  data (if any) must remain visible.
- **ES-04:** **Network drops mid-session** — the auto-refresh will fail with a Firestore
  `unavailable` error; ES-03 handling applies. When the network recovers, the next
  auto-refresh interval will succeed and clear the error banner.
- **ES-05:** **`signOut()` fails** — log silently and redirect to `/login` anyway (existing
  behavior, unchanged).
- **ES-06:** **Recharts fails to render** (unexpected runtime error in chart component) —
  the chart should be wrapped in an error boundary or a try/catch render guard that shows
  "Erro ao exibir gráfico." without crashing the entire page.

---

## Acceptance Criteria

- [ ] **AC-01:** The page header shows "Meu Painel Financeiro".
- [ ] **AC-02:** Four KPI cards are displayed at the top: Total Receitas, Total Despesas,
  Saldo, Transações.
- [ ] **AC-03:** KPI values correctly reflect the sum/count of transactions in the selected
  period.
- [ ] **AC-04:** The Saldo card displays green text/border when saldo ≥ 0 and red when < 0.
- [ ] **AC-05:** A period filter control shows four options and defaults to "Este mês".
- [ ] **AC-06:** Switching the period filter immediately updates KPIs, charts, and the
  transaction list without a loading spinner.
- [ ] **AC-07:** The spending-by-category chart renders correctly for periods with despesa
  data, and shows a placeholder when there are no despesas.
- [ ] **AC-08:** The monthly income vs. expenses chart renders correctly for periods with
  data, and shows a placeholder when there are no transactions.
- [ ] **AC-09:** New transactions sent to the Telegram bot appear in the dashboard within
  ~30 seconds without a manual page reload.
- [ ] **AC-10:** The transaction list below the charts is filtered by the active period.
- [ ] **AC-11:** A Firestore error shows a Portuguese error banner without crashing the page.
- [ ] **AC-12:** After an auto-refresh fetch error, previously loaded data remains visible.
- [ ] **AC-13:** The "Sair" button logs out and redirects to `/login`.
- [ ] **AC-14:** Navigating to `/transactions` while unauthenticated still redirects to
  `/login` (AuthGuard unchanged).
- [ ] **AC-15:** With no transactions in the selected period, KPIs show R$ 0,00 / 0 and
  charts show placeholders.

---

## Definition of Done

The feature is working when:
1. Opening the dashboard after login shows KPI cards with correct totals for the current month.
2. Selecting "Todo o período" shows the correct lifetime totals.
3. Both charts render with real data and update when the filter changes.
4. Waiting 30 seconds after sending a Telegram transaction causes the new transaction to
   appear in the dashboard automatically.
5. Switching filter periods instantly updates all KPIs, charts, and the transaction list.
6. The page is visually clean with no JS errors in the browser console during normal use.
7. All acceptance criteria above are checked off.

---

## Out of Scope

- Real-time Firestore `onSnapshot` listener (polling every 30 s is sufficient).
- Transaction creation, editing, or deletion from the dashboard.
- Exporting data (CSV, PDF, etc.).
- Pagination of the transaction list.
- Per-transaction drill-down views.
- Budget goals or alerts.
- Dark mode.
- Mobile-specific native features (PWA, push notifications).
- Multi-user support.
- Backend API changes.
- Any chart library other than Recharts.
- Password reset or account management.
