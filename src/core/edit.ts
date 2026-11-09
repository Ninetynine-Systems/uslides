import { parseAttrs, scanAttrs } from './attrs';
import { duplicateSpan } from './layout';
import type { Box, Slide } from './slide';
import type { Grid, Span } from './types';

export type Edit = { from: number; to: number; insert: string };
export type EditResult = { changes: Edit[]; select?: number };

function openingLine(source: string, box: Box): { text: string; from: number } {
  const newline = source.indexOf('\n', box.range.from);
  const to = newline === -1 ? source.length : newline;
  return { text: source.slice(box.range.from, to), from: box.range.from };
}

function writtenValue(value: string): string | null {
  if (value.includes('"')) return null;
  return /\s/.test(value) ? `"${value}"` : value;
}

function matchingAttributes(text: string, key: string) {
  return scanAttrs(text).filter((attr) => attr.key === key);
}

function hasUnterminatedQuote(text: string): boolean {
  const attrText = /^:::\s*box(?:\s+(.*))?$/.exec(text)?.[1] ?? '';
  return parseAttrs(attrText).errors.some((error) => error.startsWith('Unterminated quote'));
}

export function setBoxAttrs(source: string, box: Box, attrs: Record<string, string | null>): EditResult {
  const values = Object.entries(attrs);
  if (values.some(([, value]) => value !== null && /["\r\n]/.test(value))) return { changes: [] };

  const line = openingLine(source, box);
  if (hasUnterminatedQuote(line.text)) return { changes: [] };

  const changes: Edit[] = [];
  const additions: string[] = [];

  for (const [key, value] of values) {
    const found = matchingAttributes(line.text, key);
    if (value === null) {
      for (const attr of found) {
        const removeSpace = attr.from > 0 && /\s/.test(line.text.charAt(attr.from - 1)) ? 1 : 0;
        changes.push({
          from: line.from + attr.from - removeSpace,
          to: line.from + attr.to,
          insert: '',
        });
      }
      continue;
    }

    const insert = writtenValue(value)!;
    const effective = found.at(-1);
    if (effective) {
      changes.push({ from: line.from + effective.valueFrom, to: line.from + effective.valueTo, insert });
    } else {
      additions.push(` ${key}=${insert}`);
    }
  }

  if (additions.length > 0) {
    changes.push({ from: line.from + line.text.length, to: line.from + line.text.length, insert: additions.join('') });
  }
  changes.sort((a, b) => a.from - b.from);
  return { changes };
}

function spanValue(span: Span, axisSize: number): string {
  if (span[0] === 1 && span[1] === axisSize) return `1-${axisSize}`;
  return span[0] === span[1] ? String(span[0]) : `${span[0]}-${span[1]}`;
}

export function setBoxSpan(source: string, box: Box, col: Span, row: Span, grid: Grid): EditResult {
  return setBoxAttrs(source, box, { col: spanValue(col, grid.cols), row: spanValue(row, grid.rows) });
}

function beforeBlock(text: string): string {
  if (text === '') return '';
  if (text.endsWith('\n\n')) return '';
  if (text.endsWith('\n')) return '\n';
  return '\n\n';
}

export function insertBox(source: string, slide: Slide, col: Span, row: Span): EditResult {
  const opening = `::: box col=${spanValue(col, slide.grid.cols)} row=${spanValue(row, slide.grid.rows)}`;
  const prefix = beforeBlock(source.slice(slide.range.from, slide.range.to));
  const insert = `${prefix}${opening}\n\n:::\n`;
  return {
    changes: [{ from: slide.range.to, to: slide.range.to, insert }],
    select: slide.range.to + prefix.length + opening.length + 1,
  };
}

function lineBreaksAfter(source: string, at: number): number {
  let to = at;
  while (source.charAt(to) === '\n') to++;
  return to;
}

function lineBreaksBefore(source: string, at: number): number {
  let from = at;
  while (from > 0 && source.charAt(from - 1) === '\n') from--;
  return from;
}

export function deleteBox(source: string, box: Box): EditResult {
  const after = lineBreaksAfter(source, box.range.to);
  const to = Math.min(after, box.range.to + 2);
  const blankLinesBefore = lineBreaksBefore(source, box.range.from);
  const from = after === source.length ? Math.min(box.range.from, blankLinesBefore + 1) : box.range.from;
  return { changes: [{ from, to, insert: '' }] };
}

export function bringToFront(source: string, slide: Slide, box: Box): EditResult {
  const last = slide.boxes[slide.boxes.length - 1];
  if (!last || last === box) return { changes: [] };
  const after = lineBreaksAfter(source, box.range.to);
  const separator = source.slice(box.range.to, after);
  const block = source.slice(box.range.from, box.range.to);
  return {
    changes: [
      { from: box.range.from, to: after, insert: '' },
      { from: last.range.to, to: last.range.to, insert: separator + block },
    ],
  };
}

export function sendToBack(source: string, slide: Slide, box: Box): EditResult {
  const first = slide.boxes[0];
  if (!first || first === box) return { changes: [] };
  const before = lineBreaksBefore(source, box.range.from);
  const separator = source.slice(before, box.range.from);
  const block = source.slice(box.range.from, box.range.to);
  return {
    changes: [
      { from: before, to: box.range.to, insert: '' },
      { from: first.range.from, to: first.range.from, insert: block + separator },
    ],
  };
}

function applyToBlock(block: string, blockFrom: number, changes: Edit[]): string {
  return [...changes]
    .sort((a, b) => b.from - a.from)
    .reduce(
      (text, change) =>
        text.slice(0, change.from - blockFrom) + change.insert + text.slice(change.to - blockFrom),
      block,
    );
}

export function duplicateBox(source: string, slide: Slide, box: Box, grid: Grid): EditResult {
  const last = slide.boxes[slide.boxes.length - 1];
  if (!last) return { changes: [] };
  const next = duplicateSpan(box.col, box.row, grid);
  const changed = setBoxSpan(source, box, next.col, next.row, grid).changes;
  const copy = applyToBlock(source.slice(box.range.from, box.range.to), box.range.from, changed);
  return { changes: [{ from: last.range.to, to: last.range.to, insert: `\n\n${copy}` }] };
}
