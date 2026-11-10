/** Only full deck stylesheets belong in the small offline font CSS cache. */
export function isDeckFontStylesheet(url: URL): boolean {
  return url.hostname === 'fonts.googleapis.com' && !url.searchParams.has('text');
}

/** Google serves full family files from /s/ and text-only preview files from /l/. */
export function isDeckFontFile(url: URL): boolean {
  return url.hostname === 'fonts.gstatic.com' && url.pathname.startsWith('/s/');
}
