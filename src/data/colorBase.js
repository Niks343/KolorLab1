export function estimateLrvFromHex(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Некорректный HEX-код цвета: ${hex}`);

  const channels = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return Math.round((0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]) * 100);
}

export function getTintingBase(hex, lrv, baseOverride) {
  if (baseOverride === 'A' || baseOverride === 'C') return baseOverride;

  const channels = hex.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3 || channels.some((channel) => Number.isNaN(channel))) {
    throw new Error(`Некорректный HEX-код цвета: ${hex}`);
  }

  const maximum = Math.max(...channels);
  const minimum = Math.min(...channels);
  const saturation = maximum === 0 ? 0 : ((maximum - minimum) / maximum) * 100;
  return lrv >= 50 && saturation <= 65 ? 'A' : 'C';
}
