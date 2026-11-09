const NEXT = new Set(['ArrowRight', 'ArrowDown', ' ', 'PageDown']);
const PREVIOUS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);

/** The slide (1-based) a present-mode key moves to, from slide `at` of `count`; undefined for any other key. */
export function slideTarget(key: string, at: number, count: number): number | undefined {
  if (NEXT.has(key)) return Math.min(at + 1, count);
  if (PREVIOUS.has(key)) return Math.max(at - 1, 1);
  if (key === 'Home') return 1;
  if (key === 'End') return count;
  return undefined;
}
