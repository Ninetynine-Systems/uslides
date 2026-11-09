import { type DeckSettings, normalizeSource, parseSettings } from './settings';
import { type Slide, parseSlide } from './slide';
import { splitSlides } from './split';
import type { Warning } from './types';

export type Deck = {
  /** The normalized source. Every range in the deck is an offset into this string. */
  source: string;
  settings: DeckSettings;
  slides: Slide[];
  /** Settings warnings first, then each slide's warnings in order. */
  warnings: Warning[];
};

export function parseDeck(rawSource: string): Deck {
  const source = normalizeSource(rawSource);
  const { settings, bodyStart, warnings } = parseSettings(source);
  const slides: Slide[] = [];
  const all = [...warnings];
  for (const [i, raw] of splitSlides(source, bodyStart).entries()) {
    const parsed = parseSlide(raw, i, settings);
    slides.push(parsed.slide);
    all.push(...parsed.warnings);
  }
  return { source, settings, slides, warnings: all };
}
