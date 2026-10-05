import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerResponse, normalizeColorRecord, normalizePaintRecord } from './index.js';

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
      async delete(key) { values.delete(key); },
    },
    ...overrides,
  };
}

test('validates custom color and paint records', () => {
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
  const normalizedPaint = normalizePaintRecord({
    id: 'custom-paint-one',
    brand: 'Kolor',
    name: 'Матовая',
    coverageBySurface: { wall: [10, 10] },
    pricePerLiter: 800,
    paintCategory: 'varnish',
    applications: ['terrace', 'invalid'],
    tintable: false,
    tintBases: ['A'],
    compatibleMaterials: ['wood', 'unknown'],
  }, 'custom-paint-one');
  assert.equal(normalizedPaint.pricePerLiter, 800);
  assert.equal(normalizedPaint.paintCategory, 'varnish');
  assert.deepEqual(normalizedPaint.applications, ['terrace']);
  assert.equal(normalizedPaint.tintable, false);
  assert.deepEqual(normalizedPaint.tintBases, []);
  assert.deepEqual(normalizedPaint.compatibleMaterials, ['wood']);
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

test('refuses catalog access when the configured GitHub repository is public', async () => {
  const env = createEnv();
  let githubCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    githubCalls += 1;
    return Response.json({ private: false });
  };
  try {
    const response = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog', {
      headers: { 'CF-Connecting-IP': '192.0.2.4' },
    }), env);
    assert.equal(response.status, 503);
    assert.equal(githubCalls, 1);
    assert.deepEqual(await response.json(), { error: 'Репозиторий с базой KolorLab должен быть приватным.' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public catalog edits and deletes update GitHub records', async () => {
  const env = createEnv();
  const originalFetch = globalThis.fetch;
  let storedRecord = { id: 'custom-color-one', code: 'D-01', name_ru: 'Тёплый камень', hex: '#AABBCC' };
  let sha = 'existing-sha';
  let githubWrites = 0;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/repos/owner/private-data') return Response.json({ private: true });
    if (parsed.pathname.endsWith('/custom-color-one.json')) {
      if (init.method === 'PUT') {
        const body = JSON.parse(init.body);
        assert.equal(body.sha, sha);
        storedRecord = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
        sha = 'updated-sha';
        githubWrites += 1;
        return Response.json({ content: { path: parsed.pathname } });
      }
      if (init.method === 'DELETE') {
        assert.equal(JSON.parse(init.body).sha, sha);
        storedRecord = null;
        githubWrites += 1;
        return Response.json({ commit: { sha: 'deleted-sha' } });
      }
      return storedRecord
        ? Response.json({ sha, content: Buffer.from(JSON.stringify(storedRecord), 'utf8').toString('base64') })
        : Response.json({ message: 'Not Found' }, { status: 404 });
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
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.5' },
      body: JSON.stringify({ id: 'custom-color-one', code: 'D-02', name_ru: 'Другой цвет', hex: '#FFFFFF' }),
    }), env);
    assert.equal(update.status, 200);
    assert.equal(storedRecord.code, 'D-02');

    const deletion = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog/colors/custom-color-one', {
      method: 'DELETE',
      headers: { 'CF-Connecting-IP': '192.0.2.5' },
    }), env);
    assert.equal(deletion.status, 200);
    assert.equal(storedRecord, null);
    assert.equal(githubWrites, 2);
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
