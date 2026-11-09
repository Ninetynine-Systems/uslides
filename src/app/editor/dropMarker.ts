/**
 * The editor sets this on a drop event when it took the dropped images itself, so the window-wide
 * drop zone (which opens dropped files as decks) knows to leave that drop alone.
 */
const KEY = '__uslidesImageDrop';

export function markImageDrop(e: Event): void {
  (e as unknown as Record<string, boolean>)[KEY] = true;
}

export function isImageDrop(e: Event): boolean {
  return (e as unknown as Record<string, boolean | undefined>)[KEY] === true;
}
