/**
 * Keeps windows that present the same deck on the same slide: the presenter view in one window and the
 * audience view in another, on this device. Messages never leave the browser.
 */

export const AUDIENCE_WINDOW = 'uslides-audience';
const CHANNEL = 'uslides-present';

export type PresentMessage =
  | { type: 'go'; deckId: string; slide: number }
  /** A window started presenting and asks which slide is shown. */
  | { type: 'hello'; deckId: string }
  /** The presenter ended the presentation. */
  | { type: 'end'; deckId: string };

export function openPresentChannel(onMessage: (message: PresentMessage) => void): {
  post(message: PresentMessage): void;
  close(): void;
} {
  if (typeof BroadcastChannel === 'undefined') return { post: () => undefined, close: () => undefined };
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<PresentMessage>) => onMessage(event.data);
  return { post: (message) => channel.postMessage(message), close: () => channel.close() };
}

/** True in a window that the presenter view opened for the audience. */
export function isAudienceWindow(): boolean {
  return window.name === AUDIENCE_WINDOW;
}

type ScreenDetailsLike = {
  currentScreen: ScreenLike;
  screens: ScreenLike[];
};
type ScreenLike = { availLeft: number; availTop: number; availWidth: number; availHeight: number; label?: string };

/**
 * Opens (or reuses) the audience window at `url`. With a second screen and the browser's permission to
 * place windows, it opens full screen on the other screen; otherwise as a window the user can drag there.
 * Returns the window, or null when the browser blocked it.
 */
export async function openAudienceWindow(url: string): Promise<{ win: Window | null; otherScreen: boolean }> {
  let features = 'popup,width=960,height=600';
  let otherScreen = false;
  const getScreenDetails = (window as unknown as { getScreenDetails?: () => Promise<ScreenDetailsLike> }).getScreenDetails;
  // Only ask about screens when there is more than one, so a single screen never shows a permission prompt.
  if (getScreenDetails && (screen as Screen & { isExtended?: boolean }).isExtended) {
    try {
      const details = await getScreenDetails.call(window);
      const other = details.screens.find((s) => s !== details.currentScreen);
      if (other) {
        features = `popup,fullscreen,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
        otherScreen = true;
      }
    } catch {
      // Permission refused: open a normal window instead.
    }
  }
  const win = window.open(url, AUDIENCE_WINDOW, features);
  return { win, otherScreen: otherScreen && win !== null };
}
