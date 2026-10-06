const allowedSurfaces = new Set(['wall', 'plaster', 'bath', 'facade']);
const allowedPaintCategories = new Set(['facade', 'interior', 'plaster', 'three-in-one', 'primer', 'impregnation', 'varnish', 'enamel', 'oil']);
const allowedPaintApplications = new Set(['facade', 'interior', 'terrace', 'bath', 'metal']);
const allowedPaintMaterials = new Set(['mineral', 'wallpaper', 'metal', 'radiator', 'plastic', 'wood', 'doors', 'windows', 'slopes']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function safeId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) {
    throw new HttpError(400, 'Некорректный идентификатор записи.');
  }
  return value;
}

function normalizeColorRecord(value, id) {
  if (!value || value.id !== id
    || typeof value.code !== 'string' || !value.code.trim() || value.code.length > 40
    || typeof value.name_ru !== 'string' || !value.name_ru.trim() || value.name_ru.length > 80
    || typeof value.hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.hex)) {
    throw new HttpError(400, 'Проверьте код, название и HEX-код цвета.');
  }
  return {
    id,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    code: value.code.trim(),
    name_ru: value.name_ru.trim(),
    hex: value.hex.toUpperCase(),
    ...(typeof value.catalog === 'string' && value.catalog.trim() ? { catalog: value.catalog.trim().slice(0, 80) } : {}),
  };
}

function normalizePaintRecord(value, id) {
  if (!value || value.id !== id
    || typeof value.brand !== 'string' || !value.brand.trim() || value.brand.length > 60
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80
    || !value.coverageBySurface || typeof value.coverageBySurface !== 'object' || Array.isArray(value.coverageBySurface)) {
    throw new HttpError(400, 'Проверьте бренд, название и параметры краски.');
  }
  const coverageBySurface = {};
  for (const [surface, values] of Object.entries(value.coverageBySurface)) {
    if (!allowedSurfaces.has(surface) || !Array.isArray(values) || values.length !== 2
      || values.some((number) => !Number.isFinite(number) || number < 0.1 || number > 100)) continue;
    coverageBySurface[surface] = values;
  }
  const packageSizesLiters = value.packageSizesLiters == null ? null : value.packageSizesLiters;
  const packageSizesKg = value.packageSizesKg == null ? null : value.packageSizesKg;
  if (!Object.keys(coverageBySurface).length
    || (packageSizesLiters !== null && (!Array.isArray(packageSizesLiters) || packageSizesLiters.length > 12
      || packageSizesLiters.some((number) => !Number.isFinite(number) || number <= 0 || number > 100)))
    || (packageSizesKg !== null && (!Array.isArray(packageSizesKg) || packageSizesKg.length > 12
      || packageSizesKg.some((number) => !Number.isFinite(number) || number <= 0 || number > 100)))) {
    throw new HttpError(400, 'Проверьте расход, фасовки и поверхности краски.');
  }
  const paintCategory = allowedPaintCategories.has(value.paintCategory) ? value.paintCategory : 'interior';
  const applications = Array.isArray(value.applications)
    ? [...new Set(value.applications.filter((item) => allowedPaintApplications.has(item)))]
    : [];
  const tintable = typeof value.tintable === 'boolean' ? value.tintable : null;
  const tintBases = tintable === false
    ? []
    : Array.isArray(value.tintBases) ? [...new Set(value.tintBases.filter((base) => base === 'A' || base === 'C'))] : [];
  const compatibleMaterials = Array.isArray(value.compatibleMaterials)
    ? [...new Set(value.compatibleMaterials.filter((item) => allowedPaintMaterials.has(item)))]
    : [];
  return {
    id,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    brand: value.brand.trim(),
    name: value.name.trim(),
    finish: typeof value.finish === 'string' ? value.finish.trim().slice(0, 80) : '',
    purpose: typeof value.purpose === 'string' ? value.purpose.trim().slice(0, 180) : '',
    coverageBySurface,
    coverageDescription: typeof value.coverageDescription === 'string' ? value.coverageDescription.slice(0, 120) : '',
    baseSystem: typeof value.baseSystem === 'string' ? value.baseSystem.trim().slice(0, 120) : '',
    packageSizesLiters,
    packageSizesKg,
    quantityUnit: value.quantityUnit === 'kg' || paintCategory === 'plaster' ? 'kg' : 'L',
    tintBases,
    paintCategory,
    applications,
    tintable,
    compatibleMaterials,
    pricePerUnit: Number.isFinite(value.pricePerUnit ?? value.pricePerLiter) && (value.pricePerUnit ?? value.pricePerLiter) >= 0 && (value.pricePerUnit ?? value.pricePerLiter) <= 1_000_000
      ? value.pricePerUnit ?? value.pricePerLiter
      : null,
  };
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

async function requestHash(env, value) {
  return base64UrlEncode(await hmac(env.SESSION_SECRET, value));
}

async function readJson(request, maxBytes = 12_000) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new HttpError(413, 'Запрос слишком большой.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Некорректный JSON в запросе.');
  }
}

