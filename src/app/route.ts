export type Route = {
  deckId?: string;
  /** 1-based slide number, present only on a present-mode URL. */
  present?: number;
  /** True for the presenter view: notes and the next slide, while the audience sees the slides elsewhere. */
  presenter?: boolean;
};

/** Reads the open deck, and the slide when presenting, from the URL hash. Any other hash form (for example `#z=…`) gives an empty route. */
export function parseRoute(hash: string): Route {
  const m = /^#\/deck\/([^/]+)(?:\/(present|presenter)\/(\d+)(?:\/|$))?/.exec(hash);
  if (!m) return {};
  const route: Route = { deckId: decodeURIComponent(m[1]!) };
  if (m[3] !== undefined) {
    route.present = Math.max(1, Number(m[3]));
    if (m[2] === 'presenter') route.presenter = true;
  }
  return route;
}

/**
 * The URL of a deck, or of one of its slides in present mode when `present` (1-based) is given.
 * With `presenter`, the URL opens the presenter view instead.
 */
export function deckHash(id: string, present?: number, presenter = false): string {
  const base = `#/deck/${encodeURIComponent(id)}`;
  return present === undefined ? base : `${base}/${presenter ? 'presenter' : 'present'}/${present}`;
}
