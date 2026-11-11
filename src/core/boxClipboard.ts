import { parseAttrs, parseSpan } from './attrs';
import { setBoxSpan, type EditResult } from './edit';
import { fencedLines } from './fences';
import { moveSpan, type GridArea } from './layout';
import type { Box, Slide } from './slide';
import type { Grid, Span } from './types';

/** The text a copied box puts on the clipboard: its Markdown, exactly as written in the deck. */
export function boxClipboardText(source: string, box: Box): string {
  return `${source.slice(box.range.from, box.range.to)}\n`;
}

/**
 * Splits clipboard text into box blocks (`::: box …` to `:::`). Returns null unless the text is only
 * boxes and blank lines, so that ordinary copied text is never turned into a box.
 */
export function boxBlocks(text: string): string[] | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const fenced = fencedLines(lines);
  const blocks: string[] = [];
  let open: string[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (open) {
      open.push(line);
      if (!fenced[i] && /^:::\s*$/.test(line)) {
        blocks.push(open.join('\n'));
        open = null;
      }
    } else if (/^:::\s*box(?:\s|$)/.test(line)) {
      open = [line];
    } else if (line.trim() !== '') {
      return null;
    }
  }
  if (open || blocks.length === 0) return null;
  return blocks;
}

function sameSpan(a: Span, b: Span): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function sameArea(a: GridArea, b: GridArea): boolean {
  return sameSpan(a.col, b.col) && sameSpan(a.row, b.row);
}

/**
 * Where a pasted box goes: where it was, unless a box is already exactly there. Then it moves one cell down
 * and right like Duplicate, or, against the edge of the slide, the nearest way that keeps it in view.
 */
function freeSpot(asked: GridArea, taken: GridArea[], grid: Grid): GridArea {
  if (!taken.some((t) => sameArea(t, asked))) return asked;
  const directions = [[1, 1], [-1, -1], [1, -1], [-1, 1], [1, 0], [0, 1], [-1, 0], [0, -1]] as const;
  for (let step = 1; step <= Math.max(grid.cols, grid.rows); step++) {
    for (const [dc, dr] of directions) {
      const wanted = { col: asked.col[0] + dc * step, row: asked.row[0] + dr * step };
      const area = moveSpan(asked.col, asked.row, dc * step, dr * step, grid);
      // Only a move that went the full way, so boxes do not pile up against the edge.
      if (area.col[0] !== wanted.col || area.row[0] !== wanted.row) continue;
      if (!taken.some((t) => sameArea(t, area))) return area;
    }
  }
  return asked;
}

/**
 * Adds copied boxes to the end of `slide`. A box keeps its place, cut to the slide's grid; a box that would
 * land exactly on another one moves a cell (see freeSpot). Returns null when the text is
 * not boxes. `count` is the number of boxes added; they are the last ones on the slide.
 */
export function pasteBoxes(source: string, slide: Slide, text: string): (EditResult & { count: number }) | null {
  const blocks = boxBlocks(text);
  if (!blocks) return null;
  const grid = slide.grid;
  const taken = slide.boxes.map((box) => ({ col: box.col, row: box.row }));
  const placed = blocks.map((block) => {
    const opening = block.slice(0, block.indexOf('\n') === -1 ? block.length : block.indexOf('\n'));
    const { attrs } = parseAttrs(opening.replace(/^:::\s*box/, ''));
    const asked = { col: parseSpan(attrs.col, grid.cols).span, row: parseSpan(attrs.row, grid.rows).span };
    const area = freeSpot(asked, taken, grid);
    taken.push(area);
    // Rewrite col and row with the same code that moves a box, on the block by itself.
    const asBox = { range: { from: 0, to: block.length } } as Box;
    const { changes } = setBoxSpan(block, asBox, area.col, area.row, grid);
    return [...changes]
      .sort((a, b) => b.from - a.from)
      .reduce((out, change) => out.slice(0, change.from) + change.insert + out.slice(change.to), block);
  });
  const slideText = source.slice(slide.range.from, slide.range.to);
  const prefix = slideText === '' || slideText.endsWith('\n\n') ? '' : slideText.endsWith('\n') ? '\n' : '\n\n';
  const insert = `${prefix}${placed.join('\n\n')}\n`;
  return {
    changes: [{ from: slide.range.to, to: slide.range.to, insert }],
    count: placed.length,
  };
}
