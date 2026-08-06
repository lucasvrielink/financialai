'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CategoryDataItem {
  category: string;
  total: number;
}

interface CategoryChartProps {
  data: CategoryDataItem[];
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function CategoryChart({ data }: CategoryChartProps) {
  if (data.length === 0) {
    return (
      <div className="chart-container">
        <h2>Gastos por Categoria</h2>
        <p className="empty-state">Sem dados para exibir.</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h2>Gastos por Categoria</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} layout="vertical">
          <XAxis type="number" tickFormatter={formatBRL} />
          <YAxis type="category" dataKey="category" width={100} />
          <Tooltip formatter={(value) => typeof value === 'number' ? formatBRL(value) : String(value)} />
          <Bar dataKey="total" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
