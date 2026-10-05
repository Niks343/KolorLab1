import { useEffect, useMemo, useState } from 'react';
import { Pencil, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { getPaintProductMetadata, paintApplications, paintCategories, paintMaterials } from '../data/paintCatalog.js';

function RecordRow({ title, subtitle, color, actions }) {
  return <article className="flex min-w-0 items-center gap-3 rounded-xl border border-[#2b323c] bg-[#0d1117] p-3">
    {color && <span className="h-10 w-10 shrink-0 rounded-lg border border-white/10" style={{ backgroundColor: color }} />}
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-semibold text-slate-100">{title}</p>
      <p className="mt-1 truncate text-[10px] text-slate-500">{subtitle}</p>
    </div>
    {actions}
  </article>;
}

function RecordActions({ busy, onEdit, onDelete }) {
  return <div className="flex shrink-0 items-center gap-1">
    <button type="button" disabled={busy} onClick={onEdit} aria-label="Редактировать запись" title="Редактировать" className="icon-button h-8 w-8 rounded-lg text-slate-400 disabled:opacity-50"><Pencil size={14} /></button>
    <button type="button" disabled={busy} onClick={onDelete} aria-label="Удалить запись" title="Удалить" className="icon-button h-8 w-8 rounded-lg text-rose-300 disabled:opacity-50"><Trash2 size={14} /></button>
  </div>;
}

export default function CatalogManagementDialog({
  open, view, colors, paints, busyId, onClose, onAddColor, onAddPaint,
  onEditColor, onDeleteColor, onEditPaint, onDeletePaint,
}) {
  const [colorQuery, setColorQuery] = useState('');
  const [paintQuery, setPaintQuery] = useState('');
  const [visibleColorsCount, setVisibleColorsCount] = useState(40);
  const [visiblePaintsCount, setVisiblePaintsCount] = useState(40);
  const filteredColors = useMemo(() => {
    const query = colorQuery.trim().toLocaleLowerCase('ru');
    return [...colors]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .filter((color) => !query || `${color.code} ${color.name_ru} ${color.catalog}`.toLocaleLowerCase('ru').includes(query));
  }, [colors, colorQuery]);
  const filteredPaints = useMemo(() => {
    const query = paintQuery.trim().toLocaleLowerCase('ru');
    return [...paints]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .filter((paint) => !query || `${paint.brand} ${paint.name} ${paint.purpose} ${paint.id}`.toLocaleLowerCase('ru').includes(query));
  }, [paints, paintQuery]);
  useEffect(() => setVisibleColorsCount(40), [colorQuery]);
  useEffect(() => setVisiblePaintsCount(40), [paintQuery]);
  if (!open) return null;

  return <div className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="catalog-management-title" className="panel my-auto flex max-h-[calc(100dvh-24px)] w-full max-w-2xl flex-col overflow-hidden shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-[#252b33] p-4 sm:p-5">
        <div>
          <div className="eyebrow flex items-center gap-2"><ShieldCheck size={13} className="text-emerald-300" />ОБЩАЯ БАЗА · СОХРАНЕНИЕ В GITHUB</div>
          <h2 id="catalog-management-title" className="mt-1 font-['Manrope'] text-lg font-bold">{view === 'colors' ? 'Каталог цветов' : 'Каталог красок'}</h2>
          <p className="mt-1 text-[10px] text-slate-500">Встроенные каталоги и записи, добавленные посетителями.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть управление базой" className="icon-button h-9 w-9 shrink-0 rounded-lg text-slate-400"><X size={17} /></button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        {view === 'colors' && <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div><h3 className="text-xs font-bold">Цвета <span className="text-slate-500">· {colors.length}</span></h3><p className="mt-1 text-[10px] text-slate-500">Встроенные каталоги и добавленные посетителями.</p></div>
            <button type="button" onClick={onAddColor} className="btn-primary rounded-lg px-3 py-2 text-[10px] font-bold">Добавить цвет</button>
          </div>
          <label className="relative mb-2 block">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={colorQuery} onChange={(event) => setColorQuery(event.target.value)} placeholder="Найти по коду, названию или каталогу" aria-label="Поиск цвета для управления" className="field w-full rounded-lg py-2 pl-9 pr-3 text-[10px]" />
          </label>
          <div className="grid gap-2">
            {filteredColors.slice(0, visibleColorsCount).map((color) => <RecordRow key={color.id} title={`${color.code} · ${color.name_ru}`} subtitle={`${color.catalog} · ${color.hex} · База ${color.base}`} color={color.hex} actions={<RecordActions busy={busyId === color.id} onEdit={() => onEditColor(color)} onDelete={() => onDeleteColor(color)} />} />)}
            {!filteredColors.length && <p className="rounded-lg border border-dashed border-[#303843] p-4 text-center text-[10px] text-slate-500">Цвета не найдены.</p>}
          </div>
          {filteredColors.length > visibleColorsCount && <button type="button" onClick={() => setVisibleColorsCount((count) => count + 40)} className="btn-secondary mt-2 w-full rounded-lg px-3 py-2 text-[10px] font-semibold">Показать ещё · {visibleColorsCount} из {filteredColors.length}</button>}
        </section>}
        {view === 'paints' && <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div><h3 className="text-xs font-bold">Краски <span className="text-slate-500">· {paints.length}</span></h3><p className="mt-1 text-[10px] text-slate-500">Встроенные каталоги и добавленные посетителями.</p></div>
            <button type="button" onClick={onAddPaint} className="btn-primary rounded-lg px-3 py-2 text-[10px] font-bold">Добавить краску</button>
          </div>
          <label className="relative mb-2 block">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={paintQuery} onChange={(event) => setPaintQuery(event.target.value)} placeholder="Найти по бренду или названию" aria-label="Поиск краски для управления" className="field w-full rounded-lg py-2 pl-9 pr-3 text-[10px]" />
          </label>
          <div className="grid gap-2">
            {filteredPaints.slice(0, visiblePaintsCount).map((paint) => {
              const metadata = getPaintProductMetadata(paint);
              const category = paintCategories.find((item) => item.id === metadata.category)?.label ?? 'Краска';
              const applications = metadata.applications.map((id) => paintApplications.find((item) => item.id === id)?.label).filter(Boolean);
              const materials = metadata.compatibleMaterials.map((id) => paintMaterials.find((item) => item.id === id)?.label).filter(Boolean);
              const tinting = metadata.tintable === true
                ? `Колеруется${metadata.tintBases.length ? ` · база ${metadata.tintBases.join('/')}` : ''}`
                : metadata.tintable === false ? 'Не колеруется' : 'Колеровка не указана';
              return <RecordRow key={paint.id} title={`${paint.brand} · ${paint.name}`} subtitle={[category, applications.join(', '), tinting, materials.join(', '), paint.coverageDescription].filter(Boolean).join(' · ')} actions={<RecordActions busy={busyId === paint.id} onEdit={() => onEditPaint(paint)} onDelete={() => onDeletePaint(paint)} />} />;
            })}
            {!filteredPaints.length && <p className="rounded-lg border border-dashed border-[#303843] p-4 text-center text-[10px] text-slate-500">Краски не найдены.</p>}
          </div>
          {filteredPaints.length > visiblePaintsCount && <button type="button" onClick={() => setVisiblePaintsCount((count) => count + 40)} className="btn-secondary mt-2 w-full rounded-lg px-3 py-2 text-[10px] font-semibold">Показать ещё · {visiblePaintsCount} из {filteredPaints.length}</button>}
        </section>}
        {busyId && <p role="status" className="text-center text-[10px] text-slate-400">Синхронизируем изменения с приватным GitHub…</p>}
      </div>
    </section>
  </div>;
}
