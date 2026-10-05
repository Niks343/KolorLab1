import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerResponse, isAdministrator, normalizeColorRecord, normalizePaintRecord, normalizePhone } from './index.js';

function createEnv(overrides = {}) {
  const values = new Map();
  return {
    SESSION_SECRET: 'test-secret-0123456789-0123456789',
    GITHUB_TOKEN: 'test-token',
    GITHUB_OWNER: 'owner',
    GITHUB_REPO: 'private-data',
    AUTH_KV: {
      async get(key) { return values.get(key) ?? null; },
      async put(key, value) { values.set(key, value); },
    },
    ...overrides,
  };
}

test('normalizes common Russian phone formats into E.164', () => {
  assert.equal(normalizePhone('8 (999) 123-45-67'), '+79991234567');
  assert.equal(normalizePhone('+7 999 123 45 67'), '+79991234567');
  assert.throws(() => normalizePhone('123'));
});

test('validates custom catalog records and preserves admin phone normalization for later', () => {
  assert.equal(isAdministrator({ ADMIN_PHONES: '+7 999 123 45 67' }, '+79991234567'), true);
  assert.deepEqual(normalizeColorRecord({
    id: 'custom-color-one',
    code: 'D-01',
    name_ru: 'Тёплый камень',
    hex: '#aabbcc',
  }, 'custom-color-one'), {
    id: 'custom-color-one',
    code: 'D-01',
    name_ru: 'Тёплый камень',
    hex: '#AABBCC',
  });
  assert.throws(() => normalizeColorRecord({
    id: 'custom-color-other',
    code: 'D-01',
    name_ru: 'Тёплый камень',
    hex: '#AABBCC',
  }, 'custom-color-one'), { status: 400 });
  assert.equal(normalizePaintRecord({
    id: 'custom-paint-one',
    brand: 'Kolor',
    name: 'Матовая',
    coverageBySurface: { wall: [10, 10] },
    pricePerLiter: 800,
  }, 'custom-paint-one').pricePerLiter, 800);
});

test('public catalog submission creates new entries in a verified private GitHub repository only', async () => {
  const env = createEnv();
  const saved = new Map();
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    requests.push({ path: parsed.pathname, init });
    if (parsed.pathname === '/repos/owner/private-data') return Response.json({ private: true });
    if (parsed.pathname === '/repos/owner/private-data/contents/catalog/colors/custom-color-one.json') {
      if (init.method === 'PUT') {
        saved.set(parsed.pathname, JSON.parse(init.body));
        return Response.json({ content: { path: 'catalog/colors/custom-color-one.json' } }, { status: 201 });
      }
      return Response.json({ message: 'Not Found' }, { status: 404 });
    }
    assert.fail(`Unexpected request to ${parsed.href}`);
  };
  try {
    const response = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog/colors/custom-color-one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' },
      body: JSON.stringify({ id: 'custom-color-one', code: 'D-01', name_ru: 'Тёплый камень', hex: '#AABBCC' }),
    }), env);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).record.code, 'D-01');
    assert.equal(saved.size, 1);
    assert.equal(requests.filter(({ init }) => init.method === 'PUT').length, 1);
    assert.ok(requests.some(({ path }) => path === '/repos/owner/private-data'));
    const savedContent = saved.get('/repos/owner/private-data/contents/catalog/colors/custom-color-one.json').content;
    assert.equal(JSON.parse(Buffer.from(savedContent, 'base64').toString('utf8')).name_ru, 'Тёплый камень');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public catalog endpoint rejects edits, deletes, and duplicate IDs', async () => {
  const env = createEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/repos/owner/private-data') return Response.json({ private: true });
    if (parsed.pathname.endsWith('/custom-color-one.json')) {
      return init.method === 'PUT'
        ? Response.json({ content: { path: parsed.pathname } }, { status: 201 })
        : Response.json({ sha: 'existing-sha', content: btoa(JSON.stringify({ id: 'custom-color-one' })) });
    }
    assert.fail(`Unexpected request to ${parsed.href}`);
  };
  try {
    const duplicate = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog/colors/custom-color-one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.2' },
      body: JSON.stringify({ id: 'custom-color-one', code: 'D-01', name_ru: 'Тёплый камень', hex: '#AABBCC' }),
    }), env);
    assert.equal(duplicate.status, 409);

    const update = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog/colors/custom-color-one', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'custom-color-one', code: 'D-02', name_ru: 'Другой цвет', hex: '#FFFFFF' }),
    }), env);
    assert.equal(update.status, 405);

    const deletion = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog/colors/custom-color-one', {
      method: 'DELETE',
    }), env);
    assert.equal(deletion.status, 405);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rate-limits anonymous catalog submissions by IP', async () => {
  const storage = new Map();
  const env = createEnv({
    AUTH_KV: {
      async get(key) { return storage.get(key) ?? null; },
      async put(key, value) { storage.set(key, value); },
    },
  });
  const originalFetch = globalThis.fetch;
  let githubWrites = 0;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/repos/owner/private-data') return Response.json({ private: true });
    if (init.method === 'PUT') {
      githubWrites += 1;
      return Response.json({ content: { path: parsed.pathname } }, { status: 201 });
    }
    return Response.json({ message: 'Not Found' }, { status: 404 });
  };
  try {
    for (let index = 0; index < 10; index += 1) {
      const id = `custom-color-${index}`;
      const response = await createWorkerResponse(new Request(`https://kolorlab-api.test/api/catalog/colors/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.3' },
        body: JSON.stringify({ id, code: `D-${index}`, name_ru: `Цвет ${index}`, hex: '#AABBCC' }),
      }), env);
      assert.equal(response.status, 201);
    }
    const response = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog/colors/custom-color-over-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.3' },
      body: JSON.stringify({ id: 'custom-color-over-limit', code: 'D-X', name_ru: 'Лишняя запись', hex: '#AABBCC' }),
    }), env);
    assert.equal(response.status, 429);
    assert.equal(githubWrites, 10);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('client phone and administrator authentication routes are disabled', async () => {
  const env = createEnv();
  for (const [path, method, body] of [
    ['/api/auth/admin-login', 'POST', { login: 'admin', password: 'secret' }],
    ['/api/auth/request-code', 'POST', { phone: '+79991234567' }],
    ['/api/clients', 'GET', undefined],
  ]) {
    const response = await createWorkerResponse(new Request(`https://kolorlab-api.test${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), env);
    assert.equal(response.status, 404);
  }
});
