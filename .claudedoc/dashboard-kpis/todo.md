# Tasks: Dashboard Completo com KPIs, Gráficos e Auto-refresh

All tasks are frontend-only. No backend tasks. No manual setup tasks (no new Firebase
Console configuration or environment variables required — all work reads from the existing
`transactions` Firestore collection with the existing Firebase Client SDK setup).

---

## Frontend Tasks

### FE-01: Install Recharts dependency ✅
- **File:** `frontend/package.json` (updated by npm)
- **Action:** Run `cd frontend && npm install recharts` to add Recharts to the project.
- **Verify:** `recharts` appears in `dependencies` in `package.json` and
  `node_modules/recharts` exists.
- Depends on: nothing

---

### FE-02: Create `KpiCard` component ✅
- **File:** `frontend/src/components/KpiCard.tsx`
- **Action:** Create the component with props `label: string`, `value: string`,
  `variant?: 'positive' | 'negative' | 'neutral'`. Render a `<div>` with classes
  `kpi-card kpi-card--{variant}` containing a `<span class="kpi-card__label">` and
  `<span class="kpi-card__value">`. Mark `'use client'` at the top.
- Depends on: nothing

---

### FE-03: Create `PeriodFilter` component ✅
- **File:** `frontend/src/components/PeriodFilter.tsx`
- **Action:** Define the `Period` type (`'month' | '3months' | '6months' | 'all'`) and the
  `OPTIONS` array with Brazilian Portuguese labels. Render a `<div class="period-filter">`
  with four `<button>` elements. Apply `period-filter__btn--active` class to the selected
  option. Call `onChange(opt.value)` on click. Mark `'use client'`.
- Depends on: nothing

---

### FE-04: Create `CategoryChart` component ✅
- **File:** `frontend/src/components/CategoryChart.tsx`
- **Action:** Import `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`
  from `recharts`. Accept `data: CategoryDataItem[]` prop (define the interface in this
  file or import from a shared types file). If `data.length === 0`, render
  `<p class="chart-placeholder">Sem dados para exibir.</p>`. Otherwise render a horizontal
  `BarChart` (swap axes: `YAxis dataKey="category"`, `XAxis type="number"`) inside a
  `ResponsiveContainer` with `width="100%"` and `height={240}`. Bar fill: `#e74c3c`.
  Tooltip value formatter: Brazilian currency string. Mark `'use client'`.
- Depends on: FE-01

---

### FE-05: Create `MonthlyChart` component ✅
- **File:** `frontend/src/components/MonthlyChart.tsx`
- **Action:** Import `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `Legend`,
  `ResponsiveContainer` from `recharts`. Accept `data: MonthlyDataItem[]` prop (define
  interface in this file). If `data.length === 0`, render
  `<p class="chart-placeholder">Sem dados para exibir.</p>`. Otherwise render a grouped
  `BarChart` with `XAxis dataKey="month"`, two `<Bar>` elements: `dataKey="receitas"`
  fill `#1a7a3c` name `"Receitas"` and `dataKey="despesas"` fill `#e74c3c`
  name `"Despesas"`. `ResponsiveContainer width="100%" height={240}`. Mark `'use client'`.
- Depends on: FE-01

---

### FE-06: Add new CSS to `globals.css` ✅
- **File:** `frontend/src/app/globals.css`
- **Action:** Append the following new rule blocks (do NOT modify existing rules):
  - `.kpi-grid` — CSS Grid, `auto-fit minmax(180px, 1fr)`, gap 1rem
  - `.kpi-card`, `.kpi-card--positive`, `.kpi-card--negative`, `.kpi-card--neutral` —
    white card with left border colour coded per variant (green / red / blue)
  - `.kpi-card__label` — small caps label
  - `.kpi-card__value` — large bold value; colour overrides for positive/negative variants
  - `.period-filter`, `.period-filter__btn`, `.period-filter__btn--active` — pill buttons
  - `.charts-grid` — CSS Grid two columns responsive
  - `.chart-section`, `.chart-section__title` — white card wrapper for each chart
  - `.chart-placeholder` — centred grey placeholder text
  - `.dashboard-section-label` — section heading above transaction list
  - `.refresh-hint` — small right-aligned auto-refresh notice
  - Full CSS definitions are specified in `design.md` under "CSS Additions".
- Depends on: nothing

---

### FE-07: Refactor `transactions/page.tsx` — state and data logic ✅
- **File:** `frontend/src/app/transactions/page.tsx`
- **Action:** Inside `TransactionsContent`:
  1. Add `period` state: `const [period, setPeriod] = useState<Period>('month')`.
  2. Add `isFetchingRef = useRef(false)` to prevent concurrent fetches.
  3. Update `fetchTransactions` to accept an optional `isAutoRefresh: boolean` second
     parameter. When `isAutoRefresh = true`, do not call `setFetchState('loading')` and
     do not clear existing `transactions` on error.
  4. Update the `useEffect` that calls `fetchTransactions` to also set up a 30-second
     `setInterval` and return a `clearInterval` cleanup.
  5. Add `filteredTransactions` via `useMemo`:
     compute `getPeriodStart(period)` and filter `transactions` array.
  6. Add `kpis` via `useMemo`: compute `receitas`, `despesas`, `saldo`, `count` from
     `filteredTransactions`.
  7. Add `categoryData` via `useMemo`: group despesas by category from
     `filteredTransactions`, return `CategoryDataItem[]` sorted by total descending.
  8. Add `monthlyData` via `useMemo`: group all transactions by year-month from
     `filteredTransactions`, return `MonthlyDataItem[]` sorted chronologically.
  9. Add `getPeriodStart` helper function (pure function, outside the component).
  10. Add `formatCurrency` helper (or reuse the existing `formatAmount` — rename/refactor).
  11. Update the page header `<h1>` text to "Meu Painel Financeiro".
  - Logic specs for all helpers are in `design.md`.
