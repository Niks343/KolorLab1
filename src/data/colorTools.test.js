import test from 'node:test';
import assert from 'node:assert/strict';
import baseColors from './colors.json' with { type: 'json' };
import farrowBallColors from './farrowBall.js';
import { estimateLrvFromHex } from './colorBase.js';
import { deltaEFromLab, filterColors, getColorFamily, getColorRecommendations, rgbToLab } from './colorTools.js';

const colors = [...baseColors, ...farrowBallColors];

test('converts black and white RGB values to expected Lab lightness', () => {
  assert.ok(Math.abs(rgbToLab([0, 0, 0])[0]) < 0.01);
  assert.ok(Math.abs(rgbToLab([255, 255, 255])[0] - 100) < 0.01);
  assert.equal(deltaEFromLab([0, 0, 0], [0, 0, 0]), 0);
});

test('keeps catalog IDs unique and estimates missing LRV from HEX', () => {
  assert.equal(new Set(baseColors.map(({ id }) => id)).size, baseColors.length);
  assert.equal(estimateLrvFromHex('#000000'), 0);
  assert.equal(estimateLrvFromHex('#FFFFFF'), 100);

  for (const color of baseColors) {
    assert.ok(color.id && color.code && color.name_ru && color.catalog, `${color.id} is missing a catalog field`);
    assert.match(color.hex, /^#[0-9A-F]{6}$/i);
    assert.ok(Array.isArray(color.rgb) && color.rgb.length === 3, `${color.code} has invalid RGB data`);
    assert.equal(
      color.rgb.join(','),
      [1, 3, 5].map((index) => Number.parseInt(color.hex.slice(index, index + 2), 16)).join(','),
      `${color.code} HEX and RGB values must match`,
    );
    assert.ok(['A', 'C'].includes(color.base), `${color.code} has an invalid tinting base`);
    const lrv = Number.isFinite(color.lrv) ? color.lrv : estimateLrvFromHex(color.hex);
    assert.ok(lrv >= 0 && lrv <= 100, `${color.code} has an invalid LRV`);
  }
});

test('classifies color families and combines family and lightness filters', () => {
  assert.equal(getColorFamily([204, 6, 5]), 'Красные');
  assert.equal(getColorFamily([244, 244, 244]), 'Нейтральные');
  const filtered = filterColors(colors, {
    catalog: 'RAL Classic',
    base: 'Все базы',
    application: 'all',
    family: 'Красные',
    lightness: 'Тёмные',
    query: '',
  });
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every((color) => color.catalog === 'RAL Classic' && color.lrv < 30 && getColorFamily(color.rgb) === 'Красные'));
});

test('provides distinct harmony suggestions outside the selected collection', () => {
  const anchor = colors.find((color) => color.id === 'ral-3020');
  const recommendations = getColorRecommendations(colors, anchor, [anchor.id, 'ral-9003']);
  assert.equal(recommendations.length, 3);
  assert.equal(new Set(recommendations.map(({ color }) => color.id)).size, 3);
  assert.ok(recommendations.every(({ color }) => color.id !== anchor.id && color.id !== 'ral-9003'));
});
