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
  howItWorks: "Jak to funguje",
  introTitle: "Jak to funguje",
  introWhat:
    "Přehled chystaných her podle data vydání. Data jsou z IGDB a řadí se podle toho, kolik lidí hru sleduje.",
  introPeriod:
    "V prvním výběru zvolíš rozsah — vše, hry bez přesného data, nebo konkrétní rok; ve druhém pak celý rok či měsíc. Zobrazit to jde jako kalendář nebo jako seznam.",
  introMarks: "U každé hry jsou dvě značky, které si můžeš uložit:",
  introFav: "oblíbené — hry, na které čekáš",
  introInterest: "zajímá mě — hry, které chceš mít v hledáčku",
  introOneMark:
    "Hra má vždy jen jednu značku, druhá tu první přepíše. Filtrem v liště pak zobrazíš jen značené hry — a to i v kalendáři.",
  introSettings:
    "V nastavení (⚙) si přepneš jazyk a taky řazení výpisu — podle sledujících na IGDB, nebo podle Steam wishlistu.",
  introStorage:
    "Značky se ukládají jen v tomto prohlížeči, nikam se neodesílají. Na jiném zařízení je proto neuvidíš a smazání dat prohlížeče je odstraní.",
  introClose: "Rozumím",
  periodLabel: "Období vydání",
  /** Skupina pruresu napric roky — kontext nese hlavicka, ne popisek. */
  overviews: "Přehledy",
  yearsLabel: "Rok",
  noPeriod: "vše (s datem vydání)",
  undatedAll: "vše (bez data vydání)",
  wholeYear: "celý rok",
  /** Uvnitr skupiny roku; ktery rok to je, rika hlavicka skupiny. */
  undated: "bez data vydání",
  calendar: "Kalendář",
  list: "Seznam",
  marksLabel: "Filtr podle značek",
  marksAll: "Vše",
  marksFav: "Jen oblíbené",
  marksBoth: "Oblíbené + zajímá mě",
  sortLabel: "Řadit podle",
  sortDate: "Data vydání",
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
  metaDescription:
    "Přehled chystaných her podle data vydání. Nejočekávanější tituly po měsících i v celoročním kalendáři, s vývojáři, platformami a popisem. Data z IGDB.",
  /** `{period}` vymeni obdobi vypisu, treba „Říjen 2026“. */
  metaDescriptionPeriod:
    "{period}: hry a data vydání. Přehled chystaných titulů s vývojáři, platformami a popisem. Data z IGDB.",
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
  howItWorks: "How it works",
  introTitle: "How it works",
  introWhat:
    "An overview of upcoming games by release date. The data comes from IGDB and is ranked by how many people follow each game.",
  introPeriod:
    "The first dropdown sets the range — everything, games without an exact date, or a single year; the second one picks the whole year or a month. You can view it as a calendar or as a list.",
  introMarks: "Every game has two marks you can save:",
  introFav: "favourites — games you are waiting for",
  introInterest: "interested — games you want to keep an eye on",
  introOneMark:
    "A game only ever has one mark; the second one replaces the first. The filter in the toolbar then shows just the marked games, in the calendar too.",
  introSettings:
    "Settings (⚙) let you switch the language and the sort order — by IGDB followers or by Steam wishlist.",
  introStorage:
    "Marks are stored in this browser only and never sent anywhere. You will not see them on another device, and clearing browser data removes them.",
  introClose: "Got it",
  periodLabel: "Release period",
  overviews: "Overviews",
  yearsLabel: "Year",
  noPeriod: "all (with release date)",
  undatedAll: "all (without release date)",
  wholeYear: "whole year",
  undated: "without release date",
  calendar: "Calendar",
  list: "List",
  marksLabel: "Filter by marks",
  marksAll: "All",
  marksFav: "Favourites only",
  marksBoth: "Favourites + interested",
  sortLabel: "Sort by",
  sortDate: "Release date",
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
  metaDescription:
    "An overview of upcoming games by release date. The most anticipated titles by month and in a full-year calendar, with developers, platforms and descriptions. Data from IGDB.",
  metaDescriptionPeriod:
    "{period}: games and release dates. Upcoming titles with developers, platforms and descriptions. Data from IGDB.",
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

/** Open Graph chce podtrzitko, ne pomlcku — `cs_CZ`, `en_GB`. */
export const ogLocale = () => localeOf(lang).replace("-", "_");

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
