import { useCallback, useEffect, useState } from 'react';
import { History, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { apiRequest } from '../data/apiClient.js';

const historyKinds = [
  { id: 'color', label: 'Цвет' },
  { id: 'paint', label: 'Краска' },
  { id: 'project', label: 'Проект клиента' },
];

function getPath(kind, ids) {
  if (kind === 'color' && ids.colorId) return `catalog/colors/${ids.colorId}.json`;
  if (kind === 'paint' && ids.paintId) return `catalog/paints/${ids.paintId}.json`;
  if (kind === 'project' && ids.clientId) return `projects/${ids.clientId}.json`;
  return '';
}

export default function ActivityHistoryDialog({ open, onClose, colorId, paintId, clientId, clientPin, onRestored }) {
  const [kind, setKind] = useState('color');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoringSha, setRestoringSha] = useState('');
  const [error, setError] = useState('');
  const path = getPath(kind, { colorId, paintId, clientId });

  const loadHistory = useCallback(async () => {
    if (!path) {
      setEntries([]);
      setError('Для выбранного раздела пока нет записи истории.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest(`/history?path=${encodeURIComponent(path)}`);
      setEntries(Array.isArray(result.entries) ? result.entries : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить историю.');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  if (!open) return null;

  const restoreVersion = async (entry) => {
    if (!window.confirm('Восстановить эту версию? Текущие данные будут сохранены в истории как новое изменение.')) return;
    setRestoringSha(entry.sha);
    setError('');
    try {
      await apiRequest('/history/restore', {
        method: 'POST',
        body: JSON.stringify({ path, sha: entry.sha, ...(kind === 'project' ? { pin: clientPin } : {}) }),
      });
      await loadHistory();
      onRestored?.(kind);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось восстановить версию.');
    } finally {
      setRestoringSha('');
    }
  };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="activity-history-title" className="panel w-full max-w-2xl overflow-hidden rounded-2xl border border-[#303945] shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-[#252b33] p-4 sm:p-5">
        <div>
          <div className="eyebrow flex items-center gap-2"><History size={13} />ИСТОРИЯ ОБЩЕЙ БАЗЫ</div>
          <h2 id="activity-history-title" className="mt-1 text-lg font-semibold">Изменения и восстановление</h2>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Автор — учётная запись GitHub, сохранившая версию. Метка устройства создаётся браузером и не подтверждает личность.</p>
        </div>
        <button type="button" aria-label="Закрыть историю" onClick={onClose} className="icon-button rounded-lg p-2 text-slate-400"><X size={17} /></button>
      </header>
      <div className="flex gap-1.5 overflow-x-auto border-b border-[#252b33] px-4 py-3 sm:px-5">
        {historyKinds.map((item) => <button key={item.id} type="button" onClick={() => setKind(item.id)} className={`chip shrink-0 rounded-lg px-3 py-2 text-[10px] font-semibold ${kind === item.id ? 'active' : ''}`}>{item.label}</button>)}
      </div>
      <div className="max-h-[60vh] min-h-48 overflow-y-auto p-4 sm:p-5">
        {loading ? <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-400"><LoaderCircle size={15} className="animate-spin" />Загружаем историю…</div>
          : error ? <div role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-100/80">{error}</div>
            : entries.length ? <ol className="space-y-2">
              {entries.map((entry, index) => <li key={entry.sha} className="rounded-xl border border-[#2b323c] bg-[#0d1117] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-200">{entry.action || 'Изменение записи'}</div>
                    <div className="mt-1 text-[10px] text-slate-400">{entry.author}{entry.actor ? ` · ${entry.actor}` : ''}</div>
                    <time className="mt-1 block text-[9px] text-slate-500" dateTime={entry.date}>{entry.date ? new Date(entry.date).toLocaleString('ru-RU') : 'Дата не указана'} · {entry.sha.slice(0, 8)}</time>
                  </div>
                  <button type="button" onClick={() => restoreVersion(entry)} disabled={index === 0 || Boolean(restoringSha) || (kind === 'project' && !clientPin)} className="btn-secondary flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[9px] font-semibold disabled:cursor-not-allowed disabled:opacity-40">
                    {restoringSha === entry.sha ? <LoaderCircle size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                    {index === 0 ? 'Текущая версия' : kind === 'project' && !clientPin ? 'Разблокируйте карточку' : 'Восстановить'}
                  </button>
                </div>
              </li>)}
            </ol>
              : <p className="py-12 text-center text-xs text-slate-500">История изменений пока пуста.</p>}
      </div>
    </section>
  </div>;
}
