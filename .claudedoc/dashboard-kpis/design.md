# Design: Dashboard Completo com KPIs, Gráficos e Auto-refresh

## Overview

All work is client-side only (static export, no SSR). The existing `TransactionsContent`
component in `src/app/transactions/page.tsx` is refactored to:

1. Fetch **all** of the user's transactions once (and re-fetch every 30 s via `setInterval`).
2. Store the full unfiltered list in `useState`.
3. Derive the filtered list with `useMemo` based on a `period` state value.
4. Derive KPI values with `useMemo` from the filtered list.
5. Derive chart data shapes with `useMemo` from the filtered list.
6. Render four new sub-components (`KpiCard`, `PeriodFilter`, `CategoryChart`,
   `MonthlyChart`) above the existing transaction list.

Recharts is added as a dependency (`npm install recharts`). All CSS additions follow the
BEM-like pattern already used in `globals.css` (block `dashboard`, elements `kpi-grid`,
`kpi-card`, `chart-section`, `period-filter`, etc.).

---

## Frontend — Files to Create

- `frontend/src/components/KpiCard.tsx` — Displays a single KPI metric (label + formatted
  value + optional colour variant for saldo).
- `frontend/src/components/PeriodFilter.tsx` — Renders four period buttons; calls a callback
  on selection change.
- `frontend/src/components/CategoryChart.tsx` — Bar chart (Recharts `BarChart`) of despesa
  totals grouped by category. Shows a placeholder when data is empty.
- `frontend/src/components/MonthlyChart.tsx` — Grouped bar chart (Recharts `BarChart`) of
  receita vs. despesa totals by calendar month. Shows a placeholder when data is empty.

## Frontend — Files to Modify

- `frontend/src/app/transactions/page.tsx` — Refactor `TransactionsContent`: add period
  state, auto-refresh interval, `useMemo` for filtered data + KPIs + chart data, render new
  components above the transaction list.
- `frontend/src/app/globals.css` — Add CSS for KPI grid, KPI cards, period filter buttons,
  chart section wrapper, and chart placeholder text. No changes to existing rules.

## Frontend — Package Changes

- Add `recharts` to `frontend/package.json` via `npm install recharts`.

---

## TypeScript Interfaces

```typescript
// Existing — defined in src/types/transaction.ts (unchanged)
interface Transaction {
  id: string;
  user_id: string;
  type: 'despesa' | 'receita';
  amount: number;
  category: string;
  description: string;
  installments: number;
  raw_message: string;
  created_at: Date;
}

// Period options
type Period = 'month' | '3months' | '6months' | 'all';

// KPI card props
interface KpiCardProps {
  label: string;
  value: string;          // pre-formatted string passed from parent
  variant?: 'positive' | 'negative' | 'neutral';  // controls colour treatment
}

// Period filter props
interface PeriodFilterProps {
  selected: Period;
  onChange: (period: Period) => void;
}

// Category chart data item
interface CategoryDataItem {
  category: string;   // e.g. "alimentação"
  total: number;      // sum of despesa amounts in BRL
}

// Category chart props
interface CategoryChartProps {
  data: CategoryDataItem[];
}

// Monthly chart data item
interface MonthlyDataItem {
  month: string;      // e.g. "Jan/25"
  receitas: number;
  despesas: number;
}

// Monthly chart props
interface MonthlyChartProps {
  data: MonthlyDataItem[];
}
```

---

## Period Filter Logic

The period filter computes a `startDate: Date | null` cutoff. Transactions with
`created_at >= startDate` (or all transactions when `startDate` is `null`) are included.

```typescript
function getPeriodStart(period: Period): Date | null {
  const now = new Date();
  if (period === 'all') return null;

  const start = new Date(now.getFullYear(), now.getMonth(), 1); // first day of current month
  if (period === 'month') return start;

  if (period === '3months') {
    start.setMonth(start.getMonth() - 2); // current month + 2 prior months
    return start;
  }
  if (period === '6months') {
    start.setMonth(start.getMonth() - 5); // current month + 5 prior months
    return start;
  }
  return null;
}

// Usage in useMemo:
const filteredTransactions = useMemo(() => {
  const start = getPeriodStart(period);
  if (!start) return transactions;
  return transactions.filter(tx => tx.created_at >= start);
}, [transactions, period]);
```

---

## KPI Computation Logic

```typescript
const kpis = useMemo(() => {
  const receitas = filteredTransactions
    .filter(tx => tx.type === 'receita')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const despesas = filteredTransactions
    .filter(tx => tx.type === 'despesa')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const saldo = receitas - despesas;
  const count = filteredTransactions.length;

  return { receitas, despesas, saldo, count };
}, [filteredTransactions]);
```

