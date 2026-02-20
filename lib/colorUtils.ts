type RGB = { r: number; g: number; b: number };

const clamp = (value: number) => Math.max(0, Math.min(255, value));

const parseColor = (color?: string): RGB | null => {
  if (!color) return null;

  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (hex.length !== 6) return null;
    const num = Number.parseInt(hex, 16);
    if (Number.isNaN(num)) return null;
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (match) {
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
    };
  }

  return null;
};

const mixColor = (base: RGB, target: RGB, amount: number) => ({
  r: Math.round(clamp(base.r + (target.r - base.r) * amount)),
  g: Math.round(clamp(base.g + (target.g - base.g) * amount)),
  b: Math.round(clamp(base.b + (target.b - base.b) * amount)),
});

export const lightenColor = (color: string, amount = 0.2) => {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const mixed = mixColor(rgb, { r: 255, g: 255, b: 255 }, amount);
  return `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
};

export const darkenColor = (color: string, amount = 0.2) => {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const mixed = mixColor(rgb, { r: 0, g: 0, b: 0 }, amount);
  return `rgb(${mixed.r}, ${mixed.g}, ${mixed.b})`;
};

export const withAlpha = (color: string, alpha: number) => {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const safeAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${safeAlpha})`;
};

export const accentGradient = (color: string, amount = 0.2): [string, string] => [
  color,
  darkenColor(color, amount),
];
