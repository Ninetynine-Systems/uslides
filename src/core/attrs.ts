import type { Grid, Span } from './types';

export type ScannedAttr = {
  key: string;
  from: number;
  to: number;
  valueFrom: number;
  valueTo: number;
};

function readAttrs(text: string): { scanned: ScannedAttr[]; errors: string[] } {
  const scanned: ScannedAttr[] = [];
  const errors: string[] = [];
  let i = 0;
  const n = text.length;
  const isSpace = (c: string) => /\s/.test(c);

  while (i < n) {
    while (i < n && isSpace(text.charAt(i))) i++;
    if (i >= n) break;

    const from = i;
    while (i < n && text.charAt(i) !== '=' && !isSpace(text.charAt(i))) i++;
    const key = text.slice(from, i);

    if (i >= n || text.charAt(i) !== '=') {
      errors.push(`Attribute "${key}" has no value`);
      continue;
    }
    i++; // skip '='
    const valueFrom = i;

    if (text.charAt(i) === '"') {
      const close = text.indexOf('"', i + 1);
      if (close === -1) {
        errors.push(`Unterminated quote for attribute "${key}"`);
        break;
      }
      i = close + 1;
    } else {
      while (i < n && !isSpace(text.charAt(i))) i++;
    }
    scanned.push({ key, from, to: i, valueFrom, valueTo: i });
  }
  return { scanned, errors };
}

/** Finds valid attributes and their offsets in `text`. Quoted value offsets include the quotes. */
export function scanAttrs(text: string): ScannedAttr[] {
  return readAttrs(text).scanned;
}

/** Parses `key=value` and `key="quoted value"` pairs separated by whitespace. */
export function parseAttrs(text: string): { attrs: Record<string, string>; errors: string[] } {
  const attrs: Record<string, string> = {};
  const { scanned, errors } = readAttrs(text);
  for (const attr of scanned) {
    const value = text.slice(attr.valueFrom, attr.valueTo);
    attrs[attr.key] = value.startsWith('"') ? value.slice(1, -1) : value;
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
