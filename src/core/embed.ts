/**
 * Putting Markdown inside an HTML `<script>` element needs care: the browser ends the element at the first
 * `</script`, and `<!--` followed by `<script` hides the real end. These two functions add a backslash right after
 * the `<` of each such sequence, and take it away again, so the text comes back exactly as it went in.
 * A sequence that already has backslashes (`<\/script`) gets one more, so it also round-trips.
 */
const RISKY = /<(\\*)(\/script|script|!--)/gi;
const ESCAPED = /<\\(\\*)(\/script|script|!--)/gi;

export function escapeForScript(text: string): string {
  return text.replace(RISKY, (_m, slashes: string, rest: string) => `<\\${slashes}${rest}`);
}

export function unescapeFromScript(text: string): string {
  return text.replace(ESCAPED, (_m, slashes: string, rest: string) => `<${slashes}${rest}`);
}
