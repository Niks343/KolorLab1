import { enqueueOfflineRequest, readOfflineRequests, removeOfflineRequest } from './offlineQueue.js';
const tokenKey = 'kolorlab.auth.token';
const actorKey = 'kolorlab.device.actor';
let temporaryActorLabel = '';

export const apiBaseUrl = (import.meta.env.VITE_KOLORLAB_API_URL ?? '').replace(/\/+$/, '');

export function getSessionToken() {
  return window.sessionStorage.getItem(tokenKey) ?? '';
}

export function setSessionToken(token) {
  if (token) window.sessionStorage.setItem(tokenKey, token);
  else window.sessionStorage.removeItem(tokenKey);
}

function getActorLabel() {
  if (temporaryActorLabel) return temporaryActorLabel;
  try {
    let label = window.localStorage.getItem(actorKey);
    if (!label) {
      label = `device-${crypto.randomUUID().slice(0, 8)}`;
      window.localStorage.setItem(actorKey, label);
    }
    return label;
  } catch (error) {
    console.warn('Не удалось сохранить метку браузера; для этой сессии будет использована временная метка.', error);
    temporaryActorLabel ||= `session-${crypto.randomUUID().slice(0, 8)}`;
    return temporaryActorLabel;
  }
}

function makeQueuedResponse(path, body, metadata) {
  let record = {};
  try {
    record = typeof body === 'string' ? JSON.parse(body) : body ?? {};
  } catch {
    record = {};
  }
  if (path === '/clients') {
    const id = metadata?.clientId ?? `client-pending-${crypto.randomUUID()}`;
    const phoneDigits = String(record.phone ?? '').replace(/\D/g, '');
    return {
      queued: true,
      client: {
        id,
        name: String(record.name ?? 'Новый клиент'),
        phoneLast4: phoneDigits.slice(-4),
        createdAt: new Date().toISOString(),
        hasPin: true,
        remote: false,
        pendingSync: true,
      },
    };
  }
  return { queued: true, record };
}

async function queueRequest(path, options, metadata) {
  await enqueueOfflineRequest({
    path,
    method: (options.method ?? 'GET').toUpperCase(),
    body: options.body ?? null,
    metadata: metadata ?? null,
  });
  window.dispatchEvent(new Event('kolorlab-sync-queue-changed'));
  return makeQueuedResponse(path, options.body, metadata);
}

let queueFlushPromise = null;

async function sendOfflineQueue() {
  if (!apiBaseUrl || !navigator.onLine) return { sent: 0, remaining: (await readOfflineRequests()).length };
  const pending = await readOfflineRequests();
  let sent = 0;
  let failure = '';
  for (const item of pending) {
    let response;
    try {
      response = await fetch(`${apiBaseUrl}/api${item.request.path}`, {
        method: item.request.method,
        headers: { 'Content-Type': 'application/json', 'X-Kolorlab-Actor': getActorLabel() },
        ...(item.request.body ? { body: item.request.body } : {}),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      failure = 'Соединение прервалось; записи оставлены в зашифрованной очереди.';
      break;
    }
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok && !(response.status === 404 && item.request.method === 'DELETE')) {
      failure = typeof payload?.error === 'string'
        ? `${payload.error} Запись оставлена в очереди.`
        : `Сервер вернул ошибку ${response.status}. Запись оставлена в очереди.`;
      break;
    }
    await removeOfflineRequest(item.id);
    sent += 1;
    window.dispatchEvent(new CustomEvent('kolorlab-sync-write-complete', {
      detail: {
        path: item.request.path,
        metadata: item.request.metadata,
        payload,
      },
    }));
  }
  const remaining = (await readOfflineRequests()).length;
  window.dispatchEvent(new CustomEvent('kolorlab-sync-status', { detail: { sent, remaining, failure } }));
  window.dispatchEvent(new Event('kolorlab-sync-queue-changed'));
  return { sent, remaining };
}

export async function flushOfflineQueue() {
  if (queueFlushPromise) return queueFlushPromise;
  queueFlushPromise = sendOfflineQueue();
  try {
    return await queueFlushPromise;
  } finally {
    queueFlushPromise = null;
  }
}

export async function apiRequest(path, {
  token = getSessionToken(),
  queueOffline = false,
  offlineMetadata = null,
  ...options
} = {}) {
  if (!apiBaseUrl) throw new Error('Сервер авторизации ещё не подключён.');
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('X-Kolorlab-Actor', getActorLabel());
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const isReadRequest = (options.method ?? 'GET').toUpperCase() === 'GET';
  const maxAttempts = isReadRequest ? 3 : 1;
  let response = null;
  let networkError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      response = await fetch(`${apiBaseUrl}/api${path}`, { ...options, headers });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      networkError = error;
      if (attempt + 1 < maxAttempts) {
        await new Promise((resolve) => window.setTimeout(resolve, 200 * (attempt + 1)));
        continue;
      }
      if (queueOffline && (options.method ?? 'GET').toUpperCase() !== 'GET') {
        return queueRequest(path, options, offlineMetadata);
      }
      console.error('Не удалось связаться с сервером KolorLab.', error);
      throw new Error('Сервер временно недоступен. Проверьте подключение и повторите попытку.');
    }
    if (![502, 503, 504].includes(response.status) || attempt + 1 === maxAttempts) break;
    await new Promise((resolve) => window.setTimeout(resolve, 200 * (attempt + 1)));
  }

  if (!response) {
    console.error('Не удалось связаться с сервером KolorLab.', networkError);
    throw new Error('Сервер временно недоступен. Проверьте подключение и повторите попытку.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) {
      setSessionToken('');
      window.dispatchEvent(new Event('kolorlab-auth-expired'));
    }
    if (queueOffline && response.status >= 500 && (options.method ?? 'GET').toUpperCase() !== 'GET') {
      return queueRequest(path, options, offlineMetadata);
    }
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Ошибка сервера (${response.status}).`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Сервер вернул ответ в неподдерживаемом формате.');
  }
  return payload;
}
