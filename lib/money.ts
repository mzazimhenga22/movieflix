type FormatMoneyOpts = {
  decimals?: number;
  compact?: boolean;
};

const clampFinite = (n: number, fallback = 0) => (Number.isFinite(n) ? n : fallback);

export function formatKsh(amount: number, opts?: FormatMoneyOpts) {
  const decimals = typeof opts?.decimals === 'number' ? Math.max(0, Math.min(4, opts.decimals)) : 0;
  const compact = !!opts?.compact;
  const value = clampFinite(amount, 0);

  try {
    // Intl may be missing/partial in some RN runtimes.
    if (typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function') {
      const nf = new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: 'KES',
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        notation: compact ? 'compact' : 'standard',
        compactDisplay: 'short',
      });
      return nf.format(value);
    }
  } catch {
    // fall through
  }

  const rounded = decimals === 0 ? Math.round(value) : Number(value.toFixed(decimals));
  const parts = String(rounded).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `KSh ${parts.join('.')}`;
}
