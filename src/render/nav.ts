const NEXT = new Set(['ArrowRight', 'ArrowDown', ' ', 'PageDown']);
const PREVIOUS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);

/** The slide (1-based) a present-mode key moves to, from slide `at` of `count`; undefined for any other key. */
export function slideTarget(key: string, at: number, count: number): number | undefined {
  if (NEXT.has(key)) return Math.min(at + 1, count);
  if (PREVIOUS.has(key)) return Math.max(at - 1, 1);
  if (key === 'Home') return 1;
  if (key === 'End') return count;
  return undefined;
}

/** A finger that moves no more than this many pixels is a tap. */
export const TAP_MAX_PX = 10;
/** A swipe must travel at least this far sideways. */
export const SWIPE_MIN_PX = 40;

/** The slide a tap goes to: the left third goes back, the rest of the screen goes forward. */
export function tapTarget(x: number, width: number, at: number, count: number): number {
  return x < width / 3 ? Math.max(at - 1, 1) : Math.min(at + 1, count);
}

/** What a finger movement of (dx, dy) pixels was: a tap, a mostly sideways swipe, or neither. */
export function classifyTouch(dx: number, dy: number): 'tap' | 'swipe' | 'none' {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax <= TAP_MAX_PX && ay <= TAP_MAX_PX) return 'tap';
  if (ax >= SWIPE_MIN_PX && ax > ay * 1.5) return 'swipe';
  return 'none';
}

/** The slide a swipe goes to: left moves forward, right moves back. Undefined if it was not a swipe. */
export function swipeTarget(dx: number, dy: number, at: number, count: number): number | undefined {
  if (classifyTouch(dx, dy) !== 'swipe') return undefined;
  return dx < 0 ? Math.min(at + 1, count) : Math.max(at - 1, 1);
}