function configured(env) {
  for (const key of ['SESSION_SECRET', 'GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'AUTH_KV']) {
    if (!env[key]) throw new HttpError(503, `Сервер не настроен: отсутствует параметр ${key}.`);
  }
  if (new TextEncoder().encode(env.SESSION_SECRET).length < 32) {
    throw new HttpError(503, 'SESSION_SECRET должен содержать не менее 32 байт.');
  }
}

function githubHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'KolorLab-Worker',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function githubRequest(env, path, init = {}) {
  const readRequest = !init.method || init.method === 'GET';
  const maxAttempts = readRequest ? 3 : 1;
  let response = null;
  let transportError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      response = await fetch(`https://api.github.com${path}`, {
        ...init,
        headers: { ...githubHeaders(env), ...init.headers },
      });
      break;
    } catch (error) {
      transportError = error;
      if (attempt + 1 < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
  }
  if (!response) {
    console.error('GitHub API transport failed.', {
      path,
      attempts: maxAttempts,
      errorName: transportError instanceof Error ? transportError.name : 'Unknown error',
    });
    throw new HttpError(502, 'Не удалось связаться с защищённой базой GitHub.');
  }
  const responseBody = await response.text();
  let result;
  try {
    result = responseBody ? JSON.parse(responseBody) : null;
  } catch {
    result = null;
  }
  if (response.status === 404 && init.allowNotFound) return null;
  if (response.status === 422 && init.createOnly) {
    throw new HttpError(409, 'Запись с таким идентификатором уже существует.');
  }
  if (!response.ok) {
    console.error('GitHub API request failed.', {
      status: response.status,
      requestId: response.headers.get('x-github-request-id'),
      contentType: response.headers.get('content-type'),
      message: result?.message ?? responseBody.slice(0, 500),
    });
    throw new HttpError(502, 'Не удалось сохранить данные в защищённой базе GitHub.');
  }
  return result;
}

function repositoryPath(env, path = '') {
  const owner = encodeURIComponent(env.GITHUB_OWNER);
  const repo = encodeURIComponent(env.GITHUB_REPO);
  return `/repos/${owner}/${repo}/contents/${path}`;
}

function withActor(request, message) {
  const actor = request.headers.get('X-Kolorlab-Actor') ?? '';
  const safeActor = /^[a-zA-Z0-9_-]{1,40}$/.test(actor) ? actor : 'unknown-device';
  return `${message} [actor:${safeActor}]`;
}

function safeHistoryPath(value) {
  if (typeof value !== 'string'
    || !/^(catalog\/(?:colors|paints)\/[a-zA-Z0-9_-]{1,200}\.json|projects\/client-[a-zA-Z0-9_-]{1,200}\.json)$/.test(value)) {
    throw new HttpError(400, 'Для истории выберите запись каталога или проект клиента.');
  }
  return value;
}

async function handleHistory(request, env, pathSegments) {
  await limitByIp(request, env, 'history-read-ip', 120, 3600);
  await ensurePrivateRepository(env);
  if (pathSegments.length === 0 && request.method === 'GET') {
    const url = new URL(request.url);
    const path = safeHistoryPath(url.searchParams.get('path'));
    const owner = encodeURIComponent(env.GITHUB_OWNER);
    const repo = encodeURIComponent(env.GITHUB_REPO);
    const commits = await githubRequest(env, `/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=20`);
    if (!Array.isArray(commits)) throw new HttpError(502, 'Не удалось загрузить историю изменений.');
    return json({
      entries: commits.map((item) => {
        const message = typeof item.commit?.message === 'string' ? item.commit.message : '';
        const actor = message.match(/\[actor:([a-zA-Z0-9_-]{1,40})\]/)?.[1] ?? '';
        return {
          sha: item.sha,
          date: item.commit?.author?.date ?? item.commit?.committer?.date ?? '',
          author: item.author?.login ?? item.commit?.author?.name ?? 'Неизвестный автор',
          actor,
          action: message.replace(/\s*\[actor:[a-zA-Z0-9_-]{1,40}\]\s*$/, ''),
        };
      }),
    });
  }
  if (pathSegments.length === 1 && pathSegments[0] === 'restore' && request.method === 'POST') {
    await limitByIp(request, env, 'history-restore-ip', 20, 3600);
    const body = await readJson(request, 2_000);
    const path = safeHistoryPath(body.path);
    if (typeof body.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(body.sha)) {
      throw new HttpError(400, 'Выберите версию из истории.');
    }
    const projectMatch = path.match(/^projects\/(client-[a-zA-Z0-9_-]{1,200})\.json$/);
    if (projectMatch) {
      const client = await readGithubFile(env, `clients/${projectMatch[1]}.json`);
      if (!client) throw new HttpError(404, 'Карточка клиента не найдена.');
      await verifyClientPin(env, client.value, body.pin);
    }
    const previous = await githubRequest(env, `${repositoryPath(env, path)}?ref=${encodeURIComponent(body.sha)}`, { allowNotFound: true });
    if (!previous) throw new HttpError(404, 'Выбранная версия записи не найдена.');
    const value = decodeGithubFile(previous);
    await updateGithubFile(env, path, value, withActor(request, `history: restore ${path} from ${body.sha.slice(0, 7)}`));
    return json({ ok: true });
  }
  throw new HttpError(405, 'Для истории доступны просмотр и восстановление версии.');
}

async function ensurePrivateRepository(env) {
  const repository = await githubRequest(env, `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`);
  if (repository.private !== true) {
    throw new HttpError(503, 'Репозиторий с базой KolorLab должен быть приватным.');
  }
}

function decodeGithubFile(file) {
  if (typeof file?.content !== 'string') throw new HttpError(502, 'Файл общей базы GitHub имеет неподдерживаемый формат.');
  const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), (character) => character.charCodeAt(0));
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(502, 'Не удалось прочитать запись из общей базы GitHub.');
  }
}

