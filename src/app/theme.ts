import { useCallback, useSyncExternalStore } from 'react';

export type AppTheme = 'light' | 'dark';

/** The user's own choice. Absent means "follow the device". Also read by the inline script in index.html. */
export const THEME_KEY = 'uslides.theme';

/** The browser bar colour for each theme. Matches --panel in app.css. */
const BAR_COLOUR: Record<AppTheme, string> = { light: '#ffffff', dark: '#17171e' };

const listeners = new Set<() => void>();

function savedTheme(): AppTheme | undefined {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : undefined;
  } catch {
    return undefined;
  }
}

function deviceTheme(): AppTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The theme in use: the saved choice, else the device's. */
export function currentTheme(): AppTheme {
  return savedTheme() ?? deviceTheme();
}

function apply(theme: AppTheme): void {
  const root = document.documentElement;
  // Colours change at once, not through each button's hover fade, so the screen never shows a mix of both themes.
  root.classList.add('us-theme-switching');
  root.dataset.theme = theme;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('us-theme-switching')));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOUR[theme]);
  listeners.forEach((listener) => listener());
}

/** Chooses a theme and remembers it in this browser. */
export function setTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The theme still changes for this page when storage is unavailable.
  }
  apply(theme);
}

/** Applies the theme at start-up and follows the device until the user makes a choice. */
export function startTheme(): void {
  apply(currentTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!savedTheme()) apply(deviceTheme());
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function shownTheme(): AppTheme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** The theme on screen, and a function that switches to the other one. */
export function useTheme(): { theme: AppTheme; toggle(): void } {
  const theme = useSyncExternalStore(subscribe, shownTheme);
  const toggle = useCallback(() => setTheme(shownTheme() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle };
}
