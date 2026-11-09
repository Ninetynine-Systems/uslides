import { escapeForScript } from '../core/embed';
import type { Deck } from '../core/parse';
import { deckName } from '../core/settings';
import { STAGE } from '../config';
import { fitSlide } from '../render/fit';
import { renderSlide } from '../render/renderSlide';
import { deckFonts } from '../core/external';
import { findFamily } from '../fonts/catalog';
import { waitForFonts } from '../fonts/load';
import '../render/print.css';
import { packImages } from './packImages';

/** A file-name-safe version of a deck name: lower case, words joined by dashes. "deck" if nothing is left. */
export function fileSlug(name: string): string {
  const slug = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return slug === '' ? 'deck' : slug;
}

/** Saves a blob through the browser's download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Downloads the Markdown text as `<slug of name>.md`. */
export function downloadMarkdown(source: string, name: string): void {
  saveBlob(new Blob([source], { type: 'text/markdown;charset=utf-8' }), `${fileSlug(name)}.md`);
}

const htmlText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** No network at all: the file shows the deck, and an image that was not packed simply does not load. */
const CSP = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'";

/** The text of the single-file page: the deck source and the player script, nothing else. */
export function buildHtml(source: string, name: string, playerJs: string): string {
  // In JavaScript, `<\/script` means the same as `</script`, so the player needs no un-escaping.
  const player = playerJs.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<title>${htmlText(name)}</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;touch-action:none}#player{width:100vw;height:100vh;height:100dvh}</style>
</head>
<body>
<div id="player" role="region" aria-label="Slides"></div>
<script type="text/markdown" id="deck">${escapeForScript(source)}</script>
<script>${player}</script>
</body>
</html>
`;
}

export type ExportResult = { blob: Blob; failed: string[]; tooLarge: string[] };

/**
 * Builds the single-file `.html`. Images are packed into the source first, with the same lookup as Pack images.
 * Ones that cannot be packed stay as links and are listed in `failed`. The caller's text is not changed.
 */
export async function exportHtml(
  source: string,
  fetchImage: (src: string) => Promise<Blob | null>,
  fetchPlayer: () => Promise<string> = fetchPlayerScript,
): Promise<ExportResult> {
  const packed = await packImages(source, fetchImage);
  const html = buildHtml(packed.source, deckName(packed.source), await fetchPlayer());
  return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), failed: packed.failed, tooLarge: packed.tooLarge };
}

export class PlayerMissingError extends Error {
  constructor() {
    super('The offline player is missing. Reload the app and try again.');
    this.name = 'PlayerMissingError';
  }
}

/** The player script. The service worker keeps it cached, so this works offline. */
export async function fetchPlayerScript(): Promise<string> {
  const res = await fetch(`${import.meta.env.BASE_URL}player/player.js`);
  // A host that answers an unknown path with its home page (status 200) must not end up inside the export.
  if (!res.ok || !/javascript/i.test(res.headers.get('content-type') ?? '')) throw new PlayerMissingError();
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new PlayerMissingError();
  return text;
}

const IMAGE_WAIT_MS = 5000;

/**
 * Lays every slide out in a hidden container, one per page, and opens the print dialog.
 * The page size is the stage size, so the PDF has the deck's aspect ratio and no margins.
 */
export async function printDeck(
  deck: Deck,
  resolveImage: (src: string) => string | undefined = () => undefined,
  opts: { blockExternal?: boolean } = {},
): Promise<void> {
  if (!opts.blockExternal) await waitForFonts(deckFonts(deck).filter((name) => findFamily(name) !== undefined));
  const size = STAGE[deck.settings.aspect];
  const page = document.createElement('style');
  page.textContent = `@page { size: ${size.w}px ${size.h}px; margin: 0 }`;
  const container = document.createElement('div');
  container.className = 'us-print';
  document.head.append(page);
  document.body.append(container);
  for (const slide of deck.slides) {
    const stage = renderSlide(slide, deck.settings, { resolveImage, blockExternal: opts.blockExternal });
    container.append(stage);
    fitSlide(stage);
  }
  const loading = [...container.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined));
  await Promise.race([Promise.all(loading), new Promise((resolve) => setTimeout(resolve, IMAGE_WAIT_MS))]);

  const cleanup = () => {
    container.remove();
    page.remove();
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  try {
    window.print();
  } catch (err) {
    cleanup();
    throw err;
  }
}
