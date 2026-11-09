import { describe, expect, it } from 'vitest';
import {
  centredSpan,
  clampNewBox,
  duplicateSpan,
  findFreeArea,
  moveSpan,
  resizeSpan,
} from '../../src/core/layout';
import { parseDeck } from '../../src/core/parse';

describe('grid maths', () => {
  it('findFreeArea returns the first free 4x2 area from the top left', () => {
    const slide = parseDeck('::: box col=1-12 row=1\nx\n:::\n').slides[0]!;
    expect(findFreeArea(slide, 4, 2)).toEqual({ col: [1, 4], row: [2, 3] });
  });

  it('findFreeArea returns null when the slide is full', () => {
    const slide = parseDeck('::: box col=1-12 row=1-6\nx\n:::\n').slides[0]!;
    expect(findFreeArea(slide, 1, 1)).toBeNull();
  });

  it('centredSpan puts the requested area in the middle of the grid', () => {
    expect(centredSpan({ cols: 12, rows: 6 }, 4, 2)).toEqual({ col: [5, 8], row: [3, 4] });
  });

  it('moveSpan stops at the grid edge and keeps the size', () => {
    expect(moveSpan([10, 12], [1, 2], 1, -1, { cols: 12, rows: 6 })).toEqual({
      col: [10, 12],
      row: [1, 2],
    });
  });

  it('resizeSpan never goes below one cell', () => {
    expect(resizeSpan([3, 4], [2, 2], 'e', -5, 0, { cols: 12, rows: 6 })).toEqual({
      col: [3, 3],
      row: [2, 2],
    });
  });

  it('duplicateSpan keeps the span when the shift would not fit', () => {
    expect(duplicateSpan([11, 12], [1, 1], { cols: 12, rows: 6 })).toEqual({
      col: [11, 12],
      row: [1, 1],
    });
  });

  it('clampNewBox makes a 3x2 box smaller at the bottom right corner', () => {
    expect(clampNewBox(12, 6, 3, 2, { cols: 12, rows: 6 })).toEqual({
      col: [12, 12],
      row: [6, 6],
    });
  });
});
