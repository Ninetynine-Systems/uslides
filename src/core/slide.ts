import { parseAttrs, parseGrid, parseSpan } from './attrs';
import { sanitizeColor } from './colors';
import { fencedLines } from './fences';
import { isValidFontName } from './fontName';
import type { DeckSettings } from './settings';
import type { RawSlide } from './split';
import type { Grid, SourceRange, Span, Warning } from './types';

export type Box = {
  col: Span;
  row: Span;
  bg?: string;
  color?: string;
  font?: string;
  /** The opening box line, used for warnings about the font. */
  fontRange?: SourceRange;
  align: 'left' | 'center' | 'right';
  valign: 'top' | 'middle' | 'bottom';
  fit: 'contain' | 'cover';
  /** Box content with note comments removed. */
  markdown: string;
  /** The whole box, from the opening line to the closing line. */
  range: SourceRange;
  /** The content between the opening and closing lines, as it appears in the source. */
  contentRange: SourceRange;
};

export type Slide = {
  index: number;
  grid: Grid;
  bg?: string;
  color?: string;
  /** Markdown outside any box. Boxes, the slide comment and notes are removed. */
  loose: string;
  /** Source offset for the start of each line in loose. */
  looseLines: number[];
  /** Source ranges for each non-blank run of Markdown outside boxes. */
  looseRanges: SourceRange[];
  boxes: Box[];
  notes: string[];
  range: SourceRange;
};

type Line = {
  /** Text with note comments removed, or null if nothing is left of a line that held one. */
  text: string | null;
  range: SourceRange;
  fenced: boolean;
};

const ALIGN = ['left', 'center', 'right'] as const;
const VALIGN = ['top', 'middle', 'bottom'] as const;
const FIT = ['contain', 'cover'] as const;

function oneOf<T extends string>(allowed: readonly T[], value: string | undefined): T | undefined {
  return allowed.find((a) => a === value);
}

/** Removes `<!-- note: ... -->` comments from every line outside code fences. */
function extractNotes(lines: Line[], notes: string[], warn: (message: string, range: SourceRange) => void): void {
  let open: string[] | null = null;
  let openedAt: Line | null = null;
  for (const line of lines) {
    if (line.fenced || line.text === null) continue;
    let rest = line.text;
    let out = '';
    let touched = false;
    for (;;) {
      if (open) {
        const end = rest.indexOf('-->');
        if (end === -1) {
          open.push(rest);
          touched = true;
          rest = '';
          break;
        }
        open.push(rest.slice(0, end));
        notes.push(open.join('\n').trim());
        open = null;
        touched = true;
        rest = rest.slice(end + 3);
        continue;
      }
      const m = /<!--\s*note:/.exec(rest);
      if (!m) break;
      touched = true;
      out += rest.slice(0, m.index);
      rest = rest.slice(m.index + m[0].length);
      open = [];
      openedAt = line;
    }
    out += rest;
    line.text = touched && out.trim() === '' ? null : out;
  }
  if (open && openedAt) {
    warn('This note is not closed. Add `-->`. It runs to the end of the slide.', openedAt.range);
    notes.push((open as string[]).join('\n').trim());
  }
}

function trimBlankEnds<T extends { text: string | null }>(items: T[]): T[] {
  const blank = (i: T) => i.text === null || i.text.trim() === '';
  let a = 0;
  let b = items.length;
  while (a < b && blank(items[a]!)) a++;
  while (b > a && blank(items[b - 1]!)) b--;
  return items.slice(a, b);
}

function parseSlideComment(
  line: Line,
  grid: Grid,
  slide: Slide,
  warn: (message: string, range: SourceRange) => void,
): void {
  const m = /^\s*<!--\s*slide(?:\s+(.*?))?\s*-->\s*$/.exec(line.text ?? '');
  const { attrs, errors } = parseAttrs(m?.[1] ?? '');
  for (const e of errors) warn(`Slide settings: ${e}.`, line.range);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'grid') {
      const g = parseGrid(value);
      if (g) slide.grid = g;
      else warn(`Invalid slide grid "${value}". Use COLSxROWS, such as 16x9. Using ${grid.cols}x${grid.rows}.`, line.range);
    } else if (key === 'bg' || key === 'color') {
      const c = sanitizeColor(value);
      if (c) slide[key] = c;
      else warn(`Invalid ${key} colour "${value}" in slide settings. It was ignored.`, line.range);
    } else {
      warn(`Unknown slide setting "${key}" was ignored. Known settings are grid, bg and color.`, line.range);
    }
  }
}

