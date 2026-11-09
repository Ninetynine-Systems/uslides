const DISMISSED_KEY = 'uslides.safariNoteDismissed';

/** Asks the browser to keep this site's saved decks. Never throws; resolves to false if refused or unsupported. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

function isSafari(): boolean {
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/.test(ua);
}

/** True in Safari when the app is not installed and the note has not been dismissed. */
export function shouldShowSafariNote(): boolean {
  if (!isSafari()) return false;
  if (matchMedia('(display-mode: standalone)').matches) return false;
  try {
    return localStorage.getItem(DISMISSED_KEY) !== '1';
  } catch {
    return true;
  }
}

export function dismissSafariNote(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // Storage is blocked: the note may show again next visit.
  }
}

export const SAFARI_NOTE = 'Safari may delete saved decks after 7 days unless you install the app or download them';
