import type { Grid } from '../../core/types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Returns the 1-based grid cell under a point. Points outside the stage use the nearest cell. */
export function cellAt(
  stage: HTMLElement,
  grid: Grid,
  clientX: number,
  clientY: number,
): { col: number; row: number } {
  const rect = stage.getBoundingClientRect();
  const x = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
  const y = rect.height === 0 ? 0 : (clientY - rect.top) / rect.height;
  return {
    col: clamp(Math.floor(x * grid.cols) + 1, 1, grid.cols),
    row: clamp(Math.floor(y * grid.rows) + 1, 1, grid.rows),
  };
}

/** Box indexes under a point, from the visually top box to the bottom box. */
export function boxesAt(stage: HTMLElement, clientX: number, clientY: number): number[] {
  const found: number[] = [];
  for (const box of stage.querySelectorAll<HTMLElement>(':scope > .us-box[data-box]')) {
    const rect = box.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
    const index = Number(box.dataset.box);
    if (Number.isInteger(index)) found.push(index);
  }
  return found.reverse();
}
