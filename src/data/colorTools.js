export function rgbToLab([r, g, b]) {
  const linear = [r, g, b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047;
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const z = (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883;
  const f = (value) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = f(x); const fy = f(y); const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaEFromLab(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function getClosestColorMatches(colors, rgb, limit = 3) {
  const sampleLab = rgbToLab(rgb);
  return colors
    .map((color) => ({ color, distance: deltaEFromLab(sampleLab, rgbToLab(color.rgb)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function getHsl([r, g, b]) {
  const channels = [r, g, b].map((value) => value / 255);
  const maximum = Math.max(...channels);
  const minimum = Math.min(...channels);
  const difference = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  if (!difference) return { hue: 0, saturation: 0, lightness };
  const saturation = difference / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (maximum === channels[0]) hue = ((channels[1] - channels[2]) / difference) % 6;
  else if (maximum === channels[1]) hue = (channels[2] - channels[0]) / difference + 2;
  else hue = (channels[0] - channels[1]) / difference + 4;
  return { hue: (hue * 60 + 360) % 360, saturation, lightness };
}

export function getColorFamily(rgb) {
  const { hue, saturation } = getHsl(rgb);
  if (saturation < 0.12) return 'Нейтральные';
  if (hue < 15 || hue >= 345) return 'Красные';
  if (hue < 45) return 'Оранжевые';
  if (hue < 70) return 'Жёлтые';
  if (hue < 165) return 'Зелёные';
  if (hue < 195) return 'Бирюзовые';
  if (hue < 225) return 'Голубые';
  if (hue < 260) return 'Синие';
  if (hue < 290) return 'Фиолетовые';
  return 'Пурпурные';
}

export function filterColors(colors, filters) {
  const query = filters.query.trim().toLocaleLowerCase('ru');
  return colors.filter((color) => {
    const searchable = `${color.code} ${color.name_ru} ${color.name_en ?? ''} ${color.catalog} ${(color.applications ?? []).join(' ')}`.toLocaleLowerCase('ru');
    return (filters.catalog === null || color.catalog === filters.catalog)
      && (filters.base === 'Все базы' || color.base === filters.base)
      && (filters.application === 'all' || (color.applications ?? []).includes(filters.application))
      && (filters.family === 'Все семейства' || getColorFamily(color.rgb) === filters.family)
      && (filters.lightness === 'Любая светлота'
        || (filters.lightness === 'Светлые' && color.lrv >= 65)
        || (filters.lightness === 'Средние' && color.lrv >= 30 && color.lrv < 65)
        || (filters.lightness === 'Тёмные' && color.lrv < 30))
      && (!query || searchable.includes(query));
  });
}

export function getColorRecommendations(colors, anchor, excludedIds = []) {
  if (!anchor) return [];
  const source = getHsl(anchor.rgb);
  const excluded = new Set([...excludedIds, anchor.id]);
  const candidates = colors
    .filter((color) => !excluded.has(color.id))
    .map((color) => {
      const hsl = getHsl(color.rgb);
      const rawDifference = Math.abs(hsl.hue - source.hue);
      const hueDifference = Math.min(rawDifference, 360 - rawDifference);
      const labDistance = deltaEFromLab(rgbToLab(anchor.rgb), rgbToLab(color.rgb));
      return { color, hueDifference, labDistance, hsl };
    });
  const closest = (predicate, score) => candidates
    .filter(predicate)
    .sort((a, b) => score(a) - score(b))[0]?.color;
  const analog = closest(
    ({ hueDifference, hsl }) => source.saturation < 0.12
      ? hsl.saturation < 0.16
      : hueDifference >= 12 && hueDifference <= 55,
    ({ labDistance }) => labDistance,
  );
  const complementary = closest(
    ({ hueDifference, hsl, color }) => source.saturation >= 0.12
      ? hueDifference >= 145 && hueDifference <= 215
      : Math.abs(anchor.lrv - color.lrv) >= 35,
    ({ labDistance, hueDifference }) => source.saturation < 0.12
      ? labDistance
      : Math.abs(180 - hueDifference) + labDistance * 0.05,
  );
  const accent = closest(
    ({ hueDifference, hsl }) => source.saturation >= 0.12
      ? (hueDifference >= 70 && hueDifference < 145) || (hueDifference > 215 && hueDifference <= 290)
      : hsl.saturation >= 0.2,
    ({ labDistance, hsl, hueDifference }) => source.saturation < 0.12
      ? labDistance - hsl.saturation * 18
      : Math.min(Math.abs(110 - hueDifference), Math.abs(250 - hueDifference)) + labDistance * 0.03,
  );
  return [
    { type: 'Близкий тон', description: 'Мягкое сочетание', color: analog },
    { type: 'Комплементарный', description: 'Контрастная пара', color: complementary },
    { type: 'Акцентный', description: 'Яркий цветовой акцент', color: accent },
  ].filter((item) => item.color);
}
