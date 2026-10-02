import test from 'node:test';
import assert from 'node:assert/strict';
import baseColors from './colors.json' with { type: 'json' };
import farrowBallColors from './farrowBall.js';
import { deltaEFromLab, filterColors, getColorFamily, getColorRecommendations, rgbToLab } from './colorTools.js';

const colors = [...baseColors, ...farrowBallColors];

test('converts black and white RGB values to expected Lab lightness', () => {
  assert.ok(Math.abs(rgbToLab([0, 0, 0])[0]) < 0.01);
  assert.ok(Math.abs(rgbToLab([255, 255, 255])[0] - 100) < 0.01);
  assert.equal(deltaEFromLab([0, 0, 0], [0, 0, 0]), 0);
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
