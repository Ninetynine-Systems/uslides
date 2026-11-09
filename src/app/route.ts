export type Route = { deckId?: string };

/** Reads the open deck from the URL hash. Any other hash form (for example `#z=…`) gives an empty route. */
export function parseRoute(hash: string): Route {
  const m = /^#\/deck\/([^/]+)/.exec(hash);
  return m ? { deckId: decodeURIComponent(m[1]!) } : {};
}

export function deckHash(id: string): string {
  return `#/deck/${encodeURIComponent(id)}`;
}
