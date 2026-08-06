'use client';

export type PeriodKey = 'month' | '3months' | '6months' | 'all';

const OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'month',    label: 'Este mês' },
  { value: '3months',  label: '3 meses' },
  { value: '6months',  label: '6 meses' },
  { value: 'all',      label: 'Tudo' },
];

interface PeriodFilterProps {
  value: PeriodKey;
  onChange: (p: PeriodKey) => void;
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  return (
    <div className="period-filter">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={
            value === opt.value
              ? 'period-filter__btn period-filter__btn--active'
              : 'period-filter__btn'
          }
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