The parent passes pre-formatted strings to `KpiCard`:
- `receitas` → `formatCurrency(kpis.receitas)` → e.g. `"R$ 5.000,00"`
- `despesas` → `formatCurrency(kpis.despesas)`
- `saldo` → `formatCurrency(kpis.saldo)` — variant `'positive'` if `>= 0`, else `'negative'`
- `count` → `String(kpis.count)` — variant `'neutral'`

---

## Chart Data Computation Logic

### Category Chart Data
```typescript
const categoryData = useMemo((): CategoryDataItem[] => {
  const map = new Map<string, number>();
  filteredTransactions
    .filter(tx => tx.type === 'despesa')
    .forEach(tx => {
      map.set(tx.category, (map.get(tx.category) ?? 0) + tx.amount);
    });
  return Array.from(map.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total); // largest first
}, [filteredTransactions]);
```

### Monthly Chart Data
```typescript
const monthlyData = useMemo((): MonthlyDataItem[] => {
  const map = new Map<string, { receitas: number; despesas: number }>();

  filteredTransactions.forEach(tx => {
    const d = tx.created_at;
    // e.g. "2025-01" used as key; formatted label computed separately
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const entry = map.get(key) ?? { receitas: 0, despesas: 0 };
    if (tx.type === 'receita') entry.receitas += tx.amount;
    else entry.despesas += tx.amount;
    map.set(key, entry);
  });

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b)) // chronological
    .map(([key, vals]) => {
      const [year, month] = key.split('-');
      const monthNames = ['Jan','Fev','Mar','Abr','Mai','Jun',
                          'Jul','Ago','Set','Out','Nov','Dez'];
      const label = `${monthNames[parseInt(month, 10) - 1]}/${year.slice(2)}`;
      return { month: label, ...vals };
    });
}, [filteredTransactions]);
```

---

## Auto-refresh Pattern

```typescript
useEffect(() => {
  if (authState.status !== 'authenticated') return;

  // Initial fetch
  fetchTransactions(authState.user.uid);

  // Auto-refresh every 30 seconds
  const intervalId = setInterval(() => {
    fetchTransactions(authState.user.uid);
  }, 30_000);

  return () => clearInterval(intervalId); // cleanup on unmount
}, [authState.status]);
```

`fetchTransactions` uses a `isFetching` ref to guard against concurrent calls:

```typescript
const isFetchingRef = useRef(false);

async function fetchTransactions(uid: string, isAutoRefresh = false) {
  if (isFetchingRef.current) return;  // skip if already in-flight
  isFetchingRef.current = true;

  if (!isAutoRefresh) setFetchState('loading');
  // ... Firestore query ...
  // On success: setTransactions(results); setFetchState('done');
  // On error:   setFetchState('error'); setErrorMessage(...);
  isFetchingRef.current = false;
}
```

Auto-refresh calls `fetchTransactions(uid, true)` so it does not re-trigger the full-page
spinner. On auto-refresh error: update the error banner but keep existing `transactions` data.

---

## Component Designs

### `KpiCard.tsx`

```tsx
'use client';

interface KpiCardProps {
  label: string;
  value: string;
  variant?: 'positive' | 'negative' | 'neutral';
}

export function KpiCard({ label, value, variant = 'neutral' }: KpiCardProps) {
  return (
    <div className={`kpi-card kpi-card--${variant}`}>
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value">{value}</span>
    </div>
  );
}
```

### `PeriodFilter.tsx`

