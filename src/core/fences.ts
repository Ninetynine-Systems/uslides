/**
 * Finds fenced code blocks, following CommonMark: a fence opens with three or
 * more backticks or tildes, and closes with a line that has only the same
 * character, at least as many times as the opener, plus optional spaces.
 * An unclosed fence runs to the end of the text.
 *
 * Returns one flag per line. A line is flagged if it is the opening line, the
 * closing line, or anything between them.
 */
export function fencedLines(lines: readonly string[]): boolean[] {
  const result: boolean[] = [];
  let fence: { char: string; len: number } | null = null;
  for (const line of lines) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      result.push(true);
      if (m && m[1]!.charAt(0) === fence.char && m[1]!.length >= fence.len && /^ {0,3}[`~]+\s*$/.test(line)) {
        fence = null;
      }
    } else if (m) {
      fence = { char: m[1]!.charAt(0), len: m[1]!.length };
      result.push(true);
    } else {
      result.push(false);
    }
  }
  return result;
}
