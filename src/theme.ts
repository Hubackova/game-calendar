/** Rezim zobrazeni. Bez ulozene volby plati DEFAULT_THEME, tedy noc. */
export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

/** Bez vlastni volby jedeme noc — kalendar se vetsinou proklika vecer. */
export const DEFAULT_THEME: Theme = "dark";

export function loadTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* bez ukladani rezim vydrzi jen do reloadu */
  }
}
