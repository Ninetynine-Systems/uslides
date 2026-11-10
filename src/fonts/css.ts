function singleQuoted(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Gives every face in a stylesheet the requested family name. */
export function setCssFamilyName(css: string, name: string): string {
  return css.replace(
    /font-family\s*:\s*(?:'[^']*'|"[^"]*"|[^;]+)\s*;/gi,
    `font-family: '${singleQuoted(name)}';`,
  );
}
