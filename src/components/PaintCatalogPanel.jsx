import { useMemo, useState } from 'react';
import { AlertTriangle, Check, GitCompareArrows, Paintbrush, Search, Sparkles, X } from 'lucide-react';
import { getPaintProductMetadata, paintApplications, paintCategories, paintMaterials } from '../data/paintCatalog.js';

function normalizedText(value) {
  return String(value ?? '').toLocaleLowerCase('ru').replace(/[ё]/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim();
}

function tokenSimilarity(first, second) {
  const left = new Set(normalizedText(first).split(/\s+/).filter(Boolean));
  const right = new Set(normalizedText(second).split(/\s+/).filter(Boolean));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / (left.size + right.size - intersection);
}

function getCoverage(product) {
  return Object.values(product.coverageBySurface ?? {}).flat().filter(Number.isFinite);
}

function getPossibleDuplicates(product, products) {
  const metadata = getPaintProductMetadata(product);
  return products.filter((candidate) => {
    if (candidate.id === product.id || getPaintProductMetadata(candidate).category !== metadata.category) return false;
    const brandSimilarity = tokenSimilarity(product.brand, candidate.brand);
    const nameSimilarity = tokenSimilarity(product.name, candidate.name);
    const exactCombined = normalizedText(`${product.brand} ${product.name}`) === normalizedText(`${candidate.brand} ${candidate.name}`);
    return exactCombined || (brandSimilarity >= 0.65 && nameSimilarity >= 0.65);
  });
}

function getUnitCoverage(product) {
  const values = getCoverage(product);
  if (!values.length) return 'Не указано';
  const unit = getPaintProductMetadata(product).category === 'plaster' ? 'кг/м²' : 'м²/л';
  return `${Math.min(...values)}–${Math.max(...values)} ${unit}`;
}

export default function PaintCatalogPanel({ products, selectedId, onSelect, pricesByProduct = {} }) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [applicationFilter, setApplicationFilter] = useState('all');
  const [tintFilter, setTintFilter] = useState('all');
  const [baseFilter, setBaseFilter] = useState('all');
  const [materialFilter, setMaterialFilter] = useState('all');
  const [comparisonIds, setComparisonIds] = useState([]);

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
  const comparedProducts = comparisonIds.map((id) => products.find((product) => product.id === id)).filter(Boolean);
  const selectedProduct = products.find((product) => product.id === selectedId);
  const productRecommendations = (selectedProduct?.recommendedProductIds ?? [])
    .map((id) => products.find((product) => product.id === id))
    .filter((product) => product && product.id !== selectedProduct?.id);

  const toggleComparison = (id) => {
    setComparisonIds((ids) => ids.includes(id)
      ? ids.filter((item) => item !== id)
      : ids.length < 3 ? [...ids, id] : ids);
  };

  return <section className="dashboard-paint-catalog panel min-h-0 p-4 sm:p-5" aria-label="Каталог красок">
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="eyebrow flex items-center gap-2"><Paintbrush size={13} />КАТАЛОГ ЛАКОКРАСОЧНЫХ МАТЕРИАЛОВ</div>
        <h2 className="mt-1 text-sm font-semibold">Подберите краску по типу и назначению</h2>
        <p className="mt-1 text-[10px] text-slate-500">Свойства отображаются, только если они указаны для продукта.</p>
      </div>
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
    {comparedProducts.length > 0 && <section className="mb-4 overflow-hidden rounded-xl border border-[var(--primary-500)]/30 bg-[var(--primary-900)]/10" aria-label="Сравнение красок">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-200"><GitCompareArrows size={14} />Сравнение · {comparedProducts.length}/3</div>
        <button type="button" onClick={() => setComparisonIds([])} className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white"><X size={12} />Очистить</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[10px]">
          <tbody>
            {[
              ['Материал', (product) => `${product.brand} · ${product.name}`],
              ['Расход', getUnitCoverage],
              ['Цена за единицу', (product) => {
                const price = pricesByProduct[product.id] ?? product.pricePerUnit ?? product.pricePerLiter;
                return Number.isFinite(price) ? `${price.toLocaleString('ru-RU')} ₽/${product.quantityUnit === 'kg' ? 'кг' : 'л'}` : 'Не указана';
              }],
              ['Фасовки', (product) => {
                const packages = [...(product.packageSizesLiters ?? []), ...(product.packageSizesKg ?? [])];
                return packages.length ? `${packages.join(', ')} ${product.quantityUnit === 'kg' ? 'кг' : 'л'}` : 'Не указаны';
              }],
              ['Назначение', (product) => product.purpose || 'Не указано'],
              ['Поверхности', (product) => {
                const ids = getPaintProductMetadata(product).compatibleMaterials;
                return ids.length ? ids.map((id) => paintMaterials.find((item) => item.id === id)?.label).filter(Boolean).join(', ') : 'Не указаны';
              }],
            ].map(([label, getValue]) => <tr key={label} className="border-b border-white/5 last:border-0">
              <th className="w-32 px-3 py-2 font-medium text-slate-500">{label}</th>
              {comparedProducts.map((product) => <td key={`${label}-${product.id}`} className="min-w-44 px-3 py-2 text-slate-300">{getValue(product)}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}
    {selectedProduct && <section className="mb-4 rounded-xl border border-[#2b323c] bg-[#0d1117] p-3" aria-label="Совместимая система материалов">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-200"><Sparkles size={14} className="text-[var(--primary-300)]" />Рекомендации по системе материалов</div>
      <p className="mt-1 text-[9px] leading-relaxed text-slate-500">Список задан вручную в карточке краски. Перед нанесением проверьте технические листы производителей.</p>
      {productRecommendations.length
        ? <div className="mt-2 flex flex-wrap gap-1.5">{productRecommendations.map((product) => <button key={product.id} type="button" onClick={() => onSelect(product)} className="rounded-lg border border-[#343d48] px-2.5 py-1.5 text-left text-[9px] text-slate-300 hover:border-[var(--primary-400)]">Рекомендуется · {product.brand} {product.name}</button>)}</div>
        : <div className="mt-2 flex items-start gap-1.5 text-[9px] text-amber-200/80"><AlertTriangle size={12} className="mt-0.5 shrink-0" />Рекомендации не настроены. Добавьте их в карточке этой краски.</div>}
    </section>}
    <div className="grid gap-2 sm:grid-cols-2">
      {filteredProducts.map((product) => {
        const metadata = getPaintProductMetadata(product);
        const category = paintCategories.find((item) => item.id === metadata.category);
        const active = product.id === selectedId;
        const selectedForCompare = comparisonIds.includes(product.id);
        const duplicates = getPossibleDuplicates(product, products);
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
          {product.finish && <p className="mt-1 text-[10px] text-slate-400"><span className="text-slate-500">Блеск:</span> {product.finish}</p>}
          {product.purpose && <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{product.purpose}</p>}
          {duplicates.length > 0 && <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[9px] leading-relaxed text-amber-200/90"><AlertTriangle size={11} className="mt-0.5 shrink-0" /><span>Возможный дубликат: {duplicates.slice(0, 2).map((item) => `${item.brand} · ${item.name}`).join('; ')}. Проверьте вручную.</span></div>}
          {tags.length > 0
            ? <div className="mt-2 flex flex-wrap gap-1">{tags.map((tag) => <span key={tag} className="rounded-full border border-[#343d48] px-2 py-0.5 text-[9px] text-slate-400">{tag}</span>)}</div>
            : <p className="mt-2 text-[9px] text-slate-600">Свойства пока не указаны</p>}
          <button type="button" onClick={() => onSelect(product)} className={`mt-3 w-full rounded-lg px-3 py-2 text-[10px] font-semibold ${active ? 'accent-surface text-[var(--primary-100)]' : 'btn-secondary'}`}>
            {active ? 'Выбрана для расчёта' : 'Выбрать для расчёта'}
          </button>
          <button type="button" onClick={() => toggleComparison(product.id)} disabled={!selectedForCompare && comparisonIds.length >= 3} className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-[10px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${selectedForCompare ? 'border-[var(--primary-400)] text-[var(--primary-200)]' : 'border-[#343d48] text-slate-400 hover:text-slate-200'}`}>
            <span className="inline-flex items-center gap-1.5"><GitCompareArrows size={12} />{selectedForCompare ? 'Убрать из сравнения' : 'Сравнить'}</span>
          </button>
        </article>;
      })}
      {!filteredProducts.length && <p className="rounded-xl border border-dashed border-[#303843] p-6 text-center text-xs text-slate-500 sm:col-span-2">По этим фильтрам краски не найдены.</p>}
    </div>
  </section>;
}
