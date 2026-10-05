const allowedSurfaces = new Set(['wall', 'plaster', 'bath', 'facade']);
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;
const encryptedClientFormat = 'kolorlab-client-v1';

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

function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const normalized = digits.length === 10
    ? `7${digits}`
    : digits.length === 11 && digits.startsWith('8')
      ? `7${digits.slice(1)}`
      : digits;
  if (!/^[1-9]\d{10,14}$/.test(normalized)) throw new HttpError(400, 'Введите корректный номер телефона в международном формате.');
  return `+${normalized}`;
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
    tintBases: Array.isArray(value.tintBases) ? [...new Set(value.tintBases.filter((base) => base === 'A' || base === 'C'))] : [],
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

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function phoneHash(env, phone) {
  return base64UrlEncode(await hmac(env.SESSION_SECRET, phone));
}

function decodeHex(value) {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2}){32}$/i.test(value)) {
    throw new HttpError(503, 'Сервер не настроен: ключ шифрования клиента некорректен.');
  }
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

async function encryptClientRecord(env, record) {
  const key = await crypto.subtle.importKey('raw', decodeHex(env.DATA_ENCRYPTION_KEY), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(record));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return {
    format: encryptedClientFormat,
    id: record.id,
    iv: base64UrlEncode(iv),
    data: base64UrlEncode(encrypted),
  };
}

async function decryptClientRecord(env, envelope) {
  if (!envelope || envelope.format !== encryptedClientFormat || typeof envelope.id !== 'string'
    || typeof envelope.iv !== 'string' || typeof envelope.data !== 'string') {
    throw new HttpError(502, 'Не удалось расшифровать запись клиента из приватной базы.');
  }
  try {
    const key = await crypto.subtle.importKey('raw', decodeHex(env.DATA_ENCRYPTION_KEY), 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: base64UrlDecode(envelope.iv),
    }, key, base64UrlDecode(envelope.data));
    const record = JSON.parse(new TextDecoder().decode(plaintext));
    if (record.id !== envelope.id || typeof record.phone !== 'string' || typeof record.name !== 'string') {
      throw new Error('Invalid client record');
    }
    return record;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('Unable to decrypt a client record.', error instanceof Error ? error.name : 'Unknown error');
    throw new HttpError(502, 'Не удалось расшифровать запись клиента из приватной базы.');
  }
}

async function createSession(env, user) {
  const isPasswordAdmin = user.authType === 'admin';
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    id: typeof user.phone === 'string' ? await phoneHash(env, user.phone) : user.id,
    name: user.name,
    phoneLast4: user.phoneLast4 ?? user.phone?.slice(-4) ?? '',
    ...(isPasswordAdmin ? {
      authType: 'admin',
      adminCredentialVersion: await adminCredentialVersion(env),
    } : {}),
    exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
  })));
  const signature = base64UrlEncode(await hmac(env.SESSION_SECRET, payload));
  return `${payload}.${signature}`;
}

async function readSession(request, env) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !env.SESSION_SECRET) throw new HttpError(401, 'Войдите по номеру телефона.');
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) throw new HttpError(401, 'Сеанс завершён. Войдите снова.');
  const expected = base64UrlEncode(await hmac(env.SESSION_SECRET, payload));
  if (!safeEqual(signature, expected)) throw new HttpError(401, 'Сеанс завершён. Войдите снова.');
  let user;
  try {
    user = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch {
    throw new HttpError(401, 'Сеанс завершён. Войдите снова.');
  }
  if (!Number.isFinite(user.exp) || user.exp <= Math.floor(Date.now() / 1000)
    || typeof user.id !== 'string' || typeof user.name !== 'string'
    || (user.phoneLast4 !== '' && !/^\d{4}$/.test(user.phoneLast4))) {
    throw new HttpError(401, 'Сеанс завершён. Войдите снова.');
  }
  const passwordAdmin = user.authType === 'admin';
  if (passwordAdmin && (typeof user.adminCredentialVersion !== 'string'
    || !safeEqual(user.adminCredentialVersion, await adminCredentialVersion(env)))) {
    throw new HttpError(401, 'Пароль администратора изменён. Войдите снова.');
  }
  const phoneAdmin = await isAdministratorHash(env, user.id);
  return { ...user, isAdmin: passwordAdmin || phoneAdmin };
}