async function readGithubFile(env, path) {
  const file = await githubRequest(env, repositoryPath(env, path), { allowNotFound: true });
  return file ? { sha: file.sha, value: decodeGithubFile(file) } : null;
}

async function createGithubFile(env, path, value, message) {
  await ensurePrivateRepository(env);
  const existing = await readGithubFile(env, path);
  if (existing) throw new HttpError(409, 'Запись с таким идентификатором уже существует.');
  const content = base64UrlEncode(new TextEncoder().encode(JSON.stringify(value, null, 2)))
    .replace(/-/g, '+').replace(/_/g, '/');
  return githubRequest(env, repositoryPath(env, path), {
    method: 'PUT',
    createOnly: true,
    body: JSON.stringify({
      message,
      content: content.padEnd(Math.ceil(content.length / 4) * 4, '='),
      branch: env.GITHUB_BRANCH || 'main',
    }),
  });
}

async function updateGithubFile(env, path, value, message) {
  await ensurePrivateRepository(env);
  const existing = await readGithubFile(env, path);
  const content = base64UrlEncode(new TextEncoder().encode(JSON.stringify(value, null, 2)))
    .replace(/-/g, '+').replace(/_/g, '/');
  return githubRequest(env, repositoryPath(env, path), {
    method: 'PUT',
    body: JSON.stringify({
      message,
      ...(existing ? { sha: existing.sha } : {}),
      content: content.padEnd(Math.ceil(content.length / 4) * 4, '='),
      branch: env.GITHUB_BRANCH || 'main',
    }),
  });
}

