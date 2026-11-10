import { parseAttrs, scanAttrs } from './attrs';
import { isValidFontName } from './fontName';
import { duplicateSpan } from './layout';
import { parseSettings, settingRange } from './settings';
import type { Box, Slide } from './slide';
import type { Grid, Span } from './types';

export type Edit = { from: number; to: number; insert: string };
export type EditResult = { changes: Edit[]; select?: number; selectTo?: number };

function settingValueRange(source: string, range: { from: number; to: number }): { from: number; to: number } {
  const line = source.slice(range.from, range.to);
  const colon = line.indexOf(':');
  let from = colon + 1;
  while (/\s/.test(line.charAt(from))) from++;
  let to = line.length;
  const quote = line.charAt(from);
  if (quote === '"' || quote === "'") {
    const closing = line.indexOf(quote, from + 1);
    if (closing !== -1) to = closing + 1;
  } else {
    const comment = /\s+#/.exec(line.slice(from));
    if (comment) to = from + comment.index;
    while (to > from && /\s/.test(line.charAt(to - 1))) to--;
  }
  return { from: range.from + from, to: range.from + to };
}

/** Sets `font:` in the settings block, creating or removing the line as needed. */
export function setDeckFont(source: string, name: string | null): EditResult {
  const parsed = parseSettings(source);
  const range = settingRange(source, 'font');
  if (name === null) {
    if (!range) return { changes: [] };
    const to = source.charAt(range.to) === '\n' ? range.to + 1 : range.to;
    const { bodyStart } = parsed;
    const closingLine = bodyStart > 0 ? source.lastIndexOf('\n---', bodyStart - 1) + 1 : 0;
    const remaining = closingLine > 0
      ? source.slice(4, range.from) + source.slice(to, closingLine)
      : '';
    if (closingLine > 0 && remaining.trim() === '') {
      const blockTo = source.charAt(bodyStart) === '\n' ? bodyStart + 1 : bodyStart;
      return { changes: [{ from: 0, to: blockTo, insert: '' }] };
    }
    const withoutFont = source.slice(0, range.from) + source.slice(to);
    if (parseSettings(withoutFont).bodyStart === 0) {
      return { changes: [{ from: range.from, to: range.to, insert: 'font: default' }] };
    }
    return { changes: [{ from: range.from, to, insert: '' }] };
  }
  if (!isValidFontName(name)) return { changes: [] };
  if (parsed.settings.font?.toLowerCase() === name.toLowerCase()) return { changes: [] };

  const line = `font: ${name}`;
  if (range) {
    const value = settingValueRange(source, range);
    return { changes: [{ from: value.from, to: value.to, insert: name }] };
  }
  if (parsed.bodyStart > 0) {
    return { changes: [{ from: 4, to: 4, insert: `${line}\n` }] };
  }
  return { changes: [{ from: 0, to: 0, insert: `---\n${line}\n---\n\n` }] };
}

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

/** Inserts a new titled slide after `slide`, or creates the first slide in an empty deck. */
export function insertSlideAfter(source: string, slide: Slide | undefined): EditResult {
  const at = slide?.sourceEnd ?? source.length;
  const slideText = slide ? source.slice(slide.range.from, at) : source;
  const beforeTitle = `${beforeBlock(slideText)}---\n\n# `;
  const insert = `${beforeTitle}New slide${at === source.length ? '\n' : '\n\n'}`;
  const select = at + beforeTitle.length;
  return {
    changes: [{ from: at, to: at, insert }],
    select,
    selectTo: select + 'New slide'.length,
  };
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
