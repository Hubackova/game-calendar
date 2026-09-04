/**
 * Stav vypisu v adrese. Bez toho ma cela aplikace jednu jedinou URL: odkaz na
 * „rijen 2026“ nejde poslat dal, tlacitko zpet nefunguje a statistiky ukazou
 * jen jeden pageview na cely web.
 */

import { LANG_PREFIX, type Lang } from "./meta.ts";

/** Co je zrovna vypsane — kazdy stav ma vlastni dotaz na /api/games. */
export type View =
  | { kind: "upcoming" }
  | { kind: "search"; term: string }
  | { kind: "month"; year: number; month: number }
  | { kind: "year"; year: number }
  /** Hry, u kterych IGDB zna jen rok, kvartal nebo nic; `null` = vsechny roky. */
  | { kind: "undated"; year: number | null };

/** Rok vypisu, nebo `null` — tehdy je v selectu „vše“ / „bez data“. */
export function viewYear(view: View): number | null {
  if (view.kind === "month" || view.kind === "year") return view.year;
  if (view.kind === "undated") return view.year;
  return null;
}

export const CURRENT_YEAR = new Date().getFullYear();
export const CURRENT_MONTH = new Date().getMonth() + 1;

/**
 * Nazvy a hodnoty parametru v jazyce stranky — adresa je videt a ma byt
 * citelna tomu, kdo ji cte. Anglicka verze proto nema `?rok=2027&mesic=3`.
 *
 * Ceska sada se nesmi menit: ty adresy uz ma Google zaindexovane.
 */
type Vocab = Record<
  | "year"
  | "month"
  | "period"
  | "search"
  | "layout"
  | "undated"
  | "wholeYear"
  | "anytime"
  | "list",
  string
>;

const VOCAB: Record<Lang, Vocab> = {
  cs: {
    year: "rok",
    month: "mesic",
    period: "obdobi",
    search: "hledat",
    layout: "pohled",
    undated: "bez-data",
    wholeYear: "rok",
    anytime: "kdykoliv",
    list: "seznam",
  },
  en: {
    year: "year",
    month: "month",
    period: "period",
    search: "q",
    layout: "view",
    undated: "undated",
    wholeYear: "year",
    anytime: "anytime",
    list: "list",
  },
};

const otherLang = (lang: Lang): Lang => (lang === "cs" ? "en" : "cs");

export type UrlState = { view: View; asCalendar: boolean };

/**
 * Adresa vypisu ve zvolenem jazyce. O jazyku rozhoduje cesta (viz
 * `langFromPath`), takze prefix patri do kazdeho odkazu i canonicalu.
 */
export const localizedUrl = (view: View, asCalendar: boolean, lang: Lang) =>
  LANG_PREFIX[lang] + urlFor(view, asCalendar, lang);

/** Co uvidi clovek, ktery prijde na „/“ — kalendar aktualniho mesice. */
const defaultView = (): View => ({
  kind: "month",
  year: CURRENT_YEAR,
  month: CURRENT_MONTH,
});

const isDefault = (view: View, asCalendar: boolean) =>
  asCalendar &&
  view.kind === "month" &&
  view.year === CURRENT_YEAR &&
  view.month === CURRENT_MONTH;

/**
 * Cteni je zamerne tolerantni: co adresa nedava, doplni vychozi stav. Rucne
 * zkraceny odkaz (`?rok=2026`) tak vypise cely rok misto chybove stranky.
 *
 * Bere obe jazykove sady, ne jen tu vlastni — jinak by po prepnuti jazyka na
 * adrese s parametry clovek vypadl na vychozi vypis a stare odkazy na
 * anglicke verzi by prestaly platit.
 */
export function parseUrl(search: string, lang: Lang = "cs"): UrlState {
  const params = new URLSearchParams(search);
  const own = VOCAB[lang];
  const other = VOCAB[otherLang(lang)];

  /** Hodnota parametru pod jeho ceskym nebo anglickym nazvem. */
  const get = (key: keyof Vocab) =>
    params.get(own[key]) ?? params.get(other[key]);

  /** Sedi hodnota na dany pojem v kterekoli z obou sad? */
  const is = (value: string | null, key: keyof Vocab) =>
    value === own[key] || value === other[key];

  const year = Number(get("year"));
  const month = Number(get("month"));
  const period = get("period");
  const term = get("search")?.trim();
  /* Mrizka je vychozi zobrazeni, seznam se proto uvadi v adrese. */
  const asCalendar = !is(get("layout"), "list");

  const hasYear = Number.isInteger(year) && year > 1970 && year < 2100;

  if (term) return { view: { kind: "search", term }, asCalendar: false };
  if (is(period, "anytime"))
    return { view: { kind: "upcoming" }, asCalendar: false };

  if (hasYear && Number.isInteger(month) && month >= 1 && month <= 12) {
    return { view: { kind: "month", year, month }, asCalendar };
  }
  if (is(period, "undated")) {
    // Mrizka umi jen mesic a rok, „bez data“ zadne datum nema.
    return {
      view: { kind: "undated", year: hasYear ? year : null },
      asCalendar: false,
    };
  }
  if (hasYear) return { view: { kind: "year", year }, asCalendar };

  return { view: defaultView(), asCalendar };
}

/**
 * Adresa pro dany stav. Vychozi zobrazeni zustava na cistem „/“, aby se
 * hlavni stranka neindexovala pod dvema adresami — a aby odkaz na „/“ ukazal
 * i za pul roku aktualni mesic.
 *
 * Znacky ani razeni v URL zamerne nejsou: znacky si kazdy drzi ve svem
 * prohlizeci, takze `?znacky=oblibene` by prijemci odkazu ukazalo prazdno.
 */
export function urlFor(
  view: View,
  asCalendar: boolean,
  lang: Lang = "cs",
): string {
  if (isDefault(view, asCalendar)) return "/";

  const v = VOCAB[lang];
  const params = new URLSearchParams();

  if (view.kind === "month") {
    params.set(v.year, String(view.year));
    params.set(v.month, String(view.month));
  } else if (view.kind === "year") {
    params.set(v.year, String(view.year));
    params.set(v.period, v.wholeYear);
  } else if (view.kind === "undated") {
    if (view.year != null) params.set(v.year, String(view.year));
    params.set(v.period, v.undated);
  } else if (view.kind === "search") {
    params.set(v.search, view.term);
  } else {
    params.set(v.period, v.anytime);
  }

  /* Mrizka je vychozi, takze se do adresy pise jen odchylka od ni — a jen
     tam, kde mrizka vubec jde: hledani, „vse“ ani „bez data“ ji nemaji. */
  if (!asCalendar && (view.kind === "month" || view.kind === "year")) {
    params.set(v.layout, v.list);
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}
