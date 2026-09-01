/**
 * Preklady verejne casti rozhrani. Jazyk bereme z prohlizece: cestina pro
 * `cs*`, jinak anglictina. Redakcni nastroje (Hrej, Gemini) zustavaji cesky —
 * jsou schovane za `EDITOR_TOOLS` a pouziva je jen redakce.
 */
const cs = {
  brand: "Herní kalendář",
  tagline: "chystané hry a data vydání",
  settings: "Nastavení",
  language: "Jazyk",
  mode: "Režim",
  modeLight: "Den",
  modeDark: "Noc",
  modeSystem: "Systém",
  yearLabel: "Rok vydání",
  periodLabel: "Období vydání",
  noPeriod: "kdykoliv",
  wholeYear: "celý rok",
  undated: "bez data (rok/kvartál)",
  calendar: "Kalendář",
  list: "Seznam",
  marksLabel: "Filtr podle značek",
  marksAll: "Vše",
  marksFav: "Jen oblíbené",
  marksBoth: "Oblíbené + zajímá mě",
  sortLabel: "Řadit podle",
  sortBy: "Řadit",
  followers: "IGDB sledujících",
  followersTitle: "Počet lidí, kteří hru na IGDB sledovali před vydáním",
  searchPlaceholder: "Hledat hru…",
  search: "Hledat",
  loading: "Načítám…",
  nothingFound: "Nic nenalezeno — zkus jiný název.",
  noMarked: "Žádné označené hry v tomto výpisu.",
  prevPage: "← Předchozí",
  nextPage: "Další →",
  pagerLabel: "Stránkování",
  genres: "Žánry",
  developer: "Vývojář",
  publisher: "Vydavatel",
  platforms: "Platformy",
  type: "Typ",
  status: "Stav",
  partOf: "Součást hry",
  released: "Vydání",
  ratings: "hodnocení",
  unknownDate: "datum neznámé",
  igdbPage: "Stránka na IGDB",
  close: "Zavřít",
  looseGames: "Bez konkrétního dne",
  addFav: "Přidat do oblíbených",
  removeFav: "Odebrat z oblíbených",
  addInterest: "Zajímá mě",
  removeInterest: "Už mě nezajímá",
  favOf: "Oblíbené",
  interestOf: "Zajímá mě",
  toDay: "Přepnout na denní režim",
  toNight: "Přepnout na noční režim",
  themeLabel: "Přepnout denní a noční režim",
  metricVisits: "IGDB návštěvy",
};

const en: typeof cs = {
  brand: "Games calendar",
  tagline: "upcoming games and release dates",
  settings: "Settings",
  language: "Language",
  mode: "Mode",
  modeLight: "Light",
  modeDark: "Dark",
  modeSystem: "System",
  yearLabel: "Release year",
  periodLabel: "Release period",
  noPeriod: "anytime",
  wholeYear: "whole year",
  undated: "no exact date (year / quarter)",
  calendar: "Calendar",
  list: "List",
  marksLabel: "Filter by marks",
  marksAll: "All",
  marksFav: "Favourites only",
  marksBoth: "Favourites + interested",
  sortLabel: "Sort by",
  sortBy: "Sort",
  followers: "IGDB followers",
  followersTitle: "How many people followed the game on IGDB before release",
  searchPlaceholder: "Search a game…",
  search: "Search",
  loading: "Loading…",
  nothingFound: "Nothing found — try another title.",
  noMarked: "No marked games in this listing.",
  prevPage: "← Previous",
  nextPage: "Next →",
  pagerLabel: "Pagination",
  genres: "Genres",
  developer: "Developer",
  publisher: "Publisher",
  platforms: "Platforms",
  type: "Type",
  status: "Status",
  partOf: "Part of",
  released: "Release",
  ratings: "ratings",
  unknownDate: "date unknown",
  igdbPage: "IGDB page",
  close: "Close",
  looseGames: "Without an exact day",
  addFav: "Add to favourites",
  removeFav: "Remove from favourites",
  addInterest: "Interested",
  removeInterest: "No longer interested",
  favOf: "Favourite",
  interestOf: "Interested",
  toDay: "Switch to light mode",
  toNight: "Switch to dark mode",
  themeLabel: "Switch light and dark mode",
  metricVisits: "IGDB visits",
};

export type Lang = "cs" | "en";

const STORAGE_KEY = "lang";
const dicts = { cs, en };

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "cs" || saved === "en") return saved;
  } catch {
    /* bez ulozene volby rozhoduje prohlizec */
  }
  return navigator.language.toLowerCase().startsWith("cs") ? "cs" : "en";
}

let lang: Lang = detect();

export const getLang = () => lang;

/**
 * Prepnuti jazyka nevyzaduje reload: `t()` cte aktualni slovnik a cely strom
 * je pod jednou komponentou, takze staci, aby si zavolala setState.
 */
export function setLang(next: Lang): void {
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* bez ulozeni vydrzi volba do reloadu */
  }
}

export const t = (key: keyof typeof cs) => dicts[lang][key];

const localeOf = (value: Lang) => (value === "cs" ? "cs-CZ" : "en-GB");

/** Formatovani datumu drzime tady, aby slo za aktualnim jazykem. */
export const formatDay = (date: Date) =>
  new Intl.DateTimeFormat(localeOf(lang), { dateStyle: "long" }).format(date);

export const formatMonthYear = (date: Date) =>
  new Intl.DateTimeFormat(localeOf(lang), {
    month: "long",
    year: "numeric",
  }).format(date);

/** Nazvy mesicu a dnu bereme z Intl, at nejsou dvakrat v prekladech. */
export const months = () =>
  Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(localeOf(lang), {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2021, index, 1))),
  );

/** Pondeli az nedele. */
export const weekdays = () =>
  Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(localeOf(lang), {
      weekday: "short",
      timeZone: "UTC",
    }).format(
      // 2021-03-01 bylo pondeli.
      new Date(Date.UTC(2021, 2, 1 + index)),
    ),
  );

/** Metriky prichazi ze serveru cesky; pro anglictinu je prelozime. */
export const metricLabel = (label: string) =>
  label === "IGDB návštěvy" ? t("metricVisits") : label;
