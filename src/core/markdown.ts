import MarkdownIt from 'markdown-it';
import type { StateBlock, StateCore, StateInline } from 'markdown-it';

export interface RenderOptions {
  /** Maps a relative image path to a loadable URL. Returns undefined when the image is not available. */
  resolveImage?: (src: string) => string | undefined;
}

interface RenderEnv {
  resolveImage?: (src: string) => string | undefined;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const DATA_IMAGE = /^data:image\/(png|jpeg|gif|webp|svg\+xml|avif)[;,]/i;

/** A relative path has no URL scheme and is not protocol-relative (`//host`, `/\host`). */
function isRelative(url: string): boolean {
  return !SCHEME.test(url) && !/^[/\\]{2}/.test(url) && !url.startsWith('\\');
}

function scheme(url: string): string {
  return (SCHEME.exec(url)?.[0] ?? '').toLowerCase();
}

function isAllowedLinkHref(url: string): boolean {
  return isRelative(url) || ['https:', 'http:', 'mailto:'].includes(scheme(url));
}

function isAllowedImageSrc(url: string): boolean {
  return isRelative(url) || ['https:', 'http:'].includes(scheme(url)) || DATA_IMAGE.test(url);
}


/** Inline `<!-- ... -->` produces no output. */
function commentInline(state: StateInline): boolean {
  const start = state.pos;
  if (!state.src.startsWith('<!--', start)) return false;
  const close = state.src.indexOf('-->', start + 4);
  if (close === -1) return false;
  state.pos = close + 3;
  return true;
}

/** A block starting with `<!--` and ending at `-->` (possibly many lines later) produces no output. */
function commentBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const at = (arr: number[], i: number) => arr[i] ?? 0;
  if (at(state.sCount, startLine) - state.blkIndent >= 4) return false;
  const pos = at(state.bMarks, startLine) + at(state.tShift, startLine);
  if (!state.src.startsWith('<!--', pos)) return false;
  const close = state.src.indexOf('-->', pos + 4);
  if (close === -1) return false;
  let line = startLine;
  while (line < endLine - 1 && at(state.eMarks, line) < close + 3) line++;
  if (at(state.eMarks, line) < close + 3) return false;
  // Text after the comment on its last line stays a normal paragraph.
  if (state.src.slice(close + 3, at(state.eMarks, line)).trim() !== '') return false;
  if (silent) return true;
  state.line = line + 1;
  return true;
}

const md = new MarkdownIt({ html: false, linkify: true });
// Accept everything at parse time so a bad link still parses as a link; the render step then
// drops it and keeps only its text (see us_links and the image rule).
md.validateLink = () => true;
md.linkify.set({ fuzzyEmail: false });
md.block.ruler.before('html_block', 'comment_block', commentBlock, { alt: ['paragraph', 'reference', 'blockquote'] });
md.inline.ruler.before('html_inline', 'comment_inline', commentInline);

// Mark links with a disallowed href so their tags are skipped; add target/rel to the rest.
md.core.ruler.push('us_links', (state: StateCore) => {
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue;
    let dropping = false;
    for (const tok of block.children) {
      if (tok.type === 'link_open') {
        dropping = !isAllowedLinkHref(String(tok.attrGet('href') ?? ''));
        if (dropping) {
          tok.meta = { drop: true };
        } else {
          tok.attrSet('target', '_blank');
          tok.attrSet('rel', 'noopener noreferrer');
        }
      } else if (tok.type === 'link_close' && dropping) {
        tok.meta = { drop: true };
        dropping = false;
      }
    }
  }
  return true;
});

for (const rule of ['link_open', 'link_close'] as const) {
  const original = md.renderer.rules[rule];
  md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
    if (tokens[idx]?.meta?.drop) return '';
    return original ? original(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
  };
}

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  if (!token) return '';
  const esc = md.utils.escapeHtml;
  const src = String(token.attrGet('src') ?? '');
  const alt = self.renderInlineAsText(token.children ?? [], options, env);

  // A disallowed image renders as its plain alt text.
  if (!isAllowedImageSrc(src)) return esc(alt);

  let finalSrc = src;
  const resolveImage = (env as RenderEnv).resolveImage;
  if (isRelative(src) && resolveImage) {
    const resolved = resolveImage(src);
    if (resolved === undefined) {
      return `<span class="us-missing" data-src="${esc(src)}">Image not found: ${esc(src)}</span>`;
    }
    if (!resolved.startsWith('blob:') && !isAllowedImageSrc(resolved)) {
      return `<span class="us-missing" data-src="${esc(src)}">Image not found: ${esc(src)}</span>`;
    }
    finalSrc = resolved;
  }

  const title = token.attrGet('title');
  const titleAttr = title ? ` title="${esc(String(title))}"` : '';
  return `<img src="${esc(finalSrc)}" alt="${esc(alt)}"${titleAttr}>`;
};

export function renderMarkdown(source: string, opts: RenderOptions = {}): string {
  const env: RenderEnv = { resolveImage: opts.resolveImage };
  return md.render(source, env as Record<string, unknown>);
}
