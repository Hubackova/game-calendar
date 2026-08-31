/**
 * Preklady verejne casti rozhrani. Jazyk bereme z prohlizece: cestina pro
 * `cs*`, jinak anglictina. Redakcni nastroje (Hrej, Gemini) zustavaji cesky —
 * jsou schovane za `EDITOR_TOOLS` a pouziva je jen redakce.
 */
const cs = {
  yearLabel: "Rok vydání",
  periodLabel: "Období vydání",
  noPeriod: "Nejočekávanější (bez období)",
  wholeYear: "celý rok",
  undated: "bez data (rok/kvartál)",
  calendar: "Kalendář",
  list: "Seznam",
  marksLabel: "Filtr podle značek",
  marksAll: "Vše",
  marksFav: "Jen ♥",
  marksBoth: "♥ + zajímá mě",
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
  yearLabel: "Release year",
  periodLabel: "Release period",
  noPeriod: "Most anticipated (no period)",
  wholeYear: "whole year",
  undated: "no exact date (year / quarter)",
  calendar: "Calendar",
  list: "List",
  marksLabel: "Filter by marks",
  marksAll: "All",
  marksFav: "♥ only",
  marksBoth: "♥ + interested",
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

const isCzech = navigator.language.toLowerCase().startsWith("cs");

export const locale = isCzech ? "cs-CZ" : "en-GB";
const dict = isCzech ? cs : en;

export const t = (key: keyof typeof cs) => dict[key];

/** Nazvy mesicu a dnu bereme z Intl, at nejsou dvakrat v prekladech. */
export const MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2021, index, 1)),
  ),
);

/** Pondeli az nedele. */
export const WEEKDAYS = Array.from({ length: 7 }, (_, index) =>
  new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
    // 2021-03-01 bylo pondeli.
    new Date(Date.UTC(2021, 2, 1 + index)),
  ),
);

/** Metriky prichazi ze serveru cesky; pro anglictinu je prelozime. */
export const metricLabel = (label: string) =>
  label === "IGDB návštěvy" ? t("metricVisits") : label;
