import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCustomCatalogDocument,
  mergeCustomCatalog,
  normalizeCustomColor,
  normalizeCustomPaintProduct,
  parseCustomCatalogDocument,
} from './userCatalog.js';

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
});

test('round-trips a portable user catalog and paint pricing', () => {
  const document = createCustomCatalogDocument([customColor], [customPaint], { [customPaint.id]: 123.5 }, '2026-10-04T00:00:00.000Z');
  const imported = parseCustomCatalogDocument(document);

  assert.equal(imported.colors[0].id, customColor.id);
  assert.equal(imported.colors[0].hex, '#334455');
  assert.equal(imported.paintProducts[0].id, customPaint.id);
  assert.deepEqual(imported.paintProducts[0].packageSizesLiters, [0.9, 2.7, 9]);
  assert.equal(imported.paintPricesByProduct[customPaint.id], 123.5);
  assert.equal(imported.invalidCount, 0);
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
