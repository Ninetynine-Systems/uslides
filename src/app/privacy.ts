import type { DeckRecord } from '../storage/db';

const ASK_FIRST_KEY = 'uslides.askBeforeExternal';

export function isBlocked(
  privacy: DeckRecord['privacy'],
  askFirst: boolean,
  allowedOnce: boolean,
): boolean {
  if (allowedOnce || privacy === 'allowed') return false;
  return privacy === 'blocked' || askFirst;
}

export function readAskFirst(): boolean {
  try {
    return localStorage.getItem(ASK_FIRST_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeAskFirst(on: boolean): void {
  try {
    localStorage.setItem(ASK_FIRST_KEY, on ? '1' : '0');
  } catch {
    // The setting stays unchanged when browser storage is unavailable.
  }
}
