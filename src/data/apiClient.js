const tokenKey = 'kolorlab.auth.token';

export const apiBaseUrl = (import.meta.env.VITE_KOLORLAB_API_URL ?? '').replace(/\/+$/, '');

export function getSessionToken() {
  return window.sessionStorage.getItem(tokenKey) ?? '';
}

export function setSessionToken(token) {
  if (token) window.sessionStorage.setItem(tokenKey, token);
  else window.sessionStorage.removeItem(tokenKey);
}

export async function apiRequest(path, { token = getSessionToken(), ...options } = {}) {
  if (!apiBaseUrl) throw new Error('Сервер авторизации ещё не подключён.');
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${apiBaseUrl}/api${path}`, { ...options, headers });
  } catch (error) {
    console.error('Не удалось связаться с сервером KolorLab.', error);
    throw new Error('Сервер временно недоступен. Проверьте подключение и повторите попытку.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) {
      setSessionToken('');
      window.dispatchEvent(new Event('kolorlab-auth-expired'));
    }
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Ошибка сервера (${response.status}).`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Сервер вернул ответ в неподдерживаемом формате.');
  }
  return payload;
}
