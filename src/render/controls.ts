import { classifyTouch, swipeTarget, tapTarget } from './nav';
import './nav.css';

// Touch and pointer controls shared by Present and the exported player.
// Touch: a tap on the left third goes back, any other tap goes forward, a sideways swipe changes slide.
// A close button shows on touch screens, and after the pointer moves. It fades after 2 seconds of no movement.

export const IDLE_MS = 2000;

type Controls = {
  /** The slide shown (1-based) and the number of slides, read when a gesture ends. */
  state(): { at: number; count: number };
  go(slide: number): void;
  exit(): void;
};

const isTouchDevice = () => navigator.maxTouchPoints > 0 || 'ontouchstart' in window;

/**
 * Adds the controls to `root`. The exit button is a child of `root`, so `root` must not have its children replaced.
 * Returns a function that removes everything again.
 */
export function attachControls(root: HTMLElement, { state, go, exit }: Controls): () => void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'us-exit';
  button.setAttribute('aria-label', 'Exit presentation');
  button.textContent = '✕';
  button.addEventListener('click', (e) => {
    e.stopPropagation(); // not also a tap on the slide
    exit();
  });
  root.append(button);

  // Show the button now, and hide it again after a pause. On a mouse-only machine it waits for movement.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wake = () => {
    root.classList.remove('us-idle');
    clearTimeout(timer);
    timer = setTimeout(() => root.classList.add('us-idle'), IDLE_MS);
  };
  if (isTouchDevice()) wake();
  else root.classList.add('us-idle');

  let start: { x: number; y: number; target: EventTarget | null } | undefined;
  const onTouchStart = (e: TouchEvent) => {
    wake();
    // A second finger (a pinch) cancels the gesture.
    start = e.touches.length === 1 ? { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY, target: e.target } : undefined;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const from = start;
    start = undefined;
    const touch = e.changedTouches[0];
    if (!from || !touch || e.touches.length > 0) return;
    const target = from.target as Element | null;
    // A link in the slide and the exit button do their own thing.
    if (target?.closest?.('a, .us-exit')) return;
    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;
    const kind = classifyTouch(dx, dy);
    if (kind === 'none') return;
    e.preventDefault(); // the browser would also send a click for a tap
    const { at, count } = state();
    const next = kind === 'tap' ? tapTarget(from.x, root.clientWidth || window.innerWidth, at, count) : swipeTarget(dx, dy, at, count);
    if (next !== undefined && next !== at) go(next);
  };
  const onTouchCancel = () => {
    start = undefined;
  };

  root.addEventListener('pointermove', wake);
  root.addEventListener('touchstart', onTouchStart, { passive: true });
  root.addEventListener('touchend', onTouchEnd, { passive: false });
  root.addEventListener('touchcancel', onTouchCancel);
  return () => {
    clearTimeout(timer);
    root.classList.remove('us-idle');
    root.removeEventListener('pointermove', wake);
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchend', onTouchEnd);
    root.removeEventListener('touchcancel', onTouchCancel);
    button.remove();
  };
}
