import { fencedLines } from './fences';
import type { SourceRange } from './types';

export type RawSlide = { text: string; range: SourceRange };

/**
 * Splits the deck body into slides at lines that are exactly `---`,
 * ignoring lines inside fenced code blocks. Ranges are offsets into `src`
 * and exclude the separator lines.
 */
export function splitSlides(src: string, bodyStart: number): RawSlide[] {
  const slides: RawSlide[] = [];
  const lines = src.slice(bodyStart).split('\n');
  const fenced = fencedLines(lines);
  let slideStart = bodyStart;
  let pos = bodyStart;

  for (const [i, line] of lines.entries()) {
    const next = pos + line.length + 1;
    if (!fenced[i] && line === '---') {
      if (i === 0 && bodyStart === 0) {
        // A leading `---` that is not a settings block is skipped.
        slideStart = next;
      } else {
        const to = pos > slideStart ? pos - 1 : slideStart;
        slides.push({ text: src.slice(slideStart, to), range: { from: slideStart, to } });
        slideStart = next;
      }
    }
    pos = next;
  }

  const from = Math.min(slideStart, src.length);
  slides.push({ text: src.slice(from), range: { from, to: src.length } });

  if (slides.length > 1 && slides[slides.length - 1]!.text.trim() === '') slides.pop();
  return slides;
}