```tsx
'use client';

type Period = 'month' | '3months' | '6months' | 'all';

const OPTIONS: { value: Period; label: string }[] = [
  { value: 'month',   label: 'Este mês' },
  { value: '3months', label: 'Últimos 3 meses' },
  { value: '6months', label: 'Últimos 6 meses' },
  { value: 'all',     label: 'Todo o período' },
];

interface PeriodFilterProps {
  selected: Period;
  onChange: (period: Period) => void;
}

export function PeriodFilter({ selected, onChange }: PeriodFilterProps) {
  return (
    <div className="period-filter" role="group" aria-label="Filtrar por período">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          className={`period-filter__btn${selected === opt.value ? ' period-filter__btn--active' : ''}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={selected === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

### `CategoryChart.tsx`

Uses Recharts `BarChart` (horizontal) with `XAxis` as the value axis and `YAxis` as the
category axis for readability with long category names.

```tsx
'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// data: CategoryDataItem[] — sorted by total desc
// Empty state: render <p className="chart-placeholder">Sem dados para exibir.</p>

// Tooltip formatter: value => `R$ ${value.toLocaleString('pt-BR', ...)}`
// Bar fill: '#e74c3c' (red, consistent with despesa colour)
// Chart height: 240px (or dynamic via ResponsiveContainer)
```

### `MonthlyChart.tsx`

Uses Recharts `BarChart` (vertical/grouped) with month labels on the X axis.

```tsx
'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Receitas bar fill: '#1a7a3c' (green, consistent with receita colour)
// Despesas bar fill: '#e74c3c' (red, consistent with despesa colour)
// Legend labels: 'Receitas', 'Despesas'
// Empty state: render <p className="chart-placeholder">Sem dados para exibir.</p>
```

---

## CSS Additions (globals.css)

New classes to append to `globals.css`. No existing rules are changed.

```css
/* KPI grid */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.kpi-card {
  background: #fff;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  border-left: 4px solid #ccc;
}

.kpi-card--positive { border-left-color: #1a7a3c; }
.kpi-card--negative { border-left-color: #c0392b; }
.kpi-card--neutral  { border-left-color: #3366cc; }

.kpi-card__label {
  font-size: 0.8rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
}

.kpi-card__value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #222;
}

.kpi-card--positive .kpi-card__value { color: #1a7a3c; }
.kpi-card--negative .kpi-card__value { color: #c0392b; }

/* Period filter */
.period-filter {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.period-filter__btn {
  padding: 0.35rem 0.85rem;
  border: 1px solid #ccc;
  border-radius: 20px;
  background: #fff;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  color: #444;
}

.period-filter__btn:hover {
  border-color: #3366cc;
  color: #3366cc;
}

.period-filter__btn--active {
  background: #3366cc;
  border-color: #3366cc;
  color: #fff;
  font-weight: 600;
}

/* Chart sections */
.charts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.chart-section {
  background: #fff;
  border-radius: 8px;
  padding: 1.25rem;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.chart-section__title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 1rem;
}

.chart-placeholder {
  color: #999;
  font-size: 0.9rem;
  text-align: center;
  padding: 2rem 0;
}

/* Dashboard section label */
.dashboard-section-label {
  font-size: 1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 0.75rem;
}

/* Auto-refresh indicator */
.refresh-hint {
  font-size: 0.78rem;
  color: #999;
  text-align: right;
  margin-bottom: 1rem;
}
```

---

## Page Layout (transactions/page.tsx — rendered structure)

```
<div class="transactions-page">
  <header class="transactions-header">
    <h1>Meu Painel Financeiro</h1>
    <button class="btn-logout">Sair</button>
  </header>

  <!-- Error banner (conditional) -->
  <div class="error-banner">...</div>

  <!-- Loading spinner (initial load only) -->
  <div class="spinner-page"><span class="spinner" /></div>

  <!-- Main dashboard (shown when fetchState === 'done' or on refresh error with prior data) -->
  <PeriodFilter selected={period} onChange={setPeriod} />

  <div class="kpi-grid">
    <KpiCard label="Total Receitas" value="R$ ..." variant="positive" />
    <KpiCard label="Total Despesas" value="R$ ..." variant="negative" />
    <KpiCard label="Saldo"          value="R$ ..." variant="positive|negative" />
    <KpiCard label="Transações"     value="42"    variant="neutral" />
  </div>

  <div class="charts-grid">
    <div class="chart-section">
      <p class="chart-section__title">Despesas por Categoria</p>
      <CategoryChart data={categoryData} />
    </div>
    <div class="chart-section">
      <p class="chart-section__title">Receitas × Despesas por Mês</p>
      <MonthlyChart data={monthlyData} />
    </div>
  </div>

  <p class="dashboard-section-label">Transações</p>
  <ul class="transaction-list">...</ul>

  <p class="refresh-hint">Atualização automática a cada 30 segundos</p>
</div>
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Firestore `permission-denied` on initial load | Show `"Sem permissão para ler as transações."` error banner; set `fetchState = 'error'`; do not auto-clear |
| Firestore `unavailable` on initial load | Show `"Erro de conexão ao carregar transações."` error banner; auto-refresh will retry |
| Firestore any other error on initial load | Show `"Erro ao carregar transações. Tente recarregar a página."` |
| Auto-refresh fetch failure | Show/update error banner `"Erro ao atualizar dados. Tentativa automática em 30 segundos."` but keep `transactions` state and do not set `fetchState = 'error'` |
| Recharts render error | Wrap chart components in a try/catch placeholder; show `"Erro ao exibir gráfico."` |

---

## Security

- No backend changes; all existing Firestore Security Rules apply.
- The Firestore query filters by `user_id == uid` (unchanged from current implementation).
- No new environment variables introduced.
- `NEXT_PUBLIC_` prefix only for Firebase config vars (unchanged).

---

## Firestore Schema

No changes. The existing `transactions` collection documents are read as-is:

```
{
  id:           string  (document ID)
  user_id:      string
  type:         "despesa" | "receita"
  amount:       number
  category:     string
  description:  string
  installments: number  (≥ 1)
  raw_message:  string
  created_at:   Timestamp
}
```

---

## Dependency

```
recharts   (latest stable — ~2.x)
```

Install via: `cd frontend && npm install recharts`