async function adminCredentialVersion(env) {
  const login = typeof env.ADMIN_LOGIN === 'string' ? env.ADMIN_LOGIN.trim().toLowerCase() : '';
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) {
    throw new HttpError(503, 'Логин администратора не настроен в Cloudflare Worker.');
  }
  if (typeof env.ADMIN_PASSWORD !== 'string' || env.ADMIN_PASSWORD.length < 12 || env.ADMIN_PASSWORD.length > 200) {
    throw new HttpError(503, 'Пароль администратора не настроен: задайте не менее 12 символов.');
  }
  return base64UrlEncode(await hmac(env.SESSION_SECRET, `admin-session\0${login}\0${env.ADMIN_PASSWORD}`));
}

async function loginAdmin(request, env) {
  const body = await readJson(request, 2_000);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await phoneHash(env, ip);
  await allowRequest(env, `admin-login-ip:${ipHash}`, 10, 900);
  const login = typeof body.login === 'string' ? body.login.trim().toLowerCase().slice(0, 80) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length > 200) throw new HttpError(401, 'Неверный логин или пароль.');

  const expected = await adminCredentialVersion(env);
  const candidate = base64UrlEncode(await hmac(env.SESSION_SECRET, `admin-session\0${login}\0${password}`));
  if (!safeEqual(candidate, expected)) throw new HttpError(401, 'Неверный логин или пароль.');

  const user = { id: 'admin', name: 'Администратор', phoneLast4: '', authType: 'admin' };
  return json({
    token: await createSession(env, user),
    user: { ...user, isAdmin: true },
  });
}

function isAdministrator(env, phone) {
  return String(env.ADMIN_PHONES ?? '')
    .split(',')
    .map((value) => {
      try { return normalizePhone(value.trim()); } catch { return ''; }
    })
    .includes(phone);
}

async function isAdministratorHash(env, id) {
  if (!env.ADMIN_PHONES) return false;
  const allowedIds = await Promise.all(String(env.ADMIN_PHONES).split(',').map((value) => {
    try { return phoneHash(env, normalizePhone(value.trim())); } catch { return ''; }
  }));
  return allowedIds.some((allowedId) => allowedId && safeEqual(allowedId, id));
}

function publicClient(record) {
  return {
    id: record.id,
    name: record.name,
    phoneLast4: record.phone.slice(-4),
    registeredAt: record.registeredAt,
    lastLoginAt: record.lastLoginAt,
    updatedAt: record.updatedAt,
  };
}

async function requireAdmin(request, env) {
  const user = await readSession(request, env);
  if (!user.isAdmin) throw new HttpError(403, 'Управление каталогом доступно только администратору.');
  return user;
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
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function githubRequest(env, path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { ...githubHeaders(env), ...init.headers },
  });
  const result = await response.json().catch(() => null);
  if (response.status === 404 && init.allowNotFound) return null;
  if (response.status === 422 && init.createOnly) {
    throw new HttpError(409, 'Запись с таким идентификатором уже существует.');
  }
  if (!response.ok) {
    console.error('GitHub API request failed.', response.status, result?.message);
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
    throw new HttpError(503, 'Репозиторий с данными клиентов должен быть приватным.');
  }
}

function decodeGithubFile(file) {
  const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function readGithubFile(env, path) {
  const file = await githubRequest(env, repositoryPath(env, path), { allowNotFound: true });
  return file ? { sha: file.sha, value: decodeGithubFile(file) } : null;
}

async function writeGithubFile(env, path, value, message) {
  await ensurePrivateRepository(env);
  const existing = await readGithubFile(env, path);
  const content = base64UrlEncode(new TextEncoder().encode(JSON.stringify(value, null, 2)))
    .replace(/-/g, '+').replace(/_/g, '/');
  return githubRequest(env, repositoryPath(env, path), {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: content.padEnd(Math.ceil(content.length / 4) * 4, '='),
      branch: env.GITHUB_BRANCH || 'main',
      ...(existing ? { sha: existing.sha } : {}),
    }),
  });
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

