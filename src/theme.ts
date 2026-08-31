/**
 * Rezim zobrazeni. `null` znamena „podle systemu“ — dokud si clovek nevybere,
 * rozhoduje `prefers-color-scheme` v CSS a na <html> zadny atribut nedavame.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

export function loadTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme | null): void {
  const root = document.documentElement;
  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;

  try {
    if (theme) localStorage.setItem(STORAGE_KEY, theme);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* bez ukladani rezim vydrzi jen do reloadu */
  }
}

/** Co je zrovna videt — pro prepinac, ktery ma nabidnout ten druhy rezim. */
export function currentTheme(theme: Theme | null): Theme {
  if (theme) return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
