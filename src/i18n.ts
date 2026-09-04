/**
 * Preklady verejne casti rozhrani. Jazyk bereme z prohlizece: cestina pro
 * `cs*`, jinak anglictina. Redakcni nastroje (Hrej, Gemini) zustavaji cesky —
 * jsou schovane za `EDITOR_TOOLS` a pouziva je jen redakce.
 */
import { META, type Lang } from "./meta";

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
    "Přehled chystaných her podle data vydání. Data jsou z IGDB a řadí se podle toho, kolik lidí hru sleduje (v nastavení je více možností řazení).",
  introPeriod:
    "Vlevo v liště vybereš období — přehled všeho chystaného, hry bez data vydání, nebo konkrétní rok a měsíc. Hry je možné zobrazit v kalendáři nebo jako seznam. Ve výpisech jsou jen *nejsledovanější tituly*; jakoukoli další hru najdeš *přes hledání* a odtud si ji můžeš označit.",
  introMarks:
    "U každé hry jsou dvě značky, kterými si z výpisu sestavíš *vlastní kalendář*.",
  introFav: "*oblíbené* — hry, na které čekáš",
  introInterest: "*zajímá mě* — hry, které chceš mít v hledáčku",
  introFilter:
    "Filtrem v liště pak zobrazíš *jen označené hry* — a to i v kalendáři.",
  introMarkedDate:
    "Značit můžeš i hry, které *datum vydání ještě nemají*. Jakmile ho IGDB doplní, hra se ti *sama objeví v kalendáři* toho měsíce.",
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
  /* Stejny text jako ve staticke hlavicce, aby se nemohly rozejit. */
  metaDescription: META.cs.description,
  /** `{period}` vymeni obdobi vypisu, treba „Říjen 2026“. */
  metaDescriptionPeriod:
    "{period}: hry a data vydání. Označ si srdíčkem a žárovkou, co chceš hrát, a sestav si z výpisu vlastní kalendář. Data z IGDB.",
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
    "An overview of upcoming games by release date. The data comes from IGDB and is ranked by how many people follow each game (settings offer more sort orders).",
  introPeriod:
    "The picker on the left sets the period — everything upcoming, games without a release date, or a single year and month. The games can be shown as a calendar or as a list. The listings only hold the *most followed titles*; any other game you can find *through search* and mark it from there.",
  introMarks:
    "Every game has two marks, and with them you build your *own calendar* out of the listing.",
  introFav: "*favourites* — games you are waiting for",
  introInterest: "*interested* — games you want to keep an eye on",
  introFilter:
    "The filter in the toolbar then shows *just the marked games*, in the calendar too.",
  introMarkedDate:
    "You can mark games that *have no release date yet*. As soon as IGDB fills one in, the game *shows up in that month's calendar* on its own.",
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
  metaDescription: META.en.description,
  metaDescriptionPeriod:
    "{period}: games and release dates. Mark what you want to play and build your own calendar out of the listing. Data from IGDB.",
};

export type { Lang };

const STORAGE_KEY = "lang";
const dicts = { cs, en };

/**
 * O jazyku rozhoduje adresa, ne prohlizec: `/en/…` je anglicky, cokoli
 * jineho cesky. Kazda jazykova verze tak ma vlastni URL s vlastnim
 * canonical — bez toho by Googlebot (chodi s `en-US`) indexoval anglicky
 * obsah pod ceskou adresou.
 */
export function langFromPath(pathname: string): Lang {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "cs";
}

/** Ulozena volba. Prohlizec se nepta — z te se jen odvozuje presmerovani. */
export function savedLang(): Lang | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "cs" || saved === "en" ? saved : null;
  } catch {
    return null;
  }
}

let lang: Lang = langFromPath(window.location.pathname);

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

export const ogLocale = () => META[lang].ogLocale;

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
