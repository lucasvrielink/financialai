'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface MonthlyDataItem {
  month: string;
  receitas: number;
  despesas: number;
}

interface MonthlyChartProps {
  data: MonthlyDataItem[];
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function MonthlyChart({ data }: MonthlyChartProps) {
  if (data.length === 0) {
    return (
      <div className="chart-container">
        <h2>Receitas vs Despesas por Mês</h2>
        <p className="empty-state">Sem dados para exibir.</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h2>Receitas vs Despesas por Mês</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <XAxis dataKey="month" />
          <YAxis tickFormatter={formatBRL} />
          <Tooltip formatter={(value) => typeof value === 'number' ? formatBRL(value) : String(value)} />
          <Legend />
          <Bar dataKey="receitas" fill="#22c55e" name="Receitas" />
          <Bar dataKey="despesas" fill="#ef4444" name="Despesas" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
