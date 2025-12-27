export function injectAdsWithPattern<T, A>(
  items: T[],
  options: {
    pattern: number[];
    startPatternIndex?: number;
    isCountedItem: (item: T) => boolean;
    isInsertionBlockedAfter?: (item: T) => boolean;
    createAdItem: (seq: number) => A;
  },
): Array<T | A> {
  const pattern = Array.isArray(options.pattern) && options.pattern.length ? options.pattern : [3, 2, 4];
  const startIdx =
    typeof options.startPatternIndex === 'number' && Number.isFinite(options.startPatternIndex)
      ? Math.max(0, Math.floor(options.startPatternIndex) % pattern.length)
      : 0;

  let patternIdx = startIdx;
  let needed = Math.max(1, pattern[patternIdx] || 1);
  let seen = 0;
  let seq = 0;

  const out: Array<T | A> = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    out.push(item);

    if (!options.isCountedItem(item)) continue;
    if (options.isInsertionBlockedAfter && options.isInsertionBlockedAfter(item)) continue;

    seen += 1;
    if (seen >= needed && i < items.length - 1) {
      out.push(options.createAdItem(seq));
      seq += 1;
      seen = 0;
      patternIdx = (patternIdx + 1) % pattern.length;
      needed = Math.max(1, pattern[patternIdx] || 1);
    }
  }

  return out;
}