- Depends on: FE-03 (Period type), FE-04 (CategoryDataItem), FE-05 (MonthlyDataItem)

---

### FE-08: Refactor `transactions/page.tsx` — JSX rendering ✅
- **File:** `frontend/src/app/transactions/page.tsx`
- **Action:** Update the `return` statement of `TransactionsContent` to render:
  1. Import and render `<PeriodFilter selected={period} onChange={setPeriod} />` below the
     header and above the KPI grid. Only show when `fetchState !== 'loading'` (or always
     show — acceptable either way, but hiding during initial spinner is cleaner).
  2. Add `<div class="kpi-grid">` with four `<KpiCard>` instances using `kpis` values
     formatted via `formatCurrency`. Saldo variant: `kpis.saldo >= 0 ? 'positive' : 'negative'`.
  3. Add `<div class="charts-grid">` with two `<div class="chart-section">` children,
     each containing a title `<p class="chart-section__title">` and the respective chart
     component (`<CategoryChart data={categoryData} />` and
     `<MonthlyChart data={monthlyData} />`).
  4. Add `<p class="dashboard-section-label">Transações</p>` above the transaction list.
  5. Add `<p class="refresh-hint">Atualização automática a cada 30 segundos</p>` below the
     transaction list.
  6. The KPI grid, charts grid, and transaction list must only render when
     `fetchState === 'done'` or when `transactions.length > 0` (so data persists through
     auto-refresh errors).
  7. Import `KpiCard`, `PeriodFilter`, `CategoryChart`, `MonthlyChart` at the top of the
     file.
- Depends on: FE-02, FE-03, FE-04, FE-05, FE-07

---

## Verification Checklist

### Install & Build
- [x] `cd frontend && npm install recharts` completes without errors.
- [x] `npm run build` completes with no TypeScript errors and no missing module errors.
- [x] The built output in `out/` includes the transactions page.

### KPI Cards
- [x] With transactions present for the current month, "Total Receitas", "Total Despesas",
  and "Saldo" show correct BRL-formatted sums.
- [x] "Transações" card shows the correct count of transactions in the selected period.
- [x] Saldo card text is green when saldo ≥ 0 and red when saldo < 0.
- [x] Switching to "Todo o período" updates all four KPI values to lifetime totals.

### Period Filter
- [x] Default selection is "Este mês" on page load.
- [x] Clicking each period option highlights it and instantly updates KPIs, charts, and the
  transaction list.
- [x] No loading spinner appears when switching periods (only on initial load and on manual
  page reload).

### Category Chart
- [x] Chart renders bars for each despesa category with correct totals when data exists.
- [x] Chart shows "Sem dados para exibir." when the selected period has no despesas.
- [x] Bar fill colour is red (`#e74c3c`).
- [x] Tooltip shows a BRL-formatted currency value on hover.

### Monthly Chart
- [x] Chart renders grouped bars (green for receitas, red for despesas) per month.
- [x] Month labels are in Brazilian Portuguese short format (e.g., "Jan/25").
- [x] Chart shows "Sem dados para exibir." when the selected period has no transactions.
- [x] Legend labels show "Receitas" and "Despesas".

### Auto-refresh
- [x] After sending a new Telegram transaction, it appears in the dashboard within ~35 seconds
  (30 s interval + fetch latency) without a manual page reload.
- [x] The period filter selection is not reset by an auto-refresh.
- [x] No full-page spinner appears during an auto-refresh fetch.
- [x] Browser console shows no unhandled promise rejections during auto-refresh.

### Transaction List
- [x] The transaction list below the charts reflects the active period filter.
- [x] Each row shows: type badge, amount (BRL formatted), category, description, date (pt-BR).
- [x] The list is ordered most-recent first.
- [x] Empty state "Nenhuma transação registrada ainda." appears when the filtered list is empty.

### Error Handling
- [x] Simulating a Firestore error (e.g., by temporarily revoking network) shows a Portuguese
  error banner.
- [x] Previously loaded transactions remain visible after an auto-refresh error.
- [x] Error banner clears on the next successful fetch.

### Auth & Navigation
- [x] Navigating to `/transactions` while unauthenticated redirects to `/login` (AuthGuard
  unchanged).
- [x] "Sair" button logs out and redirects to `/login`.
- [x] Refreshing the page while authenticated stays on `/transactions`.

### Visual
- [x] No layout shift or visual breakage on screen widths 375px, 768px, and 1280px.
- [x] KPI grid wraps gracefully on narrow screens (auto-fit columns).
- [x] Charts grid stacks to a single column on narrow screens.
- [x] No browser console errors during normal use.
