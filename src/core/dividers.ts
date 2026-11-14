import { fencedLines } from './fences';
import { parseSettings } from './settings';

/** A `---` line that starts a new slide. */
export type SlideDivider = {
  /** Offset of the start of the `---` line. */
  pos: number;
  /** The 1-based number of the slide that starts after this line. */
  slide: number;
  /** That slide's first heading, or an empty string when it has none. */
  title: string;
};

const HEADING = /^#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/;

/**
 * Finds every `---` line that starts a new slide, using the same rules as the slide splitter: the
 * settings block at the top and lines inside fenced code blocks do not count.
 */
export function slideDividers(src: string): SlideDivider[] {
  const { bodyStart } = parseSettings(src);
  const lines = src.slice(bodyStart).split('\n');
  const fenced = fencedLines(lines);
  const dividers: SlideDivider[] = [];
  let current: SlideDivider | undefined;
  let slide = 1;
  let pos = bodyStart;

  for (const [i, line] of lines.entries()) {
    if (!fenced[i] && line === '---') {
      // A leading `---` that is not a settings block is skipped, as the splitter does.
      if (!(i === 0 && bodyStart === 0)) {
        current = { pos, slide: ++slide, title: '' };
        dividers.push(current);
      }
    } else if (current && current.title === '' && !fenced[i]) {
      const heading = HEADING.exec(line);
      if (heading?.[1]) current.title = heading[1];
    }
    pos += line.length + 1;
  }
  return dividers;
}