async function listGithubDirectory(env, path) {
  const contents = await githubRequest(env, repositoryPath(env, path), { allowNotFound: true });
  if (!contents) return [];
  if (!Array.isArray(contents)) throw new HttpError(502, 'Не удалось прочитать каталог общей базы GitHub.');
  const files = contents.filter((entry) => entry.type === 'file' && entry.name.endsWith('.json'));
  const records = [];
  for (let index = 0; index < files.length; index += 6) {
    const batch = await Promise.all(files.slice(index, index + 6).map(async (entry) => (
      decodeGithubFile(await githubRequest(env, repositoryPath(env, entry.path)))
    )));
    records.push(...batch);
  }
  return records;
}

async function readGithubDirectoryPage(env, path, offset, limit) {
  const contents = await githubRequest(env, repositoryPath(env, path), { allowNotFound: true });
  if (!contents) return { records: [], nextOffset: null };
  if (!Array.isArray(contents)) throw new HttpError(502, 'Не удалось прочитать каталог общей базы GitHub.');
  const files = contents.filter((entry) => entry.type === 'file' && entry.name.endsWith('.json'));
  const page = files.slice(offset, offset + limit);
  const records = [];
  for (let index = 0; index < page.length; index += 6) {
    const batch = await Promise.all(page.slice(index, index + 6).map(async (entry) => (
      decodeGithubFile(await githubRequest(env, repositoryPath(env, entry.path)))
    )));
    records.push(...batch);
  }
  const nextOffset = offset + page.length < files.length ? offset + page.length : null;
  return { records, nextOffset };
}

async function allowRequest(env, key, limit, ttlSeconds) {
  const count = Number(await env.AUTH_KV.get(key) ?? 0);
  if (count >= limit) throw new HttpError(429, 'Слишком много запросов. Повторите позже.');
  await env.AUTH_KV.put(key, String(count + 1), { expirationTtl: ttlSeconds });
}

async function limitByIp(request, env, keyPrefix, limit, ttlSeconds) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await requestHash(env, ip);
  await allowRequest(env, `${keyPrefix}:${ipHash}`, limit, ttlSeconds);
}

async function handleCatalog(request, env, pathSegments) {
  if (request.method === 'GET' && pathSegments.length === 0) {
    await limitByIp(request, env, 'catalog-read-ip', 600, 3600);
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const directory = type === 'colors' ? 'catalog/colors' : type === 'paints' ? 'catalog/paints' : null;
    const offset = Number(url.searchParams.get('offset') ?? 0);
    if (!directory || !Number.isSafeInteger(offset) || offset < 0) {
      throw new HttpError(400, 'Для загрузки каталога укажите type=colors или type=paints и корректное смещение.');
    }
    await ensurePrivateRepository(env);
    const { records, nextOffset } = await readGithubDirectoryPage(env, directory, offset, 20);
    return json({ entries: records, nextOffset });
  }

  const [kind, rawId] = pathSegments;
  const directories = { colors: 'colors', paints: 'paints' };
  const directory = directories[kind];
  if (!directory || pathSegments.length !== 2) throw new HttpError(404, 'Маршрут каталога не найден.');
  const id = safeId(decodeURIComponent(rawId));
  const path = `catalog/${directory}/${id}.json`;
  if (request.method === 'POST') {
    await limitByIp(request, env, 'catalog-create-ip', 10, 3600);
    if (!id.startsWith(kind === 'colors' ? 'custom-color-' : 'custom-paint-')) {
      throw new HttpError(400, 'Для новой записи используйте идентификатор пользовательского каталога.');
    }
    const body = await readJson(request);
    const value = {
      ...(kind === 'colors' ? normalizeColorRecord(body, id) : normalizePaintRecord(body, id)),
      createdAt: new Date().toISOString(),
    };
    await createGithubFile(env, path, value, withActor(request, `catalog: add ${kind} ${id}`));
    return json({ ok: true, record: value }, 201);
  }
  if (request.method !== 'PUT' && request.method !== 'DELETE') {
    throw new HttpError(405, 'Для этой записи разрешено добавление, редактирование и удаление.');
  }
  await limitByIp(request, env, 'catalog-edit-delete-ip', 60, 3600);
  if (request.method === 'DELETE') {
    await updateGithubFile(env, path, { id, deleted: true }, withActor(request, `catalog: delete ${kind} ${id}`));
    return json({ ok: true });
  }
  const body = await readJson(request);
  const existing = await readGithubFile(env, path);
  const value = {
    ...(kind === 'colors' ? normalizeColorRecord(body, id) : normalizePaintRecord(body, id)),
    createdAt: existing?.value?.createdAt || new Date().toISOString(),
  };
  await updateGithubFile(env, path, value, withActor(request, `catalog: update ${kind} ${id}`));
  return json({ ok: true, record: value });
}

