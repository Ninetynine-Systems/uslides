import type { Grid, Span } from './types';

/** Parses `key=value` and `key="quoted value"` pairs separated by whitespace. */
export function parseAttrs(text: string): { attrs: Record<string, string>; errors: string[] } {
  const attrs: Record<string, string> = {};
  const errors: string[] = [];
  let i = 0;
  const n = text.length;
  const isSpace = (c: string) => /\s/.test(c);

  while (i < n) {
    while (i < n && isSpace(text.charAt(i))) i++;
    if (i >= n) break;

    const keyStart = i;
    while (i < n && text.charAt(i) !== '=' && !isSpace(text.charAt(i))) i++;
    const key = text.slice(keyStart, i);

    if (i >= n || text.charAt(i) !== '=') {
      errors.push(`Attribute "${key}" has no value`);
      continue;
    }
    i++; // skip '='

    if (text.charAt(i) === '"') {
      const close = text.indexOf('"', i + 1);
      if (close === -1) {
        errors.push(`Unterminated quote for attribute "${key}"`);
        break;
      }
      attrs[key] = text.slice(i + 1, close);
      i = close + 1;
    } else {
      const valStart = i;
      while (i < n && !isSpace(text.charAt(i))) i++;
      attrs[key] = text.slice(valStart, i);
    }
  }
  return { attrs, errors };
}

/**
 * Parses `N` or `A-B` into a 1-based inclusive span, clamped to 1..max.
 * `undefined` means the whole axis. A reversed range is swapped.
 */
export function parseSpan(
  value: string | undefined,
  max: number,
): { span: Span; clamped: boolean; error?: string } {
  if (value === undefined) return { span: [1, max], clamped: false };
  const m = /^(\d+)(?:-(\d+))?$/.exec(value.trim());
  if (!m) {
    return { span: [1, max], clamped: false, error: `Invalid range "${value}"` };
  }
  let a = Number(m[1]);
  let b = m[2] === undefined ? a : Number(m[2]);
  if (a > b) [a, b] = [b, a];
  const start = Math.min(Math.max(a, 1), max);
  const end = Math.min(Math.max(b, 1), max);
  return { span: [start, end], clamped: start !== a || end !== b };
}

/** Parses `"12x6"`. Both numbers must be integers from 1 to 200. */
export function parseGrid(value: string): Grid | null {
  const m = /^(\d+)x(\d+)$/.exec(value.trim());
  if (!m) return null;
  const cols = Number(m[1]);
  const rows = Number(m[2]);
  if (cols < 1 || cols > 200 || rows < 1 || rows > 200) return null;
  return { cols, rows };
}