function parseBox(
  attrText: string,
  grid: Grid,
  openingRange: SourceRange,
  warn: (message: string) => void,
): Pick<Box, 'col' | 'row' | 'bg' | 'color' | 'font' | 'fontRange' | 'align' | 'valign' | 'fit'> {
  const { attrs, errors } = parseAttrs(attrText);
  for (const e of errors) warn(`Box: ${e}.`);

  const axis = (name: 'col' | 'row', max: number): Span => {
    const { span, clamped, error } = parseSpan(attrs[name], max);
    if (error) warn(`${error} for ${name}. Using the whole ${name === 'col' ? 'width' : 'height'}.`);
    else if (clamped) warn(`${name}=${attrs[name]} is outside the grid (${max} ${name === 'col' ? 'columns' : 'rows'}). It was cut to ${span[0]}-${span[1]}.`);
    return span;
  };
  const colour = (name: 'bg' | 'color') => {
    if (attrs[name] === undefined) return undefined;
    const c = sanitizeColor(attrs[name]);
    if (!c) warn(`Invalid ${name} colour "${attrs[name]}". It was ignored.`);
    return c ?? undefined;
  };
  const choice = <T extends string>(name: string, allowed: readonly T[]): T => {
    const value = attrs[name];
    const found = oneOf(allowed, value);
    if (value !== undefined && !found) warn(`Invalid ${name} "${value}". Use ${allowed.join(', ')}. Using ${allowed[0]}.`);
    return found ?? allowed[0]!;
  };
  const fontName = () => {
    const value = attrs.font;
    if (value === undefined || value === 'default') return undefined;
    if (isValidFontName(value)) return value;
    warn(`Invalid font name "${value}". Font names use only letters, numbers and spaces.`);
    return undefined;
  };

  const known = ['col', 'row', 'bg', 'color', 'font', 'align', 'valign', 'fit'];
  for (const key of Object.keys(attrs)) {
    if (!known.includes(key)) warn(`Unknown box attribute "${key}" was ignored.`);
  }

  const box: ReturnType<typeof parseBox> = {
    col: axis('col', grid.cols),
    row: axis('row', grid.rows),
    align: choice('align', ALIGN),
    valign: choice('valign', VALIGN),
    fit: choice('fit', FIT),
  };
  const bg = colour('bg');
  const color = colour('color');
  const font = fontName();
  if (bg) box.bg = bg;
  if (color) box.color = color;
  if (font) {
    box.font = font;
    box.fontRange = openingRange;
  }
  return box;
}

export function parseSlide(
  raw: RawSlide,
  index: number,
  settings: DeckSettings,
): { slide: Slide; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const warn = (message: string, range: SourceRange) => warnings.push({ message, range, slideIndex: index });

  const slide: Slide = {
    index,
    grid: settings.grid,
    loose: '',
    looseLines: [],
    looseRanges: [],
    boxes: [],
    notes: [],
    range: raw.range,
  };

  const texts = raw.text.split('\n');
  const fenced = fencedLines(texts);
  let offset = raw.range.from;
  const lines: Line[] = texts.map((text, i) => {
    const range = { from: offset, to: offset + text.length };
    offset += text.length + 1;
    return { text, range, fenced: fenced[i]! };
  });

  const first = lines.find((l) => l.text!.trim() !== '');
  if (first && !first.fenced && /^\s*<!--\s*slide(?:\s|-->)/.test(first.text!)) {
    if (/^\s*<!--\s*slide(?:\s+(.*?))?\s*-->\s*$/.test(first.text!)) {
      parseSlideComment(first, settings.grid, slide, warn);
      first.text = null;
    } else {
      warn('Slide settings must be on one line, ending with `-->`, with nothing after it. They were ignored.', first.range);
    }
  }

  extractNotes(lines, slide.notes, warn);

  const loose: Line[] = [];
  let open: { line: Line; attrs: Omit<Box, 'markdown' | 'range' | 'contentRange'>; content: Line[] } | null = null;

  const close = (closing: Line | null) => {
    if (!open) return;
    const content = trimBlankEnds(open.content);
    const lastLine = closing ?? lines[lines.length - 1]!;
    const contentRange = content.length
      ? { from: content[0]!.range.from, to: content[content.length - 1]!.range.to }
      : { from: open.line.range.to, to: open.line.range.to };
    slide.boxes.push({
      ...open.attrs,
      markdown: content.map((l) => l.text ?? '').join('\n'),
      range: { from: open.line.range.from, to: lastLine.range.to },
      contentRange,
    });
    open = null;
  };

  for (const line of lines) {
    const text = line.text;
    if (text === null) continue;
    const fence = /^:::\s*(\S*)\s*(.*)$/.exec(text.trim());
    if (line.fenced || !fence || !text.startsWith(':::')) {
      (open ? open.content : loose).push(line);
      continue;
    }
    const word = fence[1]!;
    if (open) {
      if (word === '') {
        close(line);
      } else {
        if (word === 'box') warn('A box inside another box is not allowed (nested boxes). It is shown as plain text.', line.range);
        else warn(`Unknown "::: ${word}" block. Only "::: box" is supported. It is shown as plain text.`, line.range);
        open.content.push(line);
      }
    } else if (word === 'box') {
      const attrs = parseBox(fence[2]!, slide.grid, line.range, (m) => warn(m, line.range));
      open = { line, attrs, content: [] };
    } else {
      if (word === '') warn('A ":::" line with no open box was shown as plain text.', line.range);
      else warn(`Unknown "::: ${word}" block. Only "::: box" is supported. It is shown as plain text.`, line.range);
      loose.push(line);
    }
  }
  if (open) {
    const o: { line: Line } = open;
    warn('This box is not closed. Add a ":::" line after its content. It runs to the end of the slide.', o.line.range);
    close(null);
  }

  const pieces: Line[][] = [];
  let run: Line[] = [];
  const finishRun = () => {
    if (run.some((line) => line.text?.trim() !== '')) {
      slide.looseRanges.push({ from: run[0]!.range.from, to: run[run.length - 1]!.range.to });
      pieces.push(trimBlankEnds(run));
    }
    run = [];
  };
  for (const line of loose) {
    const previous = run[run.length - 1];
    if (previous && previous.range.to + 1 !== line.range.from) finishRun();
    run.push(line);
  }
  finishRun();

  const rendered: string[] = [];
  for (const [index, piece] of pieces.entries()) {
    if (index > 0) {
      const previous = pieces[index - 1]!.at(-1)!;
      rendered.push('');
      slide.looseLines.push(previous.range.to + 1);
    }
    for (const line of piece) {
      rendered.push(line.text ?? '');
      slide.looseLines.push(line.range.from);
    }
  }
  slide.loose = rendered.join('\n');
  return { slide, warnings };
}
