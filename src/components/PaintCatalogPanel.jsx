import { useMemo, useState } from 'react';
import { Check, Droplets, Paintbrush, Search } from 'lucide-react';
import { getPaintProductMetadata, paintApplications, paintCategories, paintMaterials } from '../data/paintCatalog.js';

export default function PaintCatalogPanel({ products, selectedId, onSelect }) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [applicationFilter, setApplicationFilter] = useState('all');
  const [tintFilter, setTintFilter] = useState('all');
  const [baseFilter, setBaseFilter] = useState('all');
  const [materialFilter, setMaterialFilter] = useState('all');

  const filteredProducts = useMemo(() => products.filter((product) => {
    const metadata = getPaintProductMetadata(product);
    const text = `${product.brand} ${product.name} ${product.finish} ${product.purpose}`.toLocaleLowerCase('ru');
    return (!query.trim() || text.includes(query.trim().toLocaleLowerCase('ru')))
      && (categoryFilter === 'all' || metadata.category === categoryFilter)
      && (applicationFilter === 'all' || metadata.applications.includes(applicationFilter))
      && (tintFilter === 'all' || (tintFilter === 'yes' ? metadata.tintable === true : metadata.tintable === false))
      && (baseFilter === 'all' || metadata.tintBases.includes(baseFilter))
      && (materialFilter === 'all' || metadata.compatibleMaterials.includes(materialFilter));
  }), [products, query, categoryFilter, applicationFilter, tintFilter, baseFilter, materialFilter]);

  return <section className="dashboard-paint-catalog panel min-h-0 p-4 sm:p-5" aria-label="Каталог красок">
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="eyebrow flex items-center gap-2"><Paintbrush size={13} />КАТАЛОГ ЛАКОКРАСОЧНЫХ МАТЕРИАЛОВ</div>
        <h2 className="mt-1 text-sm font-semibold">Подберите краску по типу и назначению</h2>
        <p className="mt-1 text-[10px] text-slate-500">Свойства отображаются, только если они указаны для продукта.</p>
      </div>
      <span className="shrink-0 rounded-lg bg-[#1a2027] p-2 text-[var(--primary-300)]"><Droplets size={16} /></span>
    </header>

    <div className="relative mb-3">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по бренду и названию" aria-label="Поиск краски" className="field w-full rounded-lg py-2.5 pl-9 pr-3 text-xs" />
    </div>

    <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Тип краски">
      <button type="button" onClick={() => setCategoryFilter('all')} className={`chip rounded-md px-2.5 py-1.5 text-[10px] font-medium ${categoryFilter === 'all' ? 'active' : ''}`}>Все типы</button>
      {paintCategories.map((category) => <button type="button" key={category.id} onClick={() => setCategoryFilter(category.id)} className={`chip rounded-md px-2.5 py-1.5 text-[10px] font-medium ${categoryFilter === category.id ? 'active' : ''}`}>{category.label}</button>)}
    </div>

    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Фильтры по свойствам краски">
      <select aria-label="Область применения" value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value)} className="field min-w-0 rounded-lg px-2 py-2 text-[10px]">
        <option value="all">Любое применение</option>
        {paintApplications.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <select aria-label="Колеровка" value={tintFilter} onChange={(event) => setTintFilter(event.target.value)} className="field min-w-0 rounded-lg px-2 py-2 text-[10px]">
        <option value="all">Колеровка: любая</option><option value="yes">Колеруется</option><option value="no">Не колеруется</option>
      </select>
      <select aria-label="База колеровки" value={baseFilter} onChange={(event) => setBaseFilter(event.target.value)} className="field min-w-0 rounded-lg px-2 py-2 text-[10px]">
        <option value="all">Любая база</option><option value="A">База A</option><option value="C">База C</option>
      </select>
      <select aria-label="Совместимый материал" value={materialFilter} onChange={(event) => setMaterialFilter(event.target.value)} className="field min-w-0 rounded-lg px-2 py-2 text-[10px]">
        <option value="all">Любой материал</option>
        {paintMaterials.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </div>

    <div className="mb-3 text-[10px] text-slate-500">Найдено: {filteredProducts.length}</div>
    <div className="grid gap-2 sm:grid-cols-2">
      {filteredProducts.map((product) => {
        const metadata = getPaintProductMetadata(product);
        const category = paintCategories.find((item) => item.id === metadata.category);
        const active = product.id === selectedId;
        const tags = [
          ...metadata.applications.map((id) => paintApplications.find((item) => item.id === id)?.label),
          metadata.tintable === true ? 'Колеруется' : metadata.tintable === false ? 'Не колеруется' : null,
          ...metadata.tintBases.map((base) => `База ${base}`),
          ...metadata.compatibleMaterials.map((id) => paintMaterials.find((item) => item.id === id)?.label),
        ].filter(Boolean);
        return <article key={product.id} className={`min-w-0 rounded-xl border p-3 transition ${active ? 'border-[var(--primary-400)] bg-[var(--primary-900)]/15' : 'border-[#2b323c] bg-[#0d1117]'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--primary-300)]">{category?.label ?? 'Краска'}</span>
              <h3 className="mt-1 text-xs font-semibold text-slate-100">{product.brand} · {product.name}</h3>
            </div>
            {active && <Check size={15} className="mt-1 shrink-0 text-[var(--primary-300)]" aria-label="Выбрана" />}
          </div>
          {product.finish && <p className="mt-1 text-[10px] text-slate-400">{product.finish}</p>}
          {product.purpose && <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{product.purpose}</p>}
          {tags.length > 0
            ? <div className="mt-2 flex flex-wrap gap-1">{tags.map((tag) => <span key={tag} className="rounded-full border border-[#343d48] px-2 py-0.5 text-[9px] text-slate-400">{tag}</span>)}</div>
            : <p className="mt-2 text-[9px] text-slate-600">Свойства пока не указаны</p>}
          <button type="button" onClick={() => onSelect(product)} className={`mt-3 w-full rounded-lg px-3 py-2 text-[10px] font-semibold ${active ? 'accent-surface text-[var(--primary-100)]' : 'btn-secondary'}`}>
            {active ? 'Выбрана для расчёта' : 'Выбрать для расчёта'}
          </button>
        </article>;
      })}
      {!filteredProducts.length && <p className="rounded-xl border border-dashed border-[#303843] p-6 text-center text-xs text-slate-500 sm:col-span-2">По этим фильтрам краски не найдены.</p>}
    </div>
  </section>;
}
