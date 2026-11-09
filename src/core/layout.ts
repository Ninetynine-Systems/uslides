import type { Slide } from './slide';
import type { Grid, Span } from './types';

export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type GridArea = { col: Span; row: Span };

function overlaps(a: Span, b: Span): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

export function findFreeArea(slide: Slide, w: number, h: number): GridArea | null {
  if (w < 1 || h < 1 || w > slide.grid.cols || h > slide.grid.rows) return null;
  for (let row = 1; row <= slide.grid.rows - h + 1; row++) {
    for (let col = 1; col <= slide.grid.cols - w + 1; col++) {
      const area = { col: [col, col + w - 1] as Span, row: [row, row + h - 1] as Span };
      const covered = slide.boxes.some((box) => overlaps(area.col, box.col) && overlaps(area.row, box.row));
      if (!covered) return area;
    }
  }
  return null;
}

export function centredSpan(grid: Grid, w: number, h: number): GridArea {
  const width = Math.min(Math.max(1, w), grid.cols);
  const height = Math.min(Math.max(1, h), grid.rows);
  const col = Math.floor((grid.cols - width) / 2) + 1;
  const row = Math.floor((grid.rows - height) / 2) + 1;
  return { col: [col, col + width - 1], row: [row, row + height - 1] };
}

export function moveSpan(col: Span, row: Span, dc: number, dr: number, grid: Grid): GridArea {
  const width = col[1] - col[0];
  const height = row[1] - row[0];
  const nextCol = Math.min(Math.max(1, col[0] + dc), grid.cols - width);
  const nextRow = Math.min(Math.max(1, row[0] + dr), grid.rows - height);
  return { col: [nextCol, nextCol + width], row: [nextRow, nextRow + height] };
}

export function resizeSpan(col: Span, row: Span, edge: Edge, dc: number, dr: number, grid: Grid): GridArea {
  let [colStart, colEnd] = col;
  let [rowStart, rowEnd] = row;

  if (edge.includes('w')) colStart = Math.min(Math.max(1, colStart + dc), colEnd);
  if (edge.includes('e')) colEnd = Math.max(Math.min(grid.cols, colEnd + dc), colStart);
  if (edge.includes('n')) rowStart = Math.min(Math.max(1, rowStart + dr), rowEnd);
  if (edge.includes('s')) rowEnd = Math.max(Math.min(grid.rows, rowEnd + dr), rowStart);

  return { col: [colStart, colEnd], row: [rowStart, rowEnd] };
}

export function duplicateSpan(col: Span, row: Span, grid: Grid): GridArea {
  if (col[1] + 1 > grid.cols || row[1] + 1 > grid.rows) return { col: [...col], row: [...row] };
  return { col: [col[0] + 1, col[1] + 1], row: [row[0] + 1, row[1] + 1] };
}

export function clampNewBox(col: number, row: number, w: number, h: number, grid: Grid): GridArea {
  const colStart = Math.min(Math.max(1, col), grid.cols);
  const rowStart = Math.min(Math.max(1, row), grid.rows);
  const colEnd = Math.min(grid.cols, colStart + Math.max(1, w) - 1);
  const rowEnd = Math.min(grid.rows, rowStart + Math.max(1, h) - 1);
  return { col: [colStart, colEnd], row: [rowStart, rowEnd] };
}
