import type { Deck } from '../core/parse';
import type { Slide } from '../core/slide';
import type { SourceRange, Warning } from '../core/types';
import type { FitResult } from '../render/fit';

export const BOX_CUT_OFF = 'Text in this box is cut off. Shorten it or make the box bigger.';
export const SLIDE_CUT_OFF = 'Text on this slide is cut off. Shorten it or split the slide.';

/** The line that starts at `from`, without its newline. */
function lineAt(source: string, from: number): SourceRange {
  const nl = source.indexOf('\n', from);
  return { from, to: nl === -1 ? source.length : nl };
}

/** The slide's first non-blank line, or its start if it is empty. */
function firstLine(source: string, slide: Slide): SourceRange {
  const text = source.slice(slide.range.from, slide.range.to);
  const m = /\S/.exec(text);
  if (!m) return { from: slide.range.from, to: slide.range.from };
  const lineStart = text.lastIndexOf('\n', m.index) + 1;
  return lineAt(source, slide.range.from + lineStart);
}

/**
 * Editor warnings for text that is still cut off at the smallest font size.
 * `fits` holds fitSlide's results for each rendered slide; slides from an older parse are ignored.
 */
export function cutOffWarnings(deck: Deck, fits: ReadonlyMap<Slide, FitResult[]>): Warning[] {
  const warnings: Warning[] = [];
  for (const slide of deck.slides) {
    for (const r of fits.get(slide) ?? []) {
      if (!r.overflow) continue;
      const box = r.boxIndex === null ? undefined : slide.boxes[r.boxIndex];
      if (box) {
        warnings.push({ message: BOX_CUT_OFF, range: lineAt(deck.source, box.range.from), slideIndex: slide.index });
      } else if (r.boxIndex === null) {
        warnings.push({ message: SLIDE_CUT_OFF, range: firstLine(deck.source, slide), slideIndex: slide.index });
      }
    }
  }
  return warnings;
}
