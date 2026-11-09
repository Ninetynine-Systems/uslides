import type { SourceRange } from './types';

export type RawSlide = { text: string; range: SourceRange };

/**
 * Splits the deck body into slides at lines that are exactly `---`,
 * ignoring lines inside fenced code blocks. Ranges are offsets into `src`
 * and exclude the separator lines.
 */
export function splitSlides(src: string, bodyStart: number): RawSlide[] {
  const slides: RawSlide[] = [];
  let pos = bodyStart;
  let slideStart = bodyStart;
  let fence: { char: string; len: number } | null = null;
  let first = true;

  while (pos <= src.length) {
    const nl = src.indexOf('\n', pos);
    const end = nl === -1 ? src.length : nl;
    const line = src.slice(pos, end);
    const next = nl === -1 ? src.length + 1 : nl + 1;

    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && f[1]!.charAt(0) === fence.char && f[1]!.length >= fence.len && /^ {0,3}[`~]+\s*$/.test(line)) {
        fence = null;
      }
    } else if (f) {
      fence = { char: f[1]!.charAt(0), len: f[1]!.length };
    } else if (line === '---') {
      if (first && bodyStart === 0 && pos === 0) {
        // A leading `---` that is not a settings block is skipped.
        slideStart = next;
      } else {
        const to = pos > slideStart ? pos - 1 : slideStart;
        slides.push({ text: src.slice(slideStart, to), range: { from: slideStart, to } });
        slideStart = next;
      }
    }
    first = false;
    pos = next;
  }

  const from = Math.min(slideStart, src.length);
  slides.push({ text: src.slice(from), range: { from, to: src.length } });

  if (slides.length > 1 && slides[slides.length - 1]!.text.trim() === '') slides.pop();
  return slides;
}
