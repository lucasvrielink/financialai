'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Transaction } from '@/types/transaction';
import { KpiCard } from '@/components/KpiCard';
import { PeriodFilter, PeriodKey } from '@/components/PeriodFilter';
import { FilterBar, TypeFilter } from '@/components/FilterBar';
import { CategoryChart } from '@/components/CategoryChart';
import { MonthlyChart } from '@/components/MonthlyChart';

type FetchState = 'loading' | 'error' | 'done';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function TransactionsContent() {
  const authState = useAuth();
  const router = useRouter();

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const isFetchingRef = useRef(false);

  // --- Auto-refresh effect ---
  useEffect(() => {
    if (authState.status !== 'authenticated') return;
    fetchTransactions(authState.user.uid);
    const id = setInterval(() => {
      fetchTransactions(authState.user.uid);
    }, 30000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.status]);

  async function fetchTransactions(uid: string, isAutoRefresh = false) {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    // Only show full-page spinner on first load
    if (!isAutoRefresh && allTransactions.length === 0) {
      setFetchState('loading');
    }
    setErrorMessage(null);

    try {
      const q = query(
        collection(db, 'transactions'),
        where('user_id', '==', uid),
        orderBy('created_at', 'desc')
      );
      const snapshot = await getDocs(q);
      const results: Transaction[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        const createdAt = data.created_at instanceof Timestamp
          ? data.created_at.toDate()
          : new Date();
        return {
          id:           doc.id,
          user_id:      data.user_id ?? '',
          type:         data.type === 'receita' ? 'receita' : 'despesa',
          amount:       typeof data.amount === 'number' ? data.amount : 0,
          category:     data.category ?? '',
          description:  data.description ?? '',
          installments: typeof data.installments === 'number' ? data.installments : 1,
          raw_message:  data.raw_message ?? '',
          created_at:   createdAt,
        };
      });
      setAllTransactions(results);
      setFetchState('done');
    } catch (err) {
      console.error('[transactions] fetch error:', err);
      if (isAutoRefresh) {
        // On auto-refresh error: show banner but keep existing data visible
        setErrorMessage('Erro ao atualizar dados. Tentativa automática em 30 segundos.');
      } else {
        if (err instanceof FirebaseError) {
          if (err.code === 'permission-denied') {
            setErrorMessage('Sem permissão para ler as transações.');
          } else if (err.code === 'unavailable') {
            setErrorMessage('Erro de conexão ao carregar transações.');
          } else {
            setErrorMessage('Erro ao carregar transações. Tente recarregar a página.');
          }
        } else {
          setErrorMessage('Erro ao carregar transações. Tente recarregar a página.');
        }
        setFetchState('error');
      }
    } finally {
      isFetchingRef.current = false;
    }
  }

  async function handleLogout() {
    await signOut(auth).catch(() => {});
    router.replace('/login');
  }

  function formatAmount(amount: number, installments: number): string {
    const formatted = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return installments > 1 ? `${formatted} × ${installments}` : formatted;
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString('pt-BR');
  }

  // --- Computed values ---

  const periodStart = useMemo(() => {
    const now = new Date();
    if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === '3months') return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    if (period === '6months') return new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return new Date(0);
  }, [period]);

  const periodEnd = useMemo(() => {
    if (period === 'all') return null;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }, [period]);

  const transactions = useMemo(() =>
    allTransactions.filter(tx =>
      tx.created_at >= periodStart && (periodEnd === null || tx.created_at < periodEnd)
    ),
    [allTransactions, periodStart, periodEnd]
  );

  const totalReceitas = useMemo(() =>
    transactions.filter(tx => tx.type === 'receita').reduce((s, tx) => s + tx.amount, 0),
    [transactions]
  );

  const totalDespesas = useMemo(() =>
    transactions.filter(tx => tx.type === 'despesa').reduce((s, tx) => s + tx.amount, 0),
    [transactions]
  );

  const saldo = totalReceitas - totalDespesas;

  const categories = useMemo(() => {
    const set = new Set(transactions.map(tx => tx.category).filter(Boolean));
    return Array.from(set).sort();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (categoryFilter && tx.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!tx.description.toLowerCase().includes(q) && !tx.category.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, categoryFilter, search]);

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.filter(tx => tx.type === 'despesa').forEach(tx => {
      map[tx.category] = (map[tx.category] ?? 0) + tx.amount;
    });
    return Object.entries(map)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [transactions]);

  const monthlyData = useMemo(() => {
    const map: Record<string, { receitas: number; despesas: number }> = {};
    allTransactions.forEach(tx => {
      const d = tx.created_at;
      const key = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
      if (!map[key]) map[key] = { receitas: 0, despesas: 0 };
      if (tx.type === 'receita') map[key].receitas += tx.amount;
      else map[key].despesas += tx.amount;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));
  }, [allTransactions]);

  return (
    <>
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo">💰</span>
          <span className="app-header__name">Vrielink AI</span>
        </div>
        <div className="app-header__actions">
          {authState.status === 'authenticated' && authState.user.email && (
            <span className="app-header__user">{authState.user.email}</span>
          )}
          <button className="btn-logout" onClick={handleLogout}>Sair</button>
        </div>
      </header>

      <main className="dashboard">
        <div className="dashboard__header">
          <h1 className="dashboard__title">Minhas Transações</h1>
        </div>

        {fetchState === 'loading' && allTransactions.length === 0 && (
          <div className="spinner-page">
            <span className="spinner" />
          </div>
        )}

        {fetchState === 'error' && allTransactions.length === 0 && (
          <div className="error-banner">{errorMessage}</div>
        )}

        {(fetchState === 'done' || allTransactions.length > 0) && (
          <>
            {errorMessage && <div className="error-banner">{errorMessage}</div>}

            <PeriodFilter value={period} onChange={setPeriod} />

            <div className="kpi-grid">
              <KpiCard label="Receitas" value={formatBRL(totalReceitas)} variant="receita" />
              <KpiCard label="Despesas" value={formatBRL(totalDespesas)} variant="despesa" />
              <KpiCard label="Saldo" value={formatBRL(saldo)} variant="saldo" />
            </div>

            <div className="charts-grid">
              <CategoryChart data={categoryData} />
              <MonthlyChart data={monthlyData} />
            </div>

            <div className="table-section">
              <div className="table-section__header">
                <span className="table-section__title">
                  Transações
                  {filteredTransactions.length !== transactions.length && (
                    <span className="table-section__count">
                      {' '}· {filteredTransactions.length} de {transactions.length}
                    </span>
                  )}
                </span>
                <FilterBar
                  search={search}
                  onSearchChange={setSearch}
                  typeFilter={typeFilter}
                  onTypeChange={setTypeFilter}
                  category={categoryFilter}
                  onCategoryChange={setCategoryFilter}
                  categories={categories}
                />
              </div>

              {filteredTransactions.length === 0 ? (
                <p className="empty-state">
                  {transactions.length === 0
                    ? 'Nenhuma transação neste período.'
                    : 'Nenhuma transação encontrada com estes filtros.'}
                </p>
              ) : (
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Valor</th>
                      <th>Categoria</th>
                      <th>Descrição</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>
                          <span className={`type-badge type-badge--${tx.type}`}>
                            {tx.type === 'despesa' ? 'Despesa' : 'Receita'}
                          </span>
                        </td>
                        <td>
                          <span className={`tx-amount tx-amount--${tx.type}`}>
                            {formatAmount(tx.amount, tx.installments)}
                          </span>
                        </td>
                        <td className="tx-category">{tx.category}</td>
                        <td className="tx-description">{tx.description || '—'}</td>
                        <td className="tx-date">{formatDate(tx.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <p className="refresh-hint">Atualização automática a cada 30 segundos</p>
          </>
        )}
      </main>
    </>
  );
}

export default function TransactionsPage() {
  return (
    <AuthGuard>
      <TransactionsContent />
    </AuthGuard>
  );
}
