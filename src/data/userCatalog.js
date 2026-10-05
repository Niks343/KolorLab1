import { estimateLrvFromHex, getTintingBase } from './colorBase.js';

export const userCatalogFormat = 'kolorlab-user-catalog';
export const userCatalogVersion = 1;

const supportedSurfaces = new Set(['wall', 'plaster', 'bath', 'facade']);

export function normalizeCustomColor(entry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id.startsWith('custom-color-') || entry.id.length > 200
    || typeof entry.code !== 'string' || !entry.code.trim() || entry.code.length > 40
    || typeof entry.name_ru !== 'string' || !entry.name_ru.trim() || entry.name_ru.length > 80
    || typeof entry.hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(entry.hex)) return null;
  const hex = entry.hex.toUpperCase();
  const rgb = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const lrv = estimateLrvFromHex(hex);
  return {
    id: entry.id,
    code: entry.code.trim(),
    name_ru: entry.name_ru.trim(),
    catalog: 'Мои цвета',
    hex,
    rgb,
    lrv,
    base: getTintingBase(hex, lrv),
    applications: ['интерьер', 'фасад'],
  };
}

export function normalizeCustomPaintProduct(entry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id.startsWith('custom-paint-') || entry.id.length > 200
    || typeof entry.brand !== 'string' || !entry.brand.trim() || entry.brand.length > 60
    || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 80
    || !entry.coverageBySurface || typeof entry.coverageBySurface !== 'object' || Array.isArray(entry.coverageBySurface)) return null;
  const surfaces = Object.keys(entry.coverageBySurface).filter((surfaceId) => supportedSurfaces.has(surfaceId));
  const coverageBySurface = Object.fromEntries(surfaces.flatMap((surfaceId) => {
    const value = entry.coverageBySurface[surfaceId];
    return Array.isArray(value) && Number.isFinite(value[0]) && value[0] >= 0.1 && value[0] <= 100
      ? [[surfaceId, [value[0], value[0]]]]
      : [];
  }));
  if (!Object.keys(coverageBySurface).length) return null;
  if (entry.packageSizesLiters !== null && entry.packageSizesLiters !== undefined
    && (!Array.isArray(entry.packageSizesLiters)
      || entry.packageSizesLiters.length > 12
      || entry.packageSizesLiters.some((size) => !Number.isFinite(size) || size <= 0 || size > 100))) return null;
  const packageSizesLiters = Array.isArray(entry.packageSizesLiters)
    ? [...new Set(entry.packageSizesLiters)].sort((a, b) => a - b)
    : null;
  return {
    id: entry.id,
    brand: entry.brand.trim(),
    name: entry.name.trim(),
    finish: typeof entry.finish === 'string' && entry.finish.trim() ? entry.finish.trim().slice(0, 80) : 'Не указано',
    purpose: typeof entry.purpose === 'string' ? entry.purpose.trim().slice(0, 180) : '',
    coverageBySurface,
    coverageDescription: typeof entry.coverageDescription === 'string' ? entry.coverageDescription.slice(0, 120) : 'Расход задан пользователем.',
    surfaces: Object.keys(coverageBySurface),
    baseSystem: typeof entry.baseSystem === 'string' && entry.baseSystem.trim() ? entry.baseSystem.trim().slice(0, 120) : 'Совместимость баз не указана.',
    packageSizesLiters: packageSizesLiters?.length ? packageSizesLiters : null,
    tintBases: Array.isArray(entry.tintBases) ? [...new Set(entry.tintBases.filter((base) => base === 'A' || base === 'C'))] : [],
    source: '',
    custom: true,
  };
}

export function createCustomCatalogDocument(customColors, customPaintProducts, paintPricesByProduct = {}, exportedAt = new Date().toISOString()) {
  return {
    format: userCatalogFormat,
    version: userCatalogVersion,
    exportedAt,
    colors: customColors.map(({ id, code, name_ru, hex }) => ({ id, code, name_ru, hex })),
    paintProducts: customPaintProducts.map((product) => ({
      id: product.id,
      brand: product.brand,
      name: product.name,
      finish: product.finish,
      purpose: product.purpose,
      coverageBySurface: product.coverageBySurface,
      coverageDescription: product.coverageDescription,
      baseSystem: product.baseSystem,
      packageSizesLiters: product.packageSizesLiters,
      tintBases: product.tintBases,
      pricePerLiter: Number.isFinite(paintPricesByProduct[product.id]) ? paintPricesByProduct[product.id] : null,
    })),
  };
}

export function parseCustomCatalogDocument(document) {
  if (!document || typeof document !== 'object' || document.format !== userCatalogFormat || document.version !== userCatalogVersion) {
    throw new Error('Формат файла не поддерживается. Экспортируйте базу из KolorLab и попробуйте ещё раз.');
  }
  if (!Array.isArray(document.colors) || !Array.isArray(document.paintProducts)) {
    throw new Error('В файле должны быть списки цветов и красок.');
  }
  if (document.colors.length > 500 || document.paintProducts.length > 500) {
    throw new Error('В файле слишком много записей для импорта (максимум 500 цветов и 500 красок).');
  }
  const normalizeEntries = (entries, normalize) => {
    const valid = [];
    const ids = new Set();
    for (const entry of entries) {
      const normalized = normalize(entry);
      if (!normalized || ids.has(normalized.id)) continue;
      ids.add(normalized.id);
      valid.push(normalized);
    }
    return { valid, invalid: entries.length - valid.length };
  };
  const colors = normalizeEntries(document.colors, normalizeCustomColor);
  const paintProducts = normalizeEntries(document.paintProducts, normalizeCustomPaintProduct);
  if ((document.colors.length || document.paintProducts.length) && !colors.valid.length && !paintProducts.valid.length) {
    throw new Error('В файле нет корректных записей цветов или красок.');
  }
  return {
    colors: colors.valid,
    paintProducts: paintProducts.valid,
    paintPricesByProduct: Object.fromEntries(document.paintProducts.flatMap((entry) => (
      entry && typeof entry.id === 'string'
        && Number.isFinite(entry.pricePerLiter)
        && entry.pricePerLiter >= 0
        && paintProducts.valid.some((product) => product.id === entry.id)
        ? [[entry.id, entry.pricePerLiter]]
        : []
    ))),
    invalidCount: colors.invalid + paintProducts.invalid,
  };
}

export function mergeCustomCatalog(existing, incoming) {
  const merged = new Map(existing.map((entry) => [entry.id, entry]));
  let added = 0;
  let updated = 0;
  for (const entry of incoming) {
    const previous = merged.get(entry.id);
    if (!previous) added += 1;
    else if (JSON.stringify(previous) !== JSON.stringify(entry)) updated += 1;
    merged.set(entry.id, entry);
  }
  return { entries: [...merged.values()], added, updated };
}
