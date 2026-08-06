'use client';

export type TypeFilter = 'all' | 'receita' | 'despesa';

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  typeFilter: TypeFilter;
  onTypeChange: (v: TypeFilter) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  categories: string[];
}

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all',     label: 'Todos' },
  { value: 'receita', label: 'Receitas' },
  { value: 'despesa', label: 'Despesas' },
];

export function FilterBar({
  search, onSearchChange,
  typeFilter, onTypeChange,
  category, onCategoryChange,
  categories,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-bar__search">
        <svg className="filter-bar__search-icon" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder="Buscar descrição ou categoria..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="filter-bar__input"
        />
        {search && (
          <button className="filter-bar__clear" onClick={() => onSearchChange('')} aria-label="Limpar busca">
            ×
          </button>
        )}
      </div>

      <select
        className="filter-bar__select"
        value={category}
        onChange={e => onCategoryChange(e.target.value)}
        aria-label="Filtrar por categoria"
      >
        <option value="">Todas as categorias</option>
        {categories.map(c => (
          <option key={c} value={c}>
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </option>
        ))}
      </select>

      <div className="filter-bar__type" role="group" aria-label="Filtrar por tipo">
        {TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`filter-bar__type-btn${typeFilter === opt.value ? ' filter-bar__type-btn--active' : ''}`}
            onClick={() => onTypeChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
