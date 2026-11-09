export type Route = {
  deckId?: string;
  /** 1-based slide number, present only on a present-mode URL. */
  present?: number;
};

/** Reads the open deck, and the slide when presenting, from the URL hash. Any other hash form (for example `#z=…`) gives an empty route. */
export function parseRoute(hash: string): Route {
  const m = /^#\/deck\/([^/]+)(?:\/present\/(\d+)(?:\/|$))?/.exec(hash);
  if (!m) return {};
  const route: Route = { deckId: decodeURIComponent(m[1]!) };
  if (m[2] !== undefined) route.present = Math.max(1, Number(m[2]));
  return route;
}

/** The URL of a deck, or of one of its slides in present mode when `present` (1-based) is given. */
export function deckHash(id: string, present?: number): string {
  const base = `#/deck/${encodeURIComponent(id)}`;
  return present === undefined ? base : `${base}/present/${present}`;
}
