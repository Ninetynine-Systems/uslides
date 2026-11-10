import { expect, test } from 'vitest';
import { HINT_KEY, hintDone, markHintDone } from '../../src/app/edit/hint';

test('not done by default, done after marking', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
  expect(hintDone(storage)).toBe(false);
  markHintDone(storage);
  expect(store.get(HINT_KEY)).toBe('1');
  expect(hintDone(storage)).toBe(true);
});

test('storage that throws is treated as not done and does not throw', () => {
  const broken = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  };
  expect(hintDone(broken)).toBe(false);
  expect(() => markHintDone(broken)).not.toThrow();
});
