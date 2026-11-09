/** True for a font name that is safe to put in CSS. */
export function isValidFontName(name: string): boolean {
  return name.length <= 60 && /^[A-Za-z0-9][A-Za-z0-9 ]*$/.test(name);
}
