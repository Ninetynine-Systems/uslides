import type { Deck } from '../core/parse';
import { settingRange } from '../core/settings';
import type { Warning } from '../core/types';
import type { Family } from '../fonts/catalog';

const message = (name: string) =>
  `Unknown font "${name}". Pick one from the font menu, or check the spelling on fonts.google.com.`;

/** Warnings for valid font names that are not in the shipped catalog. */
export function fontWarnings(deck: Deck, find: (name: string) => Family | undefined): Warning[] {
  const warnings: Warning[] = [];
  const deckFont = deck.settings.font;
  if (deckFont && !find(deckFont)) {
    const range = settingRange(deck.source, 'font');
    if (range) warnings.push({ message: message(deckFont), range });
  }
  for (const slide of deck.slides) {
    for (const box of slide.boxes) {
      if (box.font && !find(box.font)) {
        warnings.push({
          message: message(box.font),
          range: box.fontRange ?? box.range,
          slideIndex: slide.index,
        });
      }
    }
  }
  return warnings;
}