function clientSummary(record) {
  if (!record || typeof record.id !== 'string' || typeof record.name !== 'string' || record.deleted === true) return null;
  const phoneLast4 = typeof record.phoneLast4 === 'string'
    ? record.phoneLast4.replace(/\D/g, '').slice(-4)
    : String(record.phone ?? '').replace(/\D/g, '').slice(-4);
  return { id: record.id, name: record.name, phoneLast4, createdAt: record.createdAt ?? '', hasPin: typeof record.pinHash === 'string' };
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function verifyClientPin(env, record, pin) {
  if (typeof record?.pinHash !== 'string') {
    throw new HttpError(403, 'Эта карточка создана до защиты PIN-кодом; изменение проектов недоступно.');
  }
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)
    || !constantTimeEqual(record.pinHash, await requestHash(env, `${record.id}:${pin}`))) {
    await allowRequest(env, `client-pin:${record.id}`, 10, 3600);
    throw new HttpError(403, 'Неверный PIN-код клиента.');
  }
}

function normalizeSharedProject(value, clientId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.key !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(value.key)
    || typeof value.projectName !== 'string' || !value.projectName.trim() || value.projectName.length > 100
    || typeof value.color?.id !== 'string' || typeof value.color?.code !== 'string'
    || typeof value.color?.name_ru !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color?.hex ?? '')
    || !Number.isFinite(value.quantity ?? value.liters) || (value.quantity ?? value.liters) < 0
    || (value.quantity ?? value.liters) > 100_000) {
    throw new HttpError(400, 'В проекте обнаружена некорректная запись.');
  }
  const color = {
    id: value.color.id.slice(0, 200),
    code: value.color.code.slice(0, 40),
    name_ru: value.color.name_ru.slice(0, 80),
    catalog: typeof value.color.catalog === 'string' ? value.color.catalog.slice(0, 80) : '',
    hex: value.color.hex.toUpperCase(),
    base: value.color.base === 'A' || value.color.base === 'C' ? value.color.base : null,
    ...(Array.isArray(value.color.rgb) ? { rgb: value.color.rgb.slice(0, 3) } : {}),
    ...(Number.isFinite(value.color.lrv) ? { lrv: value.color.lrv } : {}),
    ...(Array.isArray(value.color.applications) ? { applications: value.color.applications.filter((item) => typeof item === 'string').slice(0, 10) } : {}),
  };
  const paintProduct = value.paintProduct && typeof value.paintProduct === 'object' && !Array.isArray(value.paintProduct)
    ? Object.fromEntries([
      'id', 'brand', 'name', 'finish', 'purpose', 'coverageBySurface', 'coverageDescription',
      'baseSystem', 'baseSystemByTintBase', 'packageSizesLiters', 'packageSizesKg', 'quantityUnit',
      'tintBases', 'paintCategory', 'applications', 'tintable', 'compatibleMaterials',
      'availabilityNote', 'pricePerUnit', 'pricePerLiter', 'source', 'custom',
    ].filter((key) => key in value.paintProduct).map((key) => [key, value.paintProduct[key]]))
    : null;
  return {
    key: value.key,
    clientId,
    projectName: value.projectName.trim() === 'Общий проект' ? 'Проект клиента' : value.projectName.trim(),
    color,
    base: color.base,
    zone: typeof value.zone === 'string' ? value.zone.slice(0, 80) : 'Гостиная',
    area: Number.isFinite(value.area) ? value.area : null,
    layers: Number.isFinite(value.layers) ? value.layers : null,
    surface: typeof value.surface === 'string' ? value.surface.slice(0, 40) : 'wall',
    liters: value.quantity ?? value.liters,
    quantity: value.quantity ?? value.liters,
    quantityUnit: value.quantityUnit === 'kg' ? 'kg' : 'л',
    cans: typeof value.cans === 'string' ? value.cans.slice(0, 300) : '',
    paintProduct,
  };
}

