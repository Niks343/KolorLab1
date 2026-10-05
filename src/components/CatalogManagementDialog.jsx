import { ShieldCheck, X } from 'lucide-react';

function RecordRow({ title, subtitle, color }) {
  return <article className="flex min-w-0 items-center gap-3 rounded-xl border border-[#2b323c] bg-[#0d1117] p-3">
    {color && <span className="h-10 w-10 shrink-0 rounded-lg border border-white/10" style={{ backgroundColor: color }} />}
    <div className="min-w-0 flex-1">
      <p className="truncate text-xs font-semibold text-slate-100">{title}</p>
      <p className="mt-1 truncate text-[10px] text-slate-500">{subtitle}</p>
    </div>
  </article>;
}

export default function CatalogManagementDialog({ open, colors, paints, busyId, onClose, onAddColor, onAddPaint }) {
  if (!open) return null;

  return <div className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="catalog-management-title" className="panel my-auto flex max-h-[calc(100dvh-24px)] w-full max-w-2xl flex-col overflow-hidden shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-[#252b33] p-4 sm:p-5">
        <div>
          <div className="eyebrow flex items-center gap-2"><ShieldCheck size={13} className="text-emerald-300" />ОБЩАЯ БАЗА · СОХРАНЕНИЕ В GITHUB</div>
          <h2 id="catalog-management-title" className="mt-1 font-['Manrope'] text-lg font-bold">Общая база цветов и красок</h2>
          <p className="mt-1 text-[10px] text-slate-500">Можно добавлять новые записи. Изменение и удаление существующих записей отключены.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Закрыть управление базой" className="icon-button h-9 w-9 shrink-0 rounded-lg text-slate-400"><X size={17} /></button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div><h3 className="text-xs font-bold">Цвета <span className="text-slate-500">· {colors.length}</span></h3><p className="mt-1 text-[10px] text-slate-500">Сохранение записи создаёт коммит в приватной базе.</p></div>
            <button type="button" onClick={onAddColor} className="btn-primary rounded-lg px-3 py-2 text-[10px] font-bold">Добавить цвет</button>
          </div>
          <div className="grid gap-2">
            {colors.map((color) => <RecordRow key={color.id} title={`${color.code} · ${color.name_ru}`} subtitle={`${color.hex} · База ${color.base}`} color={color.hex} />)}
            {!colors.length && <p className="rounded-lg border border-dashed border-[#303843] p-4 text-center text-[10px] text-slate-500">В пользовательской базе пока нет цветов.</p>}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div><h3 className="text-xs font-bold">Краски <span className="text-slate-500">· {paints.length}</span></h3><p className="mt-1 text-[10px] text-slate-500">Расход, фасовки и тип базы синхронизируются автоматически.</p></div>
            <button type="button" onClick={onAddPaint} className="btn-primary rounded-lg px-3 py-2 text-[10px] font-bold">Добавить краску</button>
          </div>
          <div className="grid gap-2">
            {paints.map((paint) => <RecordRow key={paint.id} title={`${paint.brand} · ${paint.name}`} subtitle={`${paint.finish} · ${paint.coverageDescription}`} />)}
            {!paints.length && <p className="rounded-lg border border-dashed border-[#303843] p-4 text-center text-[10px] text-slate-500">В пользовательской базе пока нет красок.</p>}
          </div>
        </section>
        {busyId && <p role="status" className="text-center text-[10px] text-slate-400">Сохраняем изменения в приватный GitHub…</p>}
      </div>
    </section>
  </div>;
}
