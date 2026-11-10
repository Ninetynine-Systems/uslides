import MarkdownIt from 'markdown-it';
import type { StateBlock, StateCore, StateInline, Token } from 'markdown-it';

export interface RenderOptions {
  /** Maps a relative image path to a loadable URL. Returns undefined when the image is not available. */
  resolveImage?: (src: string) => string | undefined;
  /** Adds the source line to rendered top-level block openings. */
  sourceLines?: boolean;
  /** Replaces web images with text placeholders without requesting them. */
  blockExternal?: boolean;
}

interface RenderEnv {
  resolveImage?: (src: string) => string | undefined;
  sourceLines?: boolean;
  blockExternal?: boolean;
  /** Source lines after real Markdown line-break tokens, filled only by the marking pass. */
  captureBreakLines?: number[];
  captureBreakFrom?: number;
  captureBreakLine?: number;
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
md.inline.ruler.before('newline', 'us_capture_break_lines', (state: StateInline, silent: boolean) => {
  const lines = (state.env as RenderEnv).captureBreakLines;
  if (silent || !lines || state.src.charCodeAt(state.pos) !== 0x0a) return false;
  const env = state.env as RenderEnv;
  let nextLine = env.captureBreakLine ?? 0;
  for (let i = env.captureBreakFrom ?? 0; i <= state.pos; i++) {
    if (state.src.charCodeAt(i) === 0x0a) nextLine++;
  }
  env.captureBreakFrom = state.pos + 1;
  env.captureBreakLine = nextLine;
  lines.push(nextLine);
  return false; // markdown-it's own newline rule still creates the softbreak or hardbreak token.
});

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

md.core.ruler.push('us_source_lines', (state: StateCore) => {
  if (!(state.env as RenderEnv).sourceLines) return true;
  for (const token of state.tokens) {
    if (token.block && token.nesting !== -1 && token.map) {
      token.attrSet('data-line', String(token.map[0]));
    }
    if (token.type !== 'inline' || !token.children || !token.map) continue;
    if (!token.children.some((child) => child.type === 'softbreak' || child.type === 'hardbreak')) continue;
    const breakLines: number[] = [];
    md.inline.parse(token.content, md, { ...state.env, captureBreakLines: breakLines }, []);
    let line = token.map[0];
    let breakIndex = 0;
    for (const child of token.children) {
      if (child.type === 'softbreak' || child.type === 'hardbreak') {
        line = token.map[0] + (breakLines[breakIndex++] ?? 1);
        continue;
      }
      if (child.type === 'text' || child.type === 'code_inline') {
        child.meta = { ...(child.meta ?? {}), sourceLine: line };
      }
    }
  }
  return true;
});

for (const rule of ['text', 'code_inline'] as const) {
  const original = md.renderer.rules[rule];
  md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const rendered = original ? original(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    const line = token?.meta?.sourceLine;
    if (!(env as RenderEnv).sourceLines || typeof line !== 'number') return rendered;
    return `<span data-line="${line}">${rendered}</span>`;
  };
}

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

  if ((env as RenderEnv).blockExternal && ['https:', 'http:'].includes(scheme(src))) {
    const label = alt || 'Image';
    return `<span class="us-blocked" role="img" aria-label="${esc(label)}">${esc(label)}</span>`;
  }

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

/** Parses Markdown with the same safety and comment rules used by the renderer. */
export function parseMarkdownTokens(source: string): Token[] {
  return md.parse(source, {});
}

export function renderMarkdown(source: string, opts: RenderOptions = {}): string {
  const env: RenderEnv = {
    resolveImage: opts.resolveImage,
    sourceLines: opts.sourceLines,
    blockExternal: opts.blockExternal,
  };
  return md.render(source, env as Record<string, unknown>);
}
