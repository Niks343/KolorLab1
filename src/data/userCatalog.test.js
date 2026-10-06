import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCustomCatalogDocument,
  mergeCustomCatalog,
  normalizeCustomColor,
  normalizeCustomPaintProduct,
  parseCustomCatalogDocument,
} from './userCatalog.js';
import { getPaintProductMetadata, paintCategories, paintFinishes } from './paintCatalog.js';

const customColor = normalizeCustomColor({
  id: 'custom-color-test-1',
  code: 'MY-01',
  name_ru: 'Графит',
  hex: '#334455',
});
const customPaint = normalizeCustomPaintProduct({
  id: 'custom-paint-test-1',
  brand: 'Мастерская',
  name: 'Матовая',
  coverageBySurface: { wall: [8, 8] },
  packageSizesLiters: [0.9, 2.7, 9],
  paintCategory: 'interior',
  applications: ['interior', 'bath'],
  tintable: true,
  tintBases: ['A', 'C'],
  compatibleMaterials: ['doors', 'windows'],
});

test('round-trips a portable user catalog and paint pricing', () => {
  const document = createCustomCatalogDocument([customColor], [customPaint], { [customPaint.id]: 123.5 }, '2026-10-04T00:00:00.000Z');
  const imported = parseCustomCatalogDocument(document);

  assert.equal(imported.colors[0].id, customColor.id);
  assert.equal(imported.colors[0].hex, '#334455');
  assert.equal(imported.paintProducts[0].id, customPaint.id);
  assert.deepEqual(imported.paintProducts[0].packageSizesLiters, [0.9, 2.7, 9]);
  assert.equal(imported.paintProducts[0].paintCategory, 'interior');
  assert.deepEqual(imported.paintProducts[0].applications, ['interior', 'bath']);
  assert.equal(imported.paintProducts[0].tintable, true);
  assert.deepEqual(imported.paintProducts[0].tintBases, ['A', 'C']);
  assert.deepEqual(imported.paintProducts[0].compatibleMaterials, ['doors', 'windows']);
  assert.equal(imported.paintPricesByProduct[customPaint.id], 123.5);
  assert.equal(imported.invalidCount, 0);
});

test('normalizes built-in catalog entries as editable overlays without losing their identity', () => {
  const overriddenColor = normalizeCustomColor({
    id: 'ral-9003',
    code: 'RAL 9003',
    name_ru: 'Изменённый белый',
    hex: '#EEEEEE',
    catalog: 'RAL Classic',
  });
  const overriddenPaint = normalizeCustomPaintProduct({
    ...customPaint,
    id: 'tikkurila-harmony',
    brand: 'Tikkurila',
  });

  assert.equal(overriddenColor.id, 'ral-9003');
  assert.equal(overriddenColor.catalog, 'RAL Classic');
  assert.equal(overriddenPaint.id, 'tikkurila-harmony');
});

test('preserves plaster weight, package sizes, pricing, and metal application through portable export', () => {
  const plaster = normalizeCustomPaintProduct({
    id: 'custom-paint-plaster',
    brand: 'Мастерская',
    name: 'Декоративная штукатурка',
    coverageBySurface: { plaster: [2.5, 2.5] },
    packageSizesKg: [5, 15, 25],
    quantityUnit: 'kg',
    paintCategory: 'plaster',
    applications: ['interior', 'metal'],
  });

  const document = createCustomCatalogDocument([], [plaster], { [plaster.id]: 85 });
  const imported = parseCustomCatalogDocument(document);
  assert.equal(imported.paintProducts[0].quantityUnit, 'kg');
  assert.deepEqual(imported.paintProducts[0].packageSizesKg, [5, 15, 25]);
  assert.deepEqual(imported.paintProducts[0].applications, ['interior', 'metal']);
  assert.equal(imported.paintPricesByProduct[plaster.id], 85);
});

test('retains mineral surfaces, wallpaper, radiators, and sheen in portable paint entries', () => {
  const mineralPaint = normalizeCustomPaintProduct({
    id: 'custom-paint-mineral',
    brand: 'KolorLab',
    name: 'Краска для минеральных оснований',
    coverageBySurface: { plaster: [8, 8] },
    compatibleMaterials: ['mineral', 'wallpaper', 'radiator'],
    finish: 'Полуглянцевая',
  });
  assert.deepEqual(mineralPaint.compatibleMaterials, ['mineral', 'wallpaper', 'radiator']);
  const portable = parseCustomCatalogDocument(createCustomCatalogDocument([], [mineralPaint]));
  assert.equal(portable.paintProducts[0].finish, 'Полуглянцевая');
  assert.deepEqual(portable.paintProducts[0].compatibleMaterials, ['mineral', 'wallpaper', 'radiator']);
});

test('lists supported paint sheen choices', () => {
  assert.deepEqual(paintFinishes, [
    'Глянцевая', 'Матовая', 'Полуматовая', 'Полуглянцевая', 'Шелковисто-матовая', 'Глубокоматовая',
  ]);
});

test('provides all paint types and respects explicit product compatibility settings', () => {
  assert.deepEqual(paintCategories.map(({ id }) => id), [
    'facade', 'interior', 'plaster', 'three-in-one', 'primer', 'impregnation', 'varnish', 'enamel', 'oil',
  ]);
  assert.deepEqual(getPaintProductMetadata({
    paintCategory: 'varnish',
    applications: ['terrace'],
    tintable: false,
    tintBases: ['A'],
    compatibleMaterials: ['wood', 'metal'],
  }), {
    category: 'varnish',
    applications: ['terrace'],
    tintable: false,
    tintBases: [],
    compatibleMaterials: ['wood', 'metal'],
  });
  assert.deepEqual(getPaintProductMetadata({
    name: 'Силиконовая краска',
    purpose: 'Для фасадов и минеральных оснований.',
    surfaces: ['plaster', 'facade'],
  }).applications, ['facade']);
});

test('merges imported entries by stable IDs without creating duplicates', () => {
  const changedColor = { ...customColor, name_ru: 'Обновлённый графит' };
  const addedColor = { ...customColor, id: 'custom-color-test-2', code: 'MY-02' };
  const result = mergeCustomCatalog([customColor], [changedColor, addedColor]);

  assert.equal(result.entries.length, 2);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.entries[0].name_ru, 'Обновлённый графит');
});

test('rejects unsupported and malformed catalog files', () => {
  assert.throws(() => parseCustomCatalogDocument({ format: 'other', version: 1, colors: [], paintProducts: [] }));
  assert.throws(() => parseCustomCatalogDocument({ format: 'kolorlab-user-catalog', version: 1, colors: [{}], paintProducts: [{}] }));
  const partial = parseCustomCatalogDocument({
    format: 'kolorlab-user-catalog',
    version: 1,
    colors: [customColor, {}],
    paintProducts: [customPaint],
  });
  assert.equal(partial.invalidCount, 1);
  assert.equal(partial.colors.length, 1);
});
