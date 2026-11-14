import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { deckFonts } from '../core/external';
import type { Deck } from '../core/parse';
import { findFamily, getCatalogVersion, subscribeCatalog, type Family } from './catalog';

function nearestWeight(weights: number[], wanted: number): number {
  const first = weights[0];
  if (first === undefined) throw new Error('A font family must have at least one weight');
  return weights.reduce((best, weight) => {
    const distance = Math.abs(weight - wanted);
    const bestDistance = Math.abs(best - wanted);
    return distance < bestDistance || (distance === bestDistance && weight < best) ? weight : best;
  }, first);
}

function requestedWeights(weights: number[]): number[] {
  if (weights.length === 0) return [];
  const regular = nearestWeight(weights, 400);
  const requested = [regular];
  if (weights.includes(700) && regular !== 700) requested.push(700);
  return requested.sort((a, b) => a - b);
}

/** The Google Fonts stylesheet for the regular, bold and italic styles this family has. */
export function fontCssUrl(family: Family): string {
  const upright = requestedWeights(family.weights);
  const italic = requestedWeights(family.italicWeights);
  if (upright.length === 0 && italic.length === 0) {
    throw new Error('A font family must have at least one weight');
  }
  const name = encodeURIComponent(family.name).replace(/%20/g, '+');
  if (italic.length === 0) {
    return `https://fonts.googleapis.com/css2?family=${name}:wght@${upright.join(';')}&display=swap`;
  }
  const styles = [
    ...upright.map((weight) => `0,${weight}`),
    ...italic.map((weight) => `1,${weight}`),
  ];
  return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@${styles.join(';')}&display=swap`;
}

const linkReady = new WeakMap<HTMLLinkElement, Promise<void>>();

function waitForLink(link: HTMLLinkElement): Promise<void> {
  const known = linkReady.get(link);
  if (known) return known;
  if (link.sheet) return Promise.resolve();
  const waiting = new Promise<void>((resolve) => {
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
  });
  linkReady.set(link, waiting);
  return waiting;
}

function fontLink(name: string): HTMLLinkElement | undefined {
  const wanted = name.toLowerCase();
  return [...document.querySelectorAll<HTMLLinkElement>('link[data-uslides-font]')]
    .find((link) => link.dataset.uslidesFont?.toLowerCase() === wanted);
}

function addFontLink(family: Family): void {
  if (fontLink(family.name)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.crossOrigin = 'anonymous';
  link.href = fontCssUrl(family);
  link.dataset.uslidesFont = family.name;
  void waitForLink(link);
  document.head.append(link);
}

/**
 * Loads the catalog fonts a deck uses. The number it returns changes whenever slides must be drawn
 * again: after the browser finishes loading fonts, and when the font list arrives. A blocked deck
 * drawn before the list arrived treats a web font as a font on this device, and must be redrawn.
 */
export function useDeckFonts(deck: Deck | undefined, blocked: boolean): number {
  const [version, setVersion] = useState(0);
  const catalogVersion = useSyncExternalStore(subscribeCatalog, getCatalogVersion, getCatalogVersion);
  const families = useMemo(() => {
    const names = deck ? deckFonts(deck, findFamily) : [];
    return names.map((name) => findFamily(name)).filter((family): family is Family => family !== undefined);
  }, [deck, catalogVersion]);

  useEffect(() => {
    const fonts = document.fonts;
    const wanted = new Set(families.map((family) => family.name.toLowerCase()));
    const loaded = (event: Event) => {
      const fontfaces = (event as Event & { fontfaces?: Iterable<{ family: string }> }).fontfaces;
      if (!fontfaces) return;
      const includesDeckFamily = [...fontfaces].some((face) => {
        const family = face.family.trim().replace(/^(['"])(.*)\1$/, '$2').toLowerCase();
        return wanted.has(family);
      });
      if (includesDeckFamily) setVersion((current) => current + 1);
    };
    fonts?.addEventListener('loadingdone', loaded);
    if (!blocked) for (const family of families) addFontLink(family);
    return () => fonts?.removeEventListener('loadingdone', loaded);
  }, [blocked, families]);

  return version + catalogVersion;
}

/** Waits until the named fonts have settled, but never longer than the given limit. */
export async function waitForFonts(names: string[], ms = 3000): Promise<void> {
  const unique = [...new Map(names.map((name) => [name.toLowerCase(), name])).values()];
  if (unique.length === 0) return;

  const settled = (async () => {
    await Promise.all(unique.map((name) => {
      const link = fontLink(name);
      return link ? waitForLink(link) : Promise.resolve();
    }));
    if (!document.fonts) return;
    await Promise.allSettled(unique.map((name) => document.fonts.load(`1em "${name}"`)));
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  await Promise.race([settled, limit]);
  if (timer !== undefined) clearTimeout(timer);
}