async function deleteGithubFile(env, path, message) {
  await ensurePrivateRepository(env);
  const existing = await readGithubFile(env, path);
  if (!existing) throw new HttpError(404, 'Запись уже удалена или не найдена.');
  return githubRequest(env, repositoryPath(env, path), {
    method: 'DELETE',
    body: JSON.stringify({ message, sha: existing.sha, branch: env.GITHUB_BRANCH || 'main' }),
  });
}

async function listGithubDirectory(env, path) {
  const contents = await githubRequest(env, repositoryPath(env, path), { allowNotFound: true });
  if (!contents) return [];
  if (!Array.isArray(contents)) throw new HttpError(502, 'Не удалось прочитать защищённую базу GitHub.');
  return Promise.all(contents.filter((entry) => entry.type === 'file' && entry.name.endsWith('.json')).map(async (entry) => {
    const file = await githubRequest(env, repositoryPath(env, entry.path));
    return decodeGithubFile(file);
  }));
}

async function allowRequest(env, key, limit, ttlSeconds) {
  const count = Number(await env.AUTH_KV.get(key) ?? 0);
  if (count >= limit) throw new HttpError(429, 'Слишком много попыток. Повторите позже.');
  await env.AUTH_KV.put(key, String(count + 1), { expirationTtl: ttlSeconds });
}

async function sendSmsCode(env, phone, code) {
  if (!env.SMS_RU_API_ID) throw new HttpError(503, 'SMS-провайдер ещё не настроен.');
  const params = new URLSearchParams({
    api_id: env.SMS_RU_API_ID,
    to: phone.slice(1),
    msg: `Код входа в KolorLab: ${code}. Никому его не сообщайте.`,
    json: '1',
  });
  let response;
  try {
    response = await fetch('https://sms.ru/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: params,
    });
  } catch (error) {
    console.error('SMS.RU transport failed.', error instanceof Error ? error.name : 'Unknown error');
    throw new HttpError(502, 'Не удалось связаться с SMS-провайдером. Попробуйте позже.');
  }
  const result = await response.json().catch(() => null);
  const delivery = result?.sms?.[phone.slice(1)];
  if (!response.ok || result?.status !== 'OK' || delivery?.status !== 'OK') {
    console.error('SMS.RU delivery failed.', result?.status, delivery?.status);
    throw new HttpError(502, 'Не удалось отправить SMS-код. Проверьте номер или попробуйте позже.');
  }
}

async function requestCode(request, env) {
  const body = await readJson(request);
  if (body.consent !== true) throw new HttpError(400, 'Подтвердите согласие на обработку номера телефона.');
  const phone = normalizePhone(body.phone);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  const addressHash = await phoneHash(env, phone);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipHash = await phoneHash(env, ip);
  await allowRequest(env, `sms-phone:${addressHash}`, 3, 3600);
  await allowRequest(env, `sms-ip:${ipHash}`, 10, 3600);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
  await sendSmsCode(env, phone, code);
  await env.AUTH_KV.put(`otp:${addressHash}`, JSON.stringify({
    digest: base64UrlEncode(await hmac(env.SESSION_SECRET, `${phone}:${code}`)),
    name,
    consentedAt: new Date().toISOString(),
    attempts: 0,
  }), { expirationTtl: 300 });
  return json({ ok: true, message: 'Код отправлен. Он действует 5 минут.' });
}

async function verifyCode(request, env) {
  const body = await readJson(request);
  const phone = normalizePhone(body.phone);
  if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw new HttpError(400, 'Введите шестизначный код из SMS.');
  const hash = await phoneHash(env, phone);
  const key = `otp:${hash}`;
  const stored = await env.AUTH_KV.get(key, 'json');
  if (!stored) throw new HttpError(400, 'Код истёк. Запросите новый SMS-код.');
  const digest = base64UrlEncode(await hmac(env.SESSION_SECRET, `${phone}:${body.code}`));
  if (!safeEqual(digest, stored.digest)) {
    const attempts = stored.attempts + 1;
    if (attempts >= 5) await env.AUTH_KV.delete(key);
    else await env.AUTH_KV.put(key, JSON.stringify({ ...stored, attempts }), { expirationTtl: 300 });
    throw new HttpError(400, attempts >= 5 ? 'Слишком много неверных попыток. Запросите новый код.' : 'Неверный SMS-код.');
  }
  await env.AUTH_KV.delete(key);
  await ensurePrivateRepository(env);
  const path = `clients/${hash}.json`;
  const previousEnvelope = await readGithubFile(env, path);
  const previous = previousEnvelope ? await decryptClientRecord(env, previousEnvelope.value) : null;
  const name = stored.name || previous?.name || 'Клиент';
  const record = {
    id: hash,
    phone,
    name,
    registeredAt: previous?.registeredAt ?? new Date().toISOString(),
    consentedAt: previous?.consentedAt ?? stored.consentedAt,
    lastLoginAt: new Date().toISOString(),
  };
  await writeGithubFile(env, path, await encryptClientRecord(env, record), `auth: register client ${hash.slice(0, 8)}`);
  const user = { id: hash, name, phoneLast4: phone.slice(-4) };
  return json({ token: await createSession(env, { ...user, phone }), user: { ...user, authType: 'phone', isAdmin: isAdministrator(env, phone) } });
}

