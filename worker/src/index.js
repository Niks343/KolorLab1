const allowedSurfaces = new Set(['wall', 'plaster', 'bath', 'facade']);
const allowedPaintCategories = new Set(['facade', 'interior', 'three-in-one', 'primer', 'impregnation', 'varnish', 'enamel', 'oil']);
const allowedPaintApplications = new Set(['facade', 'interior', 'terrace', 'bath']);
const allowedPaintMaterials = new Set(['metal', 'plastic', 'wood', 'doors', 'windows', 'slopes']);

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
  if (!value || value.id !== id || !id.startsWith('custom-color-')
    || typeof value.code !== 'string' || !value.code.trim() || value.code.length > 40
    || typeof value.name_ru !== 'string' || !value.name_ru.trim() || value.name_ru.length > 80
    || typeof value.hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.hex)) {
    throw new HttpError(400, 'Проверьте код, название и HEX-код цвета.');
  }
  return { id, code: value.code.trim(), name_ru: value.name_ru.trim(), hex: value.hex.toUpperCase() };
}

function normalizePaintRecord(value, id) {
  if (!value || value.id !== id || !id.startsWith('custom-paint-')
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
  if (!Object.keys(coverageBySurface).length
    || (packageSizesLiters !== null && (!Array.isArray(packageSizesLiters) || packageSizesLiters.length > 12
      || packageSizesLiters.some((number) => !Number.isFinite(number) || number <= 0 || number > 100)))) {
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
    brand: value.brand.trim(),
    name: value.name.trim(),
    finish: typeof value.finish === 'string' ? value.finish.trim().slice(0, 80) : '',
    purpose: typeof value.purpose === 'string' ? value.purpose.trim().slice(0, 180) : '',
    coverageBySurface,
    coverageDescription: typeof value.coverageDescription === 'string' ? value.coverageDescription.slice(0, 120) : '',
    baseSystem: typeof value.baseSystem === 'string' ? value.baseSystem.trim().slice(0, 120) : '',
    packageSizesLiters,
    tintBases,
    paintCategory,
    applications,
    tintable,
    compatibleMaterials,
    pricePerLiter: Number.isFinite(value.pricePerLiter) && value.pricePerLiter >= 0 && value.pricePerLiter <= 1_000_000
      ? value.pricePerLiter
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
  let response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: { ...githubHeaders(env), ...init.headers },
    });
  } catch (error) {
    console.error('GitHub API transport failed.', error instanceof Error ? error.name : 'Unknown error');
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

async function listGithubDirectory(env, path) {
  const contents = await githubRequest(env, repositoryPath(env, path), { allowNotFound: true });
  if (!contents) return [];
  if (!Array.isArray(contents)) throw new HttpError(502, 'Не удалось прочитать каталог общей базы GitHub.');
  return Promise.all(contents
    .filter((entry) => entry.type === 'file' && entry.name.endsWith('.json'))
    .map(async (entry) => decodeGithubFile(await githubRequest(env, repositoryPath(env, entry.path)))));
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
    await ensurePrivateRepository(env);
    const [colors, paintProducts] = await Promise.all([
      listGithubDirectory(env, 'catalog/colors'),
      listGithubDirectory(env, 'catalog/paints'),
    ]);
    return json({ colors, paintProducts });
  }

  const [kind, rawId] = pathSegments;
  const directories = { colors: 'colors', paints: 'paints' };
  const directory = directories[kind];
  if (!directory || pathSegments.length !== 2) throw new HttpError(404, 'Маршрут каталога не найден.');
  const id = safeId(decodeURIComponent(rawId));
  if (request.method !== 'POST') {
    throw new HttpError(405, 'Сейчас разрешено только добавление новых записей. Изменение и удаление отключены.');
  }

  await limitByIp(request, env, 'catalog-create-ip', 10, 3600);
  const body = await readJson(request);
  const value = kind === 'colors' ? normalizeColorRecord(body, id) : normalizePaintRecord(body, id);
  await createGithubFile(env, `catalog/${directory}/${id}.json`, value, `catalog: add ${kind} ${id}`);
  return json({ ok: true, record: value }, 201);
}

async function handleApi(request, env) {
  configured(env);
  const url = new URL(request.url);
  const segments = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [resource, action, ...tail] = segments;
  if (resource === 'catalog') return handleCatalog(request, env, [action, ...tail].filter(Boolean));
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
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
