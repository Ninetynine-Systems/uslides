import { findFamily, loadCatalog, type Family } from './catalog';
import { setCssFamilyName } from './css';
import { fontCssUrl } from './load';

export type EmbeddedFonts = { css: string; failed: string[] };

type FontFace = { css: string; subset?: string };

const FONT_FACE = /@font-face\s*\{[^}]*\}/g;
const FONT_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

function fontFaces(css: string): FontFace[] {
  return [...css.matchAll(FONT_FACE)].map((match) => {
    const before = css.slice(0, match.index);
    const comment = before.match(/\/\*\s*([^*]+?)\s*\*\/\s*$/);
    return { css: match[0], subset: comment?.[1]?.trim().toLowerCase() };
  });
}

function wantedFaces(css: string): string[] {
  const faces = fontFaces(css);
  const hasSubsetComments = faces.some((face) => face.subset !== undefined);
  return faces
    .filter((face) => !hasSubsetComments || face.subset === 'latin')
    .map((face) => face.css);
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let at = 0; at < bytes.length; at += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(at, at + chunkSize));
  }
  return btoa(binary);
}

async function embedFamily(
  family: Family,
  fetchText: (url: string) => Promise<string | null>,
  fetchBytes: (url: string) => Promise<Blob | null>,
): Promise<string | null> {
  try {
    const stylesheet = await fetchText(fontCssUrl(family));
    if (stylesheet === null) return null;
    const faces = wantedFaces(stylesheet)
      .filter((face) => !face.includes('<'))
      .map((face) => setCssFamilyName(face, family.name));
    if (faces.length === 0) return null;
    const faceUrls = faces.map((face) => [...face.matchAll(FONT_URL)].map((match) => match[2]!));
    if (faceUrls.some((urls) => urls.length === 0)) return null;
    const urls = [...new Set(faceUrls.flat())];
    const trusted = urls.every((url) => {
      try {
        return new URL(url).origin === 'https://fonts.gstatic.com';
      } catch {
        return false;
      }
    });
    if (!trusted) return null;
    const files = new Map<string, string>();
    const loaded = await Promise.all(urls.map(async (url) => {
      const blob = await fetchBytes(url);
      if (blob === null) return false;
      files.set(url, base64(new Uint8Array(await blob.arrayBuffer())));
      return true;
    }));
    if (loaded.includes(false)) return null;
    return faces.map((face) => face.replace(FONT_URL, (_whole, quote: string, url: string) => {
      const encoded = files.get(url);
      return `url(${quote}data:font/woff2;base64,${encoded}${quote})`;
    })).join('\n');
  } catch {
    return null;
  }
}

/** Fetches catalog-known Google fonts and returns self-contained CSS for a downloaded deck. */
export async function embedFonts(
  names: string[],
  fetchText: (url: string) => Promise<string | null>,
  fetchBytes: (url: string) => Promise<Blob | null>,
): Promise<EmbeddedFonts> {
  await loadCatalog();
  const families = [...new Map(names.flatMap((name) => {
    const family = findFamily(name);
    return family ? [[family.name.toLowerCase(), family] as const] : [];
  })).values()];
  const embedded = await Promise.all(families.map((family) => embedFamily(family, fetchText, fetchBytes)));
  const css = embedded.filter((value): value is string => value !== null);
  const failed = families.filter((_family, index) => embedded[index] === null).map((family) => family.name);
  return { css: css.join('\n'), failed };
}
