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
