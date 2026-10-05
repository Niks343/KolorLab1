import { useState } from 'react';
import { ArrowLeft, ShieldCheck, X } from 'lucide-react';
import { apiBaseUrl, apiRequest, setSessionToken } from '../data/apiClient.js';

export default function PhoneAuthDialog({ open, onClose, onAuthenticated }) {
  const [authMode, setAuthMode] = useState('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const requestCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiRequest('/auth/request-code', {
        token: '',
        method: 'POST',
        body: JSON.stringify({ phone, name, consent }),
      });
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось отправить код.');
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest('/auth/verify-code', {
        token: '',
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      });
      setSessionToken(response.token);
      onAuthenticated(response.user);
      onClose();
      setCode('');
      setSent(false);
      setConsent(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось подтвердить номер.');
    } finally {
      setBusy(false);
    }
  };

  const loginAdmin = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest('/auth/admin-login', {
        token: '',
        method: 'POST',
        body: JSON.stringify({ login, password }),
      });
      setSessionToken(response.token);
      onAuthenticated(response.user);
      onClose();
      setPassword('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось войти как администратор.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    setError('');
    setCode('');
    setPassword('');
    setSent(false);
    setConsent(false);
    onClose();
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="phone-auth-title" className="panel my-auto w-full max-w-md p-5 shadow-2xl sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow flex items-center gap-2"><ShieldCheck size={13} />ВХОД И РЕГИСТРАЦИЯ</div>
          <h2 id="phone-auth-title" className="mt-1 font-['Manrope'] text-lg font-bold">{sent ? 'Подтвердите номер' : authMode === 'admin' ? 'Вход администратора' : 'Войти по телефону'}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{authMode === 'admin' ? 'Войдите с логином и паролем, заданными в секретах Cloudflare Worker.' : 'Номер и имя сохраняются в приватной базе KolorLab. SMS-код нужен для подтверждения владения номером.'}</p>
        </div>
        <button type="button" onClick={close} aria-label="Закрыть окно входа" className="icon-button h-9 w-9 shrink-0 rounded-lg text-slate-400"><X size={17} /></button>
      </div>
      {!apiBaseUrl
        ? <p role="alert" className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">Вход пока недоступен: сервер авторизации не подключён. Администратору нужно завершить настройки Cloudflare Worker.</p>
        : !sent && <div className="mb-4 grid grid-cols-2 rounded-lg border border-[#303843] bg-[#0d1117] p-1">
          <button type="button" onClick={() => { setAuthMode('phone'); setError(''); }} className={`rounded-md px-3 py-2 text-[11px] font-semibold transition ${authMode === 'phone' ? 'bg-[#202833] text-white' : 'text-slate-500 hover:text-slate-200'}`}>Клиент</button>
          <button type="button" onClick={() => { setAuthMode('admin'); setError(''); }} className={`rounded-md px-3 py-2 text-[11px] font-semibold transition ${authMode === 'admin' ? 'bg-[#202833] text-white' : 'text-slate-500 hover:text-slate-200'}`}>Администратор</button>
        </div>}
      {apiBaseUrl && authMode === 'admin' && !sent
        ? <form onSubmit={loginAdmin} className="space-y-4">
          <label className="block text-[10px] font-semibold text-slate-400">Логин администратора
            <input autoFocus required autoComplete="username" maxLength={40} value={login} onChange={(event) => setLogin(event.target.value)} placeholder="admin" className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
          </label>
          <label className="block text-[10px] font-semibold text-slate-400">Пароль
            <input required type="password" autoComplete="current-password" maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
          </label>
          {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-xs text-rose-200">{error}</p>}
          <button type="submit" disabled={busy || !login.trim() || !password} className="btn-primary flex w-full items-center justify-center rounded-lg py-2.5 text-xs font-bold disabled:opacity-50">{busy ? 'Проверка…' : 'Войти в управление'}</button>
        </form>
        : apiBaseUrl && (sent
          ? <form onSubmit={verifyCode} className="space-y-4">
            <p className="text-xs text-slate-300">Код отправлен на <strong className="text-white">{phone}</strong>.</p>
            <label className="block text-[10px] font-semibold text-slate-400">Шестизначный код
              <input autoFocus required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="field mt-1.5 w-full rounded-lg px-3 py-3 text-center font-mono text-lg tracking-[.4em]" />
            </label>
            {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-xs text-rose-200">{error}</p>}
            <div className="flex justify-between gap-2">
              <button type="button" onClick={() => { setSent(false); setCode(''); setError(''); }} disabled={busy} className="btn-secondary flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold disabled:opacity-50"><ArrowLeft size={14} />Изменить номер</button>
              <button type="submit" disabled={busy || code.length !== 6} className="btn-primary rounded-lg px-4 py-2.5 text-xs font-bold disabled:opacity-50">{busy ? 'Проверка…' : 'Подтвердить'}</button>
            </div>
          </form>
          : authMode === 'phone' && <form onSubmit={requestCode} className="space-y-4">
            <label className="block text-[10px] font-semibold text-slate-400">Имя клиента <span className="font-normal text-slate-600">· при регистрации</span>
              <input autoComplete="name" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Анна" className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
            </label>
            <label className="block text-[10px] font-semibold text-slate-400">Номер телефона
              <input autoFocus required type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 900 000-00-00" className="field mt-1.5 w-full rounded-lg px-3 py-2.5 text-xs" />
            </label>
            <label className="flex items-start gap-2.5 text-[10px] leading-relaxed text-slate-400">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 shrink-0 accent-[var(--primary-400)]" />
              <span>Согласен(на) на обработку и хранение имени и номера телефона для учётной записи KolorLab согласно <a href="https://github.com/Niks343/KolorLab1/blob/main/PRIVACY.md" target="_blank" rel="noreferrer" className="text-[var(--primary-300)] underline underline-offset-2">уведомлению о конфиденциальности</a>.</span>
            </label>
            {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2.5 text-xs text-rose-200">{error}</p>}
            <button type="submit" disabled={busy || !phone.trim() || !consent} className="btn-primary flex w-full items-center justify-center rounded-lg py-2.5 text-xs font-bold disabled:opacity-50">{busy ? 'Отправка…' : 'Получить SMS-код'}</button>
          </form>)}
    </section>
  </div>;
}
