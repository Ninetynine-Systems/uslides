export const HINT_KEY = 'uslides.hint.drawBox.done';

export function hintDone(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    return (storage ?? localStorage).getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function markHintDone(storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? localStorage).setItem(HINT_KEY, '1');
  } catch {
    // The current page still hides the hint when browser storage is unavailable.
  }
}
