import type { Token } from 'markdown-it';
import { findFamily } from '../fonts/catalog';
import { parseMarkdownTokens } from './markdown';
import type { Deck } from './parse';

type FontMatch = boolean | { name: string } | undefined;
type FontLookup = (name: string) => FontMatch;

function addImageHosts(markdown: string, hosts: Set<string>): void {
  const visit = (tokens: Token[]) => {
    for (const token of tokens) {
      if (token.type === 'image') {
        const src = String(token.attrGet('src') ?? '');
        try {
          const url = new URL(src);
          if (url.protocol === 'http:' || url.protocol === 'https:') hosts.add(url.hostname);
        } catch {
          // Relative and invalid image addresses do not name another website.
        }
      }
      if (token.children) visit(token.children);
    }
  };
  visit(parseMarkdownTokens(markdown));
}

function fontNames(deck: Deck): string[] {
  const names: string[] = [];
  if (deck.settings.font) names.push(deck.settings.font);
  for (const slide of deck.slides) {
    for (const box of slide.boxes) if (box.font) names.push(box.font);
  }
  return names;
}

/** Font names used by the deck, once each; catalog-known names use catalog spelling. */
export function deckFonts(deck: Deck): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const name of fontNames(deck)) {
    const canonical = findFamily(name)?.name ?? name;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(canonical);
  }
  return found;
}

/** Sorted website names used by web images and catalog-known fonts in the rendered deck. */
export function externalHosts(deck: Deck, isKnownFont: FontLookup = findFamily): string[] {
  const hosts = new Set<string>();
  for (const slide of deck.slides) {
    addImageHosts(slide.loose, hosts);
    for (const box of slide.boxes) addImageHosts(box.markdown, hosts);
  }
  if (deckFonts(deck).some((name) => Boolean(isKnownFont(name)))) {
    hosts.add('fonts.googleapis.com');
    hosts.add('fonts.gstatic.com');
  }
  return [...hosts].sort();
}