async function handleProjects(request, env, pathSegments) {
  if (request.method === 'GET' && pathSegments.length === 0) {
    await limitByIp(request, env, 'projects-read-ip', 120, 3600);
    await ensurePrivateRepository(env);
    const [records, clientRecords] = await Promise.all([
      listGithubDirectory(env, 'projects'),
      listGithubDirectory(env, 'clients'),
    ]);
    const activeClientIds = new Set(clientRecords
      .filter((record) => clientSummary(record))
      .map((record) => record.id));
    return json({
      projects: records
        .filter((record) => record?.deleted !== true && activeClientIds.has(record?.clientId) && Array.isArray(record.projects))
        .map((record) => ({
          clientId: record.clientId,
          projects: record.projects,
          projectNames: Array.isArray(record.projectNames) ? record.projectNames : [],
        })),
    });
  }
  if (request.method !== 'PUT' || pathSegments.length !== 1) {
    throw new HttpError(405, 'Для проектов доступны просмотр и сохранение.');
  }
  await limitByIp(request, env, 'projects-write-ip', 120, 3600);
  const clientId = safeId(decodeURIComponent(pathSegments[0]));
  if (!clientId.startsWith('client-')) throw new HttpError(400, 'Некорректный идентификатор клиента.');
  const body = await readJson(request, 300_000);
  if (!Array.isArray(body.projects) || body.projects.length > 300
    || !Array.isArray(body.projectNames) || body.projectNames.length > 100) {
    throw new HttpError(400, 'Проверьте список проектов и названий.');
  }
  const clientFile = await readGithubFile(env, `clients/${clientId}.json`);
  if (!clientSummary(clientFile?.value)) throw new HttpError(404, 'Карточка клиента не найдена.');
  await verifyClientPin(env, clientFile.value, body.pin);
  const projects = body.projects.map((project) => normalizeSharedProject(project, clientId));
  if (new Set(projects.map((project) => project.key)).size !== projects.length) {
    throw new HttpError(400, 'В проекте обнаружены повторяющиеся записи.');
  }
  const projectNames = [...new Set(body.projectNames
    .filter((name) => typeof name === 'string' && name.trim())
    .map((name) => (name.trim() === 'Общий проект' ? 'Проект клиента' : name.trim()).slice(0, 100)))];
  const value = { clientId, projects, projectNames, updatedAt: new Date().toISOString() };
  await updateGithubFile(env, `projects/${clientId}.json`, value, withActor(request, `projects: sync ${clientId}`));
  return json({ ok: true, projectCount: projects.length });
}

