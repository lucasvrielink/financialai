'use client';

interface KpiCardProps {
  label: string;
  value: string;
  variant: 'receita' | 'despesa' | 'saldo';
}

const ICONS: Record<KpiCardProps['variant'], string> = {
  receita: '↑',
  despesa: '↓',
  saldo:   '◎',
};

export function KpiCard({ label, value, variant }: KpiCardProps) {
  const isNegative = value.startsWith('-');
  return (
    <div className="kpi-card">
      <div className="kpi-card__top">
        <span className="kpi-label">{label}</span>
        <span className={`kpi-icon kpi-icon--${variant}`}>{ICONS[variant]}</span>
      </div>
      <p className={`kpi-value${isNegative ? ' kpi-value--negative' : ''}`}>{value}</p>
    </div>
  );
}
