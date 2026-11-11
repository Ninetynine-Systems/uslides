import { scanAttrs } from './attrs';
import { setBoxSpan, type Edit, type EditResult } from './edit';
import { unclosedFence } from './fences';
import type { Slide } from './slide';
import type { Grid, Span } from './types';

/**
 * Edits that act on a whole slide: its settings line, and its place in the deck. Like the box edits, they
 * return changes to the Markdown, so the app, the text editor and agents all change slides the same way.
 */

const NONE: EditResult = { changes: [] };
/** The slide settings comment, split into its opening, its attributes, and its closing. */
const SLIDE_COMMENT = /^(\s*<!--\s*slide)((?:\s.*?)?)(\s*-->\s*)$/;

type Line = { from: number; to: number; text: string };

/** The first line of the slide that is not blank: where its settings comment goes. */
function firstContentLine(source: string, slide: Slide): Line | undefined {
  let pos = slide.range.from;
  while (pos <= slide.range.to) {
    const newline = source.indexOf('\n', pos);
    const to = newline === -1 || newline > slide.range.to ? slide.range.to : newline;
    const text = source.slice(pos, to);
    if (text.trim() !== '') return { from: pos, to, text };
    if (to >= slide.range.to) return undefined;
    pos = to + 1;
  }
  return undefined;
}

/** The slide text split into its leading blank space, its content, and its trailing blank space. */
function parts(source: string, slide: Slide): { lead: string; body: string; trail: string } {
  const text = source.slice(slide.range.from, slide.range.to);
  if (text.trim() === '') return { lead: text, body: '', trail: '' };
  const lead = /^\s*/.exec(text)![0];
  const trail = /\s*$/.exec(text)![0];
  return { lead, body: text.slice(lead.length, text.length - trail.length), trail };
}

/**
 * Sets, changes or removes keys in the slide's `<!-- slide ... -->` line, creating it when the slide has
 * none and removing it when no keys are left. `also` holds further changes made in the same step.
 */
export function setSlideAttrs(
  source: string,
  slide: Slide,
  attrs: Record<string, string | null>,
  also: Edit[] = [],
): EditResult {
  const values = Object.entries(attrs);
  if (values.some(([, value]) => value !== null && (/[\s"]/.test(value) || value.includes('--')))) return NONE;

  const changes: Edit[] = [...also];
  const line = firstContentLine(source, slide);
  const match = line && SLIDE_COMMENT.exec(line.text);
  if (line && match) {
    const inner = match[2]!;
    const kept: string[] = [];
    const done = new Set<string>();
    for (const attr of scanAttrs(inner)) {
      if (!(attr.key in attrs)) {
        kept.push(inner.slice(attr.from, attr.to));
        continue;
      }
      if (done.has(attr.key)) continue;
      done.add(attr.key);
      const value = attrs[attr.key];
      if (value !== null && value !== undefined) kept.push(`${attr.key}=${value}`);
    }
    for (const [key, value] of values) {
      if (!done.has(key) && value !== null) kept.push(`${key}=${value}`);
    }
    if (kept.length === 0) {
      // Nothing left: remove the line and the blank lines after it.
      let to = line.to;
      while (to < slide.range.to && /\s/.test(source.charAt(to))) to++;
      changes.push({ from: line.from, to, insert: '' });
    } else {
      const next = `<!-- slide ${kept.join(' ')} -->`;
      if (next !== line.text) changes.push({ from: line.from, to: line.to, insert: next });
    }
  } else {
    const added = values.filter(([, value]) => value !== null).map(([key, value]) => `${key}=${value}`);
    if (added.length > 0) {
      const comment = `<!-- slide ${added.join(' ')} -->`;
      if (line) changes.push({ from: line.from, to: line.from, insert: `${comment}\n\n` });
      else changes.push({ from: slide.range.from, to: slide.range.from, insert: `\n${comment}\n` });
    }
  }
  if (changes.length === 0) return NONE;
  changes.sort((a, b) => a.from - b.from);
  return { changes };
}

/** Maps a span from one grid size to another, so a box keeps its place on the slide. */
function scaleSpan(span: Span, from: number, to: number): Span {
  const start = Math.min(to, Math.floor(((span[0] - 1) * to) / from) + 1);
  const end = Math.min(to, Math.max(start, Math.round((span[1] * to) / from)));
  return [start, end];
}

/**
 * Gives the slide its own grid, or the deck's grid when `next` is null. Boxes are moved onto the new grid
 * so they stay where they were.
 */
export function setSlideGrid(source: string, slide: Slide, deckGrid: Grid, next: Grid | null): EditResult {
  const grid = next ?? deckGrid;
  const value = next ? `${next.cols}x${next.rows}` : null;
  const old = slide.grid;
  const boxes: Edit[] = grid.cols === old.cols && grid.rows === old.rows
    ? []
    : slide.boxes.flatMap((box) => setBoxSpan(
      source,
      box,
      scaleSpan(box.col, old.cols, grid.cols),
      scaleSpan(box.row, old.rows, grid.rows),
      grid,
    ).changes);
  return setSlideAttrs(source, slide, { grid: value }, boxes);
}

/** Swaps a slide with the one before it (`-1`) or after it (`1`). The cursor follows the moved slide. */
export function moveSlide(source: string, slides: readonly Slide[], index: number, direction: -1 | 1): EditResult {
  const moving = slides[index];
  const other = slides[index + direction];
  if (!moving || !other) return NONE;
  const [first, second] = direction < 0 ? [other, moving] : [moving, other];
  const a = parts(source, first);
  const b = parts(source, second);
  const changes: Edit[] = [
    { from: first.range.from, to: first.range.to, insert: a.lead + b.body + a.trail },
    { from: second.range.from, to: second.range.to, insert: b.lead + a.body + b.trail },
  ];
  const select = direction < 0
    ? first.range.from + a.lead.length
    : second.range.from + (b.body.length - a.body.length) + b.lead.length;
  return { changes, select };
}

/** Puts a copy of the slide right after it. The cursor moves to the copy. */
export function duplicateSlide(source: string, slide: Slide): EditResult {
  const { body } = parts(source, slide);
  if (unclosedFence(body.split('\n'))) return NONE;
  if (slide.sourceEnd < source.length) {
    const insert = `---\n\n${body}\n\n`;
    return { changes: [{ from: slide.sourceEnd, to: slide.sourceEnd, insert }], select: slide.sourceEnd + 5 };
  }
  const gap = source.endsWith('\n\n') ? '' : source.endsWith('\n') ? '\n' : '\n\n';
  const before = `${gap}---\n\n`;
  return {
    changes: [{ from: source.length, to: source.length, insert: `${before}${body}\n` }],
    select: source.length + before.length,
  };
}

/** Removes a slide and its separator. The last remaining slide cannot be removed. */
export function deleteSlide(source: string, slides: readonly Slide[], index: number): EditResult {
  const slide = slides[index];
  if (!slide || slides.length <= 1) return NONE;
  if (slide.sourceEnd < source.length) {
    const next = slides[index + 1];
    return { changes: [{ from: slide.range.from, to: next ? next.range.from : source.length, insert: '' }], select: slide.range.from };
  }
  // The last slide: remove it with the separator before it, and leave the slide before it ending in one line break.
  const previous = slides[index - 1]!;
  const { lead, body } = parts(source, previous);
  const end = previous.range.from + lead.length + body.length;
  return { changes: [{ from: end, to: source.length, insert: '\n' }], select: previous.range.from };
}