async function handleCatalog(request, env, pathSegments) {
  if (request.method === 'GET' && pathSegments.length === 0) {
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
  const githubPath = `catalog/${directory}/${id}.json`;
  if (request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const ipHash = await phoneHash(env, ip);
    await allowRequest(env, `catalog-create-ip:${ipHash}`, 10, 3600);
    const body = await readJson(request);
    const value = kind === 'colors' ? normalizeColorRecord(body, id) : normalizePaintRecord(body, id);
    await createGithubFile(env, githubPath, value, `catalog: add ${kind} ${id}`);
    return json({ ok: true, record: value }, 201);
  }
  throw new HttpError(405, 'Сейчас разрешено только добавление новых записей. Изменение и удаление отключены.');
}

async function handleClient(request, env, pathSegments) {
  const user = await readSession(request, env);
  if (pathSegments.length === 0 && request.method === 'GET') {
    await ensurePrivateRepository(env);
    if (user.isAdmin) {
      const clients = await listGithubDirectory(env, 'clients');
      const decrypted = await Promise.all(clients.map((client) => decryptClientRecord(env, client)));
      return json({ clients: decrypted.map(publicClient) });
    }
    const client = await readGithubFile(env, `clients/${user.id}.json`);
    return json({ clients: client ? [publicClient(await decryptClientRecord(env, client.value))] : [] });
  }
  if (pathSegments.length === 0 && request.method === 'PUT') {
    const body = await readJson(request);
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80) throw new HttpError(400, 'Укажите имя клиента (не более 80 символов).');
    if (user.isAdmin && body.consent !== true) throw new HttpError(400, 'Подтвердите согласие клиента на хранение номера.');
    const phone = user.isAdmin ? normalizePhone(body.phone) : '';
    const id = user.isAdmin ? await phoneHash(env, phone) : user.id;
    const existingEnvelope = await readGithubFile(env, `clients/${id}.json`);
    const existing = existingEnvelope ? await decryptClientRecord(env, existingEnvelope.value) : null;
    if (!user.isAdmin && !existing) throw new HttpError(404, 'Карточка клиента не найдена. Зарегистрируйтесь по телефону ещё раз.');
    const savedPhone = user.isAdmin ? phone : existing.phone;
    const record = {
      id,
      phone: savedPhone,
      name: body.name.trim(),
      registeredAt: existing?.registeredAt ?? new Date().toISOString(),
      consentedAt: existing?.consentedAt ?? (body.consent === true ? new Date().toISOString() : null),
      lastLoginAt: existing?.lastLoginAt ?? null,
      updatedAt: new Date().toISOString(),
    };
    await writeGithubFile(env, `clients/${id}.json`, await encryptClientRecord(env, record), `clients: save ${id.slice(0, 8)}`);
    return json({ client: publicClient(record) });
  }
  if (pathSegments.length === 1 && request.method === 'DELETE') {
    if (!user.isAdmin) throw new HttpError(403, 'Удалять карточки клиентов может только администратор.');
    const id = safeId(decodeURIComponent(pathSegments[0]));
    await deleteGithubFile(env, `clients/${id}.json`, `clients: delete ${id.slice(0, 8)}`);
    return json({ ok: true });
  }
  throw new HttpError(404, 'Маршрут клиентов не найден.');
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
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
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

export { createSession, normalizePhone, normalizeColorRecord, normalizePaintRecord, isAdministrator };
