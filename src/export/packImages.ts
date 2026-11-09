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

/**
 * Rewrites every web or relative image source in the Markdown to a `data:` URI, so the deck is one
 * self-contained file. Images in code fences, existing `data:` images and other schemes are left alone.
 * An image that cannot be fetched, or is not a type the renderer allows, keeps its text and is listed in `failed`.
 */
export async function packImages(
  source: string,
  fetchImage: (src: string) => Promise<Blob | null>,
): Promise<{ source: string; failed: string[] }> {
  const lines = source.split('\n');
  const fenced = fencedLines(lines);
  const found: Array<{ line: number; start: number; end: number; src: string }> = [];
  lines.forEach((text, line) => {
    if (fenced[line]) return;
    for (const m of text.matchAll(IMAGE)) {
      let src = m[2]!;
      if (src.startsWith('<')) src = src.slice(1, -1);
      if (!isPackable(src)) continue;
      const start = m.index + m[1]!.length;
      found.push({ line, start, end: start + m[2]!.length, src });
    }
  });

  const results = new Map<string, Promise<string | null>>();
  const load = (src: string): Promise<string | null> => {
    let p = results.get(src);
    if (!p) {
      p = (async () => {
        try {
          const blob = await fetchImage(src);
          if (!blob || !isEmbeddableType(blob.type)) return null;
          return await blobToDataUri(blob);
        } catch {
          return null;
        }
      })();
      results.set(src, p);
    }
    return p;
  };

  const failed: string[] = [];
  const uris = await Promise.all(found.map((f) => load(f.src)));
  // Replace right to left within each line so earlier offsets stay valid.
  for (let i = found.length - 1; i >= 0; i--) {
    const f = found[i]!;
    const uri = uris[i];
    if (uri === null || uri === undefined) {
      if (!failed.includes(f.src)) failed.unshift(f.src);
      continue;
    }
    const text = lines[f.line]!;
    lines[f.line] = text.slice(0, f.start) + uri + text.slice(f.end);
  }
  // `failed` was built back to front; keep it in document order.
  const order = new Map(found.map((f, i) => [f.src, i] as const));
  failed.sort((a, b) => order.get(a)! - order.get(b)!);
  return { source: lines.join('\n'), failed };
}
