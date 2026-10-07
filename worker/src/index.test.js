import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
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
    createdAt: '',
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
    compatibleMaterials: ['wood', 'mineral', 'wallpaper', 'radiator', 'unknown'],
    recommendedProductIds: ['primer-one', 'primer-one', 'invalid id', 3],
  }, 'custom-paint-one');
  assert.equal(normalizedPaint.pricePerUnit, 800);
  assert.equal(normalizedPaint.paintCategory, 'varnish');
  assert.deepEqual(normalizedPaint.applications, ['terrace']);
  assert.equal(normalizedPaint.tintable, false);
  assert.deepEqual(normalizedPaint.tintBases, []);
  assert.deepEqual(normalizedPaint.compatibleMaterials, ['wood', 'mineral', 'wallpaper', 'radiator']);
  assert.deepEqual(normalizedPaint.recommendedProductIds, ['primer-one']);
});

test('normalizes plaster quantity in kilograms and retains the metal application', () => {
  const plaster = normalizePaintRecord({
    id: 'custom-paint-plaster',
    brand: 'Мастерская',
    name: 'Штукатурка',
    coverageBySurface: { plaster: [2.5, 2.5] },
    packageSizesKg: [5, 15, 25],
    quantityUnit: 'kg',
    paintCategory: 'plaster',
    applications: ['interior', 'metal'],
    pricePerUnit: 85,
  }, 'custom-paint-plaster');
  assert.equal(plaster.quantityUnit, 'kg');
  assert.deepEqual(plaster.packageSizesKg, [5, 15, 25]);
  assert.deepEqual(plaster.applications, ['interior', 'metal']);
  assert.equal(plaster.pricePerUnit, 85);
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
    const response = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog?type=colors&offset=0', {
      headers: { 'CF-Connecting-IP': '192.0.2.4' },
    }), env);
    assert.equal(response.status, 503);
    assert.equal(githubCalls, 1);
    assert.deepEqual(await response.json(), { error: 'Репозиторий с базой KolorLab должен быть приватным.' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reads the requested catalog page from the private repository', async () => {
  const env = createEnv();
  const paths = [];
  let activeDirectoryReads = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    paths.push(path);
    if (path === '/repos/owner/private-data') return Response.json({ private: true });
    activeDirectoryReads += 1;
    assert.equal(activeDirectoryReads, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeDirectoryReads -= 1;
    return Response.json([]);
  };
  try {
    const response = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog?type=colors&offset=0', {
      headers: { 'CF-Connecting-IP': '192.0.2.18' },
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { entries: [], nextOffset: null });
    assert.deepEqual(paths, [
      '/repos/owner/private-data',
      '/repos/owner/private-data/contents/catalog/colors',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries transient GitHub transport failures while reading catalogs', async () => {
  const env = createEnv();
  const paths = [];
  let colorReadFailures = 1;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    paths.push(path);
    if (path === '/repos/owner/private-data') return Response.json({ private: true });
    if (path.endsWith('/contents/catalog/colors') && colorReadFailures > 0) {
      colorReadFailures -= 1;
      throw new TypeError('Temporary network failure');
    }
    return Response.json([]);
  };
  try {
    const response = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog?type=colors&offset=0', {
      headers: { 'CF-Connecting-IP': '192.0.2.19' },
    }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { entries: [], nextOffset: null });
    assert.equal(paths.filter((path) => path.endsWith('/contents/catalog/colors')).length, 2);
    assert.equal(paths.filter((path) => path.endsWith('/contents/catalog/paints')).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('limits concurrent file reads while loading larger shared catalogs', async () => {
  const env = createEnv();
  const files = Array.from({ length: 13 }, (_, index) => ({
    type: 'file',
    name: `paint-${index}.json`,
    path: `catalog/paints/paint-${index}.json`,
  }));
  let activeReads = 0;
  let maximumConcurrentReads = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/repos/owner/private-data') return Response.json({ private: true });
    if (path.endsWith('/contents/catalog/colors')) return Response.json([]);
    if (path.endsWith('/contents/catalog/paints')) return Response.json(files);
    activeReads += 1;
    maximumConcurrentReads = Math.max(maximumConcurrentReads, activeReads);
    await new Promise((resolve) => setTimeout(resolve, 3));
    activeReads -= 1;
    const name = path.split('/').pop();
    const id = name.replace('.json', '');
    return Response.json({
      content: Buffer.from(JSON.stringify({
        id,
        brand: 'Kolor',
        name: id,
        coverageBySurface: { wall: [10, 10] },
      })).toString('base64'),
    });
  };
  try {
    const response = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog?type=paints&offset=0', {
      headers: { 'CF-Connecting-IP': '192.0.2.20' },
    }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).entries.length, files.length);
    assert.equal(maximumConcurrentReads, 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('serves catalog data in pages small enough for Worker subrequest limits', async () => {
  const env = createEnv();
  const files = Array.from({ length: 51 }, (_, index) => ({
    type: 'file',
    name: `color-${index}.json`,
    path: `catalog/colors/color-${index}.json`,
  }));
  let readsThisPage = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/repos/owner/private-data') return Response.json({ private: true });
    if (path.endsWith('/contents/catalog/colors')) {
      readsThisPage = 0;
      return Response.json(files);
    }
    if (path.endsWith('/contents/catalog/paints')) return Response.json([]);
    readsThisPage += 1;
    assert.ok(readsThisPage <= 20);
    const id = path.split('/').pop().replace('.json', '');
    return Response.json({
      content: Buffer.from(JSON.stringify({
        id,
        code: id,
        name_ru: id,
        hex: '#AABBCC',
      })).toString('base64'),
    });
  };
  try {
    const pages = [];
    for (const offset of [0, 20, 40]) {
      const response = await createWorkerResponse(new Request(`https://kolorlab-api.test/api/catalog?type=colors&offset=${offset}`, {
        headers: { 'CF-Connecting-IP': '192.0.2.21' },
      }), env);
      assert.equal(response.status, 200);
      pages.push(await response.json());
    }
    assert.deepEqual(pages.map((page) => page.entries.length), [20, 20, 11]);
    assert.deepEqual(pages.map((page) => page.nextOffset), [20, 40, null]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public catalog edits overlay built-in records and deletes them with tombstones', async () => {
  const env = createEnv();
  const originalFetch = globalThis.fetch;
  const files = new Map([
    ['/repos/owner/private-data/contents/catalog/colors/custom-color-one.json', {
      sha: 'existing-sha',
      value: { id: 'custom-color-one', code: 'D-01', name_ru: 'Тёплый камень', hex: '#AABBCC' },
    }],
  ]);
  let githubWrites = 0;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/repos/owner/private-data') return Response.json({ private: true });
    if (parsed.pathname.includes('/contents/catalog/')) {
      if (init.method === 'PUT') {
        const body = JSON.parse(init.body);
        const existing = files.get(parsed.pathname);
        assert.equal(body.sha, existing?.sha);
        const value = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
        files.set(parsed.pathname, { sha: `sha-${githubWrites + 1}`, value });
        githubWrites += 1;
        return Response.json({ content: { path: parsed.pathname } }, { status: existing ? 200 : 201 });
      }
      const existing = files.get(parsed.pathname);
      return existing
        ? Response.json({ sha: existing.sha, content: Buffer.from(JSON.stringify(existing.value), 'utf8').toString('base64') })
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
    assert.equal(files.get('/repos/owner/private-data/contents/catalog/colors/custom-color-one.json').value.code, 'D-02');

    const deletion = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog/colors/custom-color-one', {
      method: 'DELETE',
      headers: { 'CF-Connecting-IP': '192.0.2.5' },
    }), env);
    assert.equal(deletion.status, 200);
    assert.equal(files.get('/repos/owner/private-data/contents/catalog/colors/custom-color-one.json').value.deleted, true);

    const builtInPaintUpdate = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog/paints/tikkurila-harmony', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.7' },
      body: JSON.stringify({
        id: 'tikkurila-harmony',
        brand: 'Tikkurila',
        name: 'Обновлённая Гармония',
        coverageBySurface: { wall: [9, 9], plaster: [9, 9] },
      }),
    }), env);
    assert.equal(builtInPaintUpdate.status, 200);
    assert.equal(files.get('/repos/owner/private-data/contents/catalog/paints/tikkurila-harmony.json').value.name, 'Обновлённая Гармония');

    const builtInPaintDelete = await createWorkerResponse(new Request('https://kolorlab-api.test/api/catalog/paints/tikkurila-harmony', {
      method: 'DELETE',
      headers: { 'CF-Connecting-IP': '192.0.2.7' },
    }), env);
    assert.equal(builtInPaintDelete.status, 200);
    assert.equal(files.get('/repos/owner/private-data/contents/catalog/paints/tikkurila-harmony.json').value.deleted, true);
    assert.equal(githubWrites, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rate-limits anonymous catalog submissions by IP', async () => {
  const storage = new Map();
  const keyOptions = [];
  const env = createEnv({
    AUTH_KV: {
      async get(key) { return storage.get(key) ?? null; },
      async put(key, value, options) {
        storage.set(key, value);
        keyOptions.push({ key, options });
      },
    },
  });
  const legacyIpHash = createHmac('sha256', env.SESSION_SECRET).update('192.0.2.3').digest('base64url');
  storage.set(`catalog-create-ip:${legacyIpHash}`, '10');
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
    assert.ok(Number(response.headers.get('Retry-After')) > 0);
    assert.match((await response.json()).error, /примерно через/);
    assert.equal(githubWrites, 10);
    assert.equal(storage.get(`catalog-create-ip:${legacyIpHash}`), '10');
    assert.ok(keyOptions.every(({ key }) => key.startsWith('rate-v2:')));
    assert.ok(keyOptions.every(({ options }) => options.expirationTtl > 0));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns GitHub rate-limit reset information to the client', async () => {
  const env = createEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/repos/owner/private-data') return Response.json({ private: true });
    return Response.json({
      message: 'API rate limit exceeded for user ID 1.',
    }, {
      status: 403,
      headers: { 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 900) },
    });
  };
  try {
    const response = await createWorkerResponse(new Request('https://kolorlab-api.test/api/clients'), env);
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('Retry-After')) > 0);
    assert.match((await response.json()).error, /GitHub временно ограничил доступ/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('caches catalog record reads briefly to reduce GitHub API usage', async () => {
  const env = createEnv();
  const originalFetch = globalThis.fetch;
  let fileReads = 0;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/repos/owner/private-data') return Response.json({ private: true });
    if (parsed.pathname.endsWith('/contents/catalog/colors')) {
      return Response.json([{
        type: 'file',
        name: 'cache-test-color-one.json',
        path: 'catalog/colors/cache-test-color-one.json',
      }]);
    }
    if (parsed.pathname.endsWith('/contents/catalog/colors/cache-test-color-one.json')) {
      fileReads += 1;
      return Response.json({
        sha: 'color-sha',
        content: Buffer.from(JSON.stringify({
          id: 'cache-test-color-one',
          code: 'D-01',
          name_ru: 'Тёплый камень',
          hex: '#AABBCC',
        })).toString('base64'),
      });
    }
    assert.fail(`Unexpected GitHub request: ${parsed.href}`);
  };
  try {
    for (let index = 0; index < 2; index += 1) {
      const response = await createWorkerResponse(new Request(
        `https://kolorlab-api.test/api/catalog?type=colors&offset=0&run=${index}`,
      ), env);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).entries[0].id, 'cache-test-color-one');
    }
    assert.equal(fileReads, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('client phone and administrator authentication routes are disabled', async () => {
  const env = createEnv();
  for (const [path, method, body] of [
    ['/api/auth/admin-login', 'POST', { login: 'admin', password: 'secret' }],
    ['/api/auth/request-code', 'POST', { phone: '+79991234567' }],
  ]) {
    const response = await createWorkerResponse(new Request(`https://kolorlab-api.test${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }), env);
    assert.equal(response.status, 404);
  }
});

test('client cards and their projects require the owner PIN for changes', async () => {
  const env = createEnv();
  const files = new Map();
  const originalFetch = globalThis.fetch;
  let writeCount = 0;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/repos/owner/private-data') return Response.json({ private: true });
    if (parsed.pathname === '/repos/owner/private-data/contents/clients'
      || parsed.pathname === '/repos/owner/private-data/contents/projects') {
      return Response.json([...files.entries()]
        .filter(([path]) => path.includes(`/contents/${parsed.pathname.endsWith('/clients') ? 'clients' : 'projects'}/`))
        .map(([path]) => ({
        type: 'file',
        name: path.split('/').pop(),
        path: path.replace('/repos/owner/private-data/contents/', ''),
      })));
    }
    if (/\/contents\/(clients|projects)\//.test(parsed.pathname)) {
      const current = files.get(parsed.pathname);
      if (init.method === 'PUT') {
        const body = JSON.parse(init.body);
        const value = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
        files.set(parsed.pathname, { sha: `sha-${++writeCount}`, value });
        return Response.json({ content: { path: parsed.pathname } }, { status: current ? 200 : 201 });
      }
      return current
        ? Response.json({ sha: current.sha, content: Buffer.from(JSON.stringify(current.value), 'utf8').toString('base64') })
        : Response.json({ message: 'Not Found' }, { status: 404 });
    }
    assert.fail(`Unexpected request to ${parsed.href}`);
  };
  try {
    const created = await createWorkerResponse(new Request('https://kolorlab-api.test/api/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.8' },
      body: JSON.stringify({ name: 'Анна', phone: '+7 (999) 123-45-67', consent: true, pin: '123456' }),
    }), env);
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.client.name, 'Анна');
    assert.equal(createdBody.client.phoneLast4, '4567');
    assert.equal('phone' in createdBody.client, false);
    assert.equal(createdBody.client.hasPin, true);
    const [[filePath, stored]] = [...files.entries()];
    assert.match(filePath, /\/clients\/client-/);
    assert.equal(stored.value.phone, '79991234567');
    assert.notEqual(stored.value.pinHash, '123456');

    const legacyUpdate = await createWorkerResponse(new Request('https://kolorlab-api.test/api/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.12' },
      body: JSON.stringify({ name: 'Анна', phone: '+7 (999) 123-45-67', consent: true, pin: '654321' }),
    }), env);
    assert.equal(legacyUpdate.status, 403);

    const clientFilePath = [...files.keys()].find((path) => path.includes('/clients/'));
    const savedClient = files.get(clientFilePath);
    files.set(clientFilePath, {
      ...savedClient,
      value: Object.fromEntries(Object.entries(savedClient.value).filter(([key]) => key !== 'pinHash')),
    });

    const legacyDelete = await createWorkerResponse(new Request(`https://kolorlab-api.test/api/clients/${createdBody.client.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.15' },
      body: JSON.stringify({ pin: '123456' }),
    }), env);
    assert.equal(legacyDelete.status, 403);
    const legacyProjectWrite = await createWorkerResponse(new Request(`https://kolorlab-api.test/api/projects/${createdBody.client.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.21' },
      body: JSON.stringify({ pin: '123456', projects: [], projectNames: ['Проект клиента'] }),
    }), env);
    assert.equal(legacyProjectWrite.status, 403);
    files.set(clientFilePath, savedClient);

    const list = await createWorkerResponse(new Request('https://kolorlab-api.test/api/clients', {
      headers: { 'CF-Connecting-IP': '192.0.2.9' },
    }), env);
    assert.deepEqual(await list.json(), { clients: [createdBody.client] });

    const sharedProject = {
      key: 'ral-9003-123',
      clientId: createdBody.client.id,
      projectName: 'Общий проект',
      clientName: 'Анна',
      clientPhoneLast4: '4567',
      color: { id: 'ral-9003', code: 'RAL 9003', name_ru: 'Белый', hex: '#FFFFFF', base: 'A' },
      zone: 'Гостиная',
      quantity: 12,
      quantityUnit: 'л',
      cans: '1 × 9 л',
    };
    const verifyPin = await createWorkerResponse(new Request(`https://kolorlab-api.test/api/clients/${createdBody.client.id}/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.12' },
      body: JSON.stringify({ pin: '123456' }),
    }), env);
    assert.equal(verifyPin.status, 200);
    assert.deepEqual(await verifyPin.json(), { ok: true });

    const unverifiedSave = await createWorkerResponse(new Request(`https://kolorlab-api.test/api/projects/${createdBody.client.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.18' },
      body: JSON.stringify({ projects: [sharedProject], projectNames: ['Квартира'] }),
    }), env);
    assert.equal(unverifiedSave.status, 403);

    const saveProjects = await createWorkerResponse(new Request(`https://kolorlab-api.test/api/projects/${createdBody.client.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.13' },
      body: JSON.stringify({ pin: '123456', projects: [sharedProject], projectNames: ['Общий проект', 'Квартира'] }),
    }), env);
    assert.equal(saveProjects.status, 200);
    const storedProject = [...files.entries()].find(([path]) => path.endsWith(`/projects/${createdBody.client.id}.json`))[1].value;
    assert.equal('clientPhoneLast4' in storedProject.projects[0], false);
    assert.equal(storedProject.projects[0].projectName, 'Проект клиента');
    assert.equal(storedProject.projectNames.includes('Общий проект'), false);

    const remoteProjects = await createWorkerResponse(new Request('https://kolorlab-api.test/api/projects', {
      headers: { 'CF-Connecting-IP': '192.0.2.14' },
    }), env);
    const remoteProjectData = await remoteProjects.json();
    assert.equal(remoteProjectData.projects[0].projects[0].key, sharedProject.key);
    assert.equal(remoteProjectData.projects[0].projectNames.includes('Квартира'), true);
    assert.equal(remoteProjectData.projects[0].projectNames.includes('Общий проект'), false);

    const wrongProjectPin = await createWorkerResponse(new Request(`https://kolorlab-api.test/api/projects/${createdBody.client.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.19' },
      body: JSON.stringify({ pin: '000000', projects: [], projectNames: ['Проект клиента'] }),
    }), env);
    assert.equal(wrongProjectPin.status, 403);
    const unchangedProjects = await createWorkerResponse(new Request('https://kolorlab-api.test/api/projects', {
      headers: { 'CF-Connecting-IP': '192.0.2.20' },
    }), env);
    assert.equal(unchangedProjects.status, 200);
    assert.equal((await unchangedProjects.json()).projects[0].projects[0].key, sharedProject.key);

    const wrongPin = await createWorkerResponse(new Request(`https://kolorlab-api.test/api/clients/${createdBody.client.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.15' },
      body: JSON.stringify({ pin: '000000' }),
    }), env);
    assert.equal(wrongPin.status, 403);
    assert.equal(files.get(filePath).value.deleted, undefined);

    const deleted = await createWorkerResponse(new Request(`https://kolorlab-api.test/api/clients/${createdBody.client.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10' },
      body: JSON.stringify({ pin: '123456' }),
    }), env);
    assert.equal(deleted.status, 200);
    assert.equal(files.get(filePath).value.deleted, true);
    assert.equal(files.get(`/repos/owner/private-data/contents/projects/${createdBody.client.id}.json`).value.deleted, true);

    const recreated = await createWorkerResponse(new Request('https://kolorlab-api.test/api/clients', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.17' },
      body: JSON.stringify({ name: 'Другой человек', phone: '+7 (999) 123-45-67', consent: true, pin: '654321' }),
    }), env);
    assert.equal(recreated.status, 409);

    const afterDeletion = await createWorkerResponse(new Request('https://kolorlab-api.test/api/clients', {
      headers: { 'CF-Connecting-IP': '192.0.2.11' },
    }), env);
    assert.deepEqual(await afterDeletion.json(), { clients: [] });
    assert.deepEqual(await (await createWorkerResponse(new Request('https://kolorlab-api.test/api/projects', {
      headers: { 'CF-Connecting-IP': '192.0.2.16' },
    }), env)).json(), { projects: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('history lists safe change metadata without exposing record snapshots', async () => {
  const env = createEnv();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/repos/owner/private-data') return Response.json({ private: true });
    if (parsed.pathname === '/repos/owner/private-data/commits') {
      assert.equal(parsed.searchParams.get('path'), 'catalog/colors/custom-color-one.json');
      return Response.json([{
        sha: 'a'.repeat(40),
        author: { login: 'operator' },
        commit: {
          author: { date: '2026-10-06T12:00:00Z', name: 'Operator' },
          message: 'catalog: update colors custom-color-one [actor:device-1234abcd]',
        },
      }]);
    }
    assert.fail(`Unexpected GitHub request: ${parsed.href}`);
  };
  try {
    const response = await createWorkerResponse(new Request(
      'https://kolorlab-api.test/api/history?path=catalog%2Fcolors%2Fcustom-color-one.json',
    ), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      entries: [{
        sha: 'a'.repeat(40),
        date: '2026-10-06T12:00:00Z',
        author: 'operator',
        actor: 'device-1234abcd',
        action: 'catalog: update colors custom-color-one',
      }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('history restoration only accepts catalog and project paths and records an actor label', async () => {
  const env = createEnv();
  const originalFetch = globalThis.fetch;
  const restoredColor = { id: 'custom-color-one', code: 'D-01', name_ru: 'Версия из истории', hex: '#AABBCC' };
  let restoreMessage = '';
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/repos/owner/private-data') return Response.json({ private: true });
    if (parsed.pathname.endsWith('/custom-color-one.json') && parsed.searchParams.get('ref') === 'b'.repeat(40)) {
      return Response.json({ content: Buffer.from(JSON.stringify(restoredColor)).toString('base64') });
    }
    if (parsed.pathname.endsWith('/custom-color-one.json') && !init.method) {
      return Response.json({ sha: 'current-sha', content: Buffer.from('{}').toString('base64') });
    }
    if (parsed.pathname.endsWith('/custom-color-one.json') && init.method === 'PUT') {
      restoreMessage = JSON.parse(init.body).message;
      return Response.json({ content: {} });
    }
    assert.fail(`Unexpected GitHub request: ${parsed.href}`);
  };
  try {
    const invalid = await createWorkerResponse(new Request('https://kolorlab-api.test/api/history/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Kolorlab-Actor': 'device-1234abcd' },
      body: JSON.stringify({ path: 'clients/client-private.json', sha: 'b'.repeat(40) }),
    }), env);
    assert.equal(invalid.status, 400);

    const response = await createWorkerResponse(new Request('https://kolorlab-api.test/api/history/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Kolorlab-Actor': 'device-1234abcd' },
      body: JSON.stringify({ path: 'catalog/colors/custom-color-one.json', sha: 'b'.repeat(40) }),
    }), env);
    assert.equal(response.status, 200);
    assert.match(restoreMessage, /\[actor:device-1234abcd\]$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('restoring a client project version requires that client PIN', async () => {
  const env = createEnv();
  const clientId = 'client-history';
  const pin = '123456';
  const clientRecord = {
    id: clientId,
    pinHash: createHmac('sha256', env.SESSION_SECRET).update(`${clientId}:${pin}`).digest('base64url'),
  };
  const originalFetch = globalThis.fetch;
  let restored = false;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.pathname === '/repos/owner/private-data') return Response.json({ private: true });
    if (parsed.pathname.endsWith(`/clients/${clientId}.json`)) {
      return Response.json({ sha: 'client-sha', content: Buffer.from(JSON.stringify(clientRecord)).toString('base64') });
    }
    if (parsed.pathname.endsWith(`/projects/${clientId}.json`) && parsed.searchParams.get('ref') === 'b'.repeat(40)) {
      return Response.json({ content: Buffer.from(JSON.stringify({ restored: true })).toString('base64') });
    }
    if (parsed.pathname.endsWith(`/projects/${clientId}.json`) && !init.method) {
      return Response.json({ sha: 'current-project-sha', content: Buffer.from('{}').toString('base64') });
    }
    if (parsed.pathname.endsWith(`/projects/${clientId}.json`) && init.method === 'PUT') {
      restored = true;
      return Response.json({ content: {} });
    }
    assert.fail(`Unexpected GitHub request: ${parsed.href}`);
  };
  try {
    const createRequest = (requestPin) => new Request('https://kolorlab-api.test/api/history/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: `projects/${clientId}.json`,
        sha: 'b'.repeat(40),
        ...(requestPin ? { pin: requestPin } : {}),
      }),
    });
    const unauthorized = await createWorkerResponse(createRequest('000000'), env);
    assert.equal(unauthorized.status, 403);
    assert.equal(restored, false);

    const authorized = await createWorkerResponse(createRequest(pin), env);
    assert.equal(authorized.status, 200, await authorized.clone().text());
    assert.equal(restored, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
