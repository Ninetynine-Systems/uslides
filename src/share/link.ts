import { APP_ORIGIN } from '../config';

/** Links longer than this may be cut off by chat apps, so the app suggests downloading the file instead. */
export const LONG_LINK_CHARS = 8000;

/** The most text a link may hold once unpacked. Stops a tiny crafted link from inflating to gigabytes. */
export const MAX_DECK_BYTES = 10 * 1024 * 1024;

const TOO_LARGE = 'This link is too large to open';

/** The link is damaged or incomplete and cannot be turned back into a deck. */
export class ShareLinkError extends Error {
  constructor(message = 'This link is damaged or incomplete') {
    super(message);
    this.name = 'ShareLinkError';
  }
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Inflates `bytes`, stopping with a ShareLinkError as soon as the output passes MAX_DECK_BYTES. */
async function inflateLimited(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_DECK_BYTES) {
      void reader.cancel().catch(() => {});
      throw new ShareLinkError(TOO_LARGE);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new ShareLinkError();
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Builds a link that holds the whole deck: `#z=` is compressed, `#md=` is plain percent-encoded text. */
export async function makeShareLink(source: string, mode: 'z' | 'md'): Promise<string> {
  if (mode === 'md') return `${APP_ORIGIN}/#md=${encodeURIComponent(source)}`;
  const packed = await pipe(new TextEncoder().encode(source), new CompressionStream('deflate-raw'));
  return `${APP_ORIGIN}/#z=${toBase64Url(packed)}`;
}

/** Reads the Markdown out of a `#z=` or `#md=` hash (the leading `#` is optional). Returns null for any other hash. */
export async function readShareHash(hash: string): Promise<string | null> {
  const m = /^#?(z|md)=(.*)$/s.exec(hash);
  if (!m) return null;
  const payload = m[2]!;
  if (payload === '') throw new ShareLinkError();
  try {
    if (m[1] === 'md') {
      const text = decodeURIComponent(payload);
      if (new TextEncoder().encode(text).length > MAX_DECK_BYTES) throw new ShareLinkError(TOO_LARGE);
      return text;
    }
    const bytes = await inflateLimited(fromBase64Url(payload));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (err) {
    throw err instanceof ShareLinkError ? err : new ShareLinkError();
  }
}
