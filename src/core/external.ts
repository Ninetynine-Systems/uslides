import MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import type { Deck } from './parse';

const md = new MarkdownIt({ html: false });

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
  visit(md.parse(markdown, {}));
}

/** Sorted website names used by web images in the rendered deck. */
export function externalHosts(deck: Deck): string[] {
  const hosts = new Set<string>();
  for (const slide of deck.slides) {
    addImageHosts(slide.loose, hosts);
    for (const box of slide.boxes) addImageHosts(box.markdown, hosts);
  }
  return [...hosts].sort();
}
