import { fencedLines } from '../core/fences';

/** Image types the renderer accepts in a `data:` URI (see `DATA_IMAGE` in `src/core/markdown.ts`). */
export const EMBEDDABLE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'];

/** The media type without parameters, lower-cased: `image/SVG+xml; charset=utf-8` becomes `image/svg+xml`. */
export function baseType(type: string): string {
  return (type.split(';')[0] ?? '').trim().toLowerCase();
}

export function isEmbeddableType(type: string): boolean {
  return EMBEDDABLE_TYPES.includes(baseType(type));
}

/** Base64 text of the bytes. Built in chunks, so a large image does not overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

/** `data:<type>;base64,…` for a blob. Works in the browser and in Node. */
export async function blobToDataUri(blob: Blob, type = baseType(blob.type)): Promise<string> {
  return `data:${type};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
}

/** Decoded size of a `data:` URI in KB, rounded, never less than 1. */
export function dataUriKb(uri: string): number {
  const comma = uri.indexOf(',');
  const head = comma < 0 ? uri : uri.slice(0, comma);
  const payload = comma < 0 ? 0 : uri.length - comma - 1;
  const bytes = /;base64$/i.test(head) ? (payload * 3) / 4 : payload;
  return Math.max(1, Math.round(bytes / 1024));
}

/** `![alt](src "title")`, with an optional `<…>` around the src. Groups: 1 = `![alt](`, 2 = src, 3 = rest. */
const IMAGE = /(!\[[^\]]*\]\(\s*)(<[^>\n]*>|[^)\s]+)([^)\n]*\))/g;

/** True for sources that should be embedded: web URLs and relative paths. */
function isPackable(src: string): boolean {
  if (src === '' || src.startsWith('#')) return false;
  if (/^https?:\/\//i.test(src)) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('//');
}

/** Replaces inline code spans (`like this`) with spaces of the same length, so offsets stay valid. */
function maskInlineCode(line: string): string {
  return line.replace(/(`+)(.+?)(?<!`)\1(?!`)/g, (m) => ' '.repeat(m.length));
}

export const MAX_PACK_BYTES = 5 * 1024 * 1024;
export const MAX_PACK_FETCHES = 4;

/**
 * Rewrites every web or relative image source in the Markdown to a `data:` URI, so the deck is one
 * self-contained file. Images in code fences or inline code, existing `data:` images and other schemes are left alone.
 * An image that cannot be fetched, is not a type the renderer allows, or is over `maxBytes` keeps its text and is
 * listed in `failed`; the ones that were too large are also in `tooLarge`. At most `concurrency` fetches run at once.
 */
export async function packImages(
  source: string,
  fetchImage: (src: string) => Promise<Blob | null>,
  options: { maxBytes?: number; concurrency?: number } = {},
): Promise<{ source: string; failed: string[]; tooLarge: string[] }> {
  const maxBytes = options.maxBytes ?? MAX_PACK_BYTES;
  const concurrency = Math.max(1, options.concurrency ?? MAX_PACK_FETCHES);
  const lines = source.split('\n');
  const fenced = fencedLines(lines);
  const found: Array<{ line: number; start: number; end: number; src: string }> = [];
  lines.forEach((text, line) => {
    if (fenced[line]) return;
    for (const m of maskInlineCode(text).matchAll(IMAGE)) {
      let src = m[2]!;
      if (src.startsWith('<')) src = src.slice(1, -1);
      if (!isPackable(src)) continue;
      const start = m.index + m[1]!.length;
      found.push({ line, start, end: start + m[2]!.length, src });
    }
  });

  // One result per distinct src, fetched by a small pool of workers.
  const srcs = [...new Set(found.map((f) => f.src))];
  const results = new Map<string, string | 'large' | null>();
  let next = 0;
  const worker = async () => {
    while (next < srcs.length) {
      const src = srcs[next++]!;
      try {
        const blob = await fetchImage(src);
        if (!blob || !isEmbeddableType(blob.type)) results.set(src, null);
        else if (blob.size > maxBytes) results.set(src, 'large');
        else results.set(src, await blobToDataUri(blob));
      } catch {
        results.set(src, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, srcs.length) }, worker));

  const failed = srcs.filter((src) => results.get(src) === null || results.get(src) === 'large');
  const tooLarge = srcs.filter((src) => results.get(src) === 'large');
  // Replace right to left within each line so earlier offsets stay valid.
  for (let i = found.length - 1; i >= 0; i--) {
    const f = found[i]!;
    const uri = results.get(f.src);
    if (uri === null || uri === 'large' || uri === undefined) continue;
    const text = lines[f.line]!;
    lines[f.line] = text.slice(0, f.start) + uri + text.slice(f.end);
  }
  return { source: lines.join('\n'), failed, tooLarge };
}