async function handleClients(request, env, pathSegments) {
  if (request.method === 'GET' && pathSegments.length === 0) {
    await limitByIp(request, env, 'clients-read-ip', 120, 3600);
    await ensurePrivateRepository(env);
    const records = await listGithubDirectory(env, 'clients');
    return json({ clients: records.map(clientSummary).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  }
  if (pathSegments.length === 0 && request.method === 'PUT') {
    await limitByIp(request, env, 'clients-write-ip', 10, 3600);
    const body = await readJson(request, 4_000);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
    const pin = typeof body.pin === 'string' ? body.pin : '';
    if (!name || name.length > 100 || phone.length < 10 || phone.length > 15 || body.consent !== true || !/^\d{6}$/.test(pin)) {
      throw new HttpError(400, 'Укажите имя, телефон и шестизначный PIN-код, подтвердив согласие клиента на хранение данных.');
    }
    await ensurePrivateRepository(env);
    const id = `client-${await requestHash(env, phone)}`;
    const path = `clients/${id}.json`;
    const existing = await readGithubFile(env, path);
    if (existing?.value?.deleted === true) {
      throw new HttpError(409, 'Удалённую карточку нельзя создать повторно с тем же номером.');
    }
    if (existing && !clientSummary(existing.value)) {
      throw new HttpError(409, 'Существующая запись клиента требует ручной проверки.');
    }
    if (clientSummary(existing?.value)) await verifyClientPin(env, existing.value, pin);
    const record = {
      id,
      name,
      phone,
      phoneLast4: phone.slice(-4),
      pinHash: await requestHash(env, `${id}:${pin}`),
      createdAt: existing?.value?.createdAt || new Date().toISOString(),
    };
    if (existing) await updateGithubFile(env, path, record, withActor(request, `clients: update ${id}`));
    else await createGithubFile(env, path, record, withActor(request, `clients: add ${id}`));
    return json({ client: clientSummary(record) }, existing ? 200 : 201);
  }
  if (pathSegments.length === 1 && request.method === 'DELETE') {
    await limitByIp(request, env, 'clients-delete-ip', 20, 3600);
    const id = safeId(decodeURIComponent(pathSegments[0]));
    if (!id.startsWith('client-')) throw new HttpError(400, 'Некорректный идентификатор клиента.');
    const body = await readJson(request, 2_000);
    const existing = await readGithubFile(env, `clients/${id}.json`);
    if (!clientSummary(existing?.value)) throw new HttpError(404, 'Карточка клиента не найдена.');
    await verifyClientPin(env, existing.value, body.pin);
    await updateGithubFile(env, `clients/${id}.json`, { id, deleted: true }, withActor(request, `clients: delete ${id}`));
    await updateGithubFile(env, `projects/${id}.json`, { clientId: id, projects: [], projectNames: [], deleted: true }, withActor(request, `projects: delete ${id}`));
    return json({ ok: true });
  }
  if (pathSegments.length === 2 && pathSegments[1] === 'verify-pin' && request.method === 'POST') {
    await limitByIp(request, env, 'client-pin-verify-ip', 30, 3600);
    const id = safeId(decodeURIComponent(pathSegments[0]));
    if (!id.startsWith('client-')) throw new HttpError(400, 'Некорректный идентификатор клиента.');
    const body = await readJson(request, 2_000);
    const existing = await readGithubFile(env, `clients/${id}.json`);
    if (!clientSummary(existing?.value)) throw new HttpError(404, 'Карточка клиента не найдена.');
    await verifyClientPin(env, existing.value, body.pin);
    return json({ ok: true });
  }
  throw new HttpError(405, 'Для клиентов доступны просмотр, создание и удаление.');
}

async function handleApi(request, env) {
  configured(env);
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [resource, action, ...tail] = segments;
  if (resource === 'catalog') return handleCatalog(request, env, [action, ...tail].filter(Boolean));
  if (resource === 'clients') return handleClients(request, env, [action, ...tail].filter(Boolean));
  if (resource === 'projects') return handleProjects(request, env, [action, ...tail].filter(Boolean));
  if (resource === 'history') return handleHistory(request, env, [action, ...tail].filter(Boolean));
  throw new HttpError(404, 'Маршрут API не найден.');
}

export function createWorkerResponse(request, env) {
  const origin = request.headers.get('Origin') ?? '';
  const allowedOrigins = String(env.ALLOWED_ORIGINS ?? 'https://niks343.github.io,http://localhost:5173')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const corsHeaders = {
    Vary: 'Origin',
    ...(allowedOrigins.includes(origin) ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Kolorlab-Actor',
      'Access-Control-Max-Age': '86400',
    } : {}),
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (origin && !allowedOrigins.includes(origin)) return json({ error: 'Источник запроса не разрешён.' }, 403, corsHeaders);
  return handleApi(request, env)
    .then((response) => {
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
      return new Response(response.body, { status: response.status, headers });
    })
    .catch((error) => {
      if (!(error instanceof HttpError)) console.error('Unhandled KolorLab API error.', error);
      return json({ error: error instanceof HttpError ? error.message : 'Внутренняя ошибка сервера.' }, error instanceof HttpError ? error.status : 500, corsHeaders);
    });
}

export default {
  fetch(request, env) {
    return createWorkerResponse(request, env);
  },
};

export { normalizeColorRecord, normalizePaintRecord };
