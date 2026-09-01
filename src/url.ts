/**
 * Stav vypisu v adrese. Bez toho ma cela aplikace jednu jedinou URL: odkaz na
 * „rijen 2026“ nejde poslat dal, tlacitko zpet nefunguje a statistiky ukazou
 * jen jeden pageview na cely web.
 */

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

/** Nazvy parametru jsou cesky — adresa je videt a ma byt citelna. */
const YEAR = "rok";
const MONTH = "mesic";
const PERIOD = "obdobi";
const SEARCH = "hledat";
const LAYOUT = "pohled";

const UNDATED = "bez-data";
const WHOLE_YEAR = "rok";
const ANYTIME = "kdykoliv";
const LIST = "seznam";

export type UrlState = { view: View; asCalendar: boolean };

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
 */
export function parseUrl(search: string): UrlState {
  const params = new URLSearchParams(search);
  const year = Number(params.get(YEAR));
  const month = Number(params.get(MONTH));
  const period = params.get(PERIOD);
  const term = params.get(SEARCH)?.trim();
  /* Mrizka je vychozi zobrazeni, seznam se proto uvadi v adrese. */
  const asCalendar = params.get(LAYOUT) !== LIST;

  const hasYear = Number.isInteger(year) && year > 1970 && year < 2100;

  if (term) return { view: { kind: "search", term }, asCalendar: false };
  if (period === ANYTIME) return { view: { kind: "upcoming" }, asCalendar: false };

  if (hasYear && Number.isInteger(month) && month >= 1 && month <= 12) {
    return { view: { kind: "month", year, month }, asCalendar };
  }
  if (period === UNDATED) {
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
export function urlFor(view: View, asCalendar: boolean): string {
  if (isDefault(view, asCalendar)) return "/";

  const params = new URLSearchParams();

  if (view.kind === "month") {
    params.set(YEAR, String(view.year));
    params.set(MONTH, String(view.month));
  } else if (view.kind === "year") {
    params.set(YEAR, String(view.year));
    params.set(PERIOD, WHOLE_YEAR);
  } else if (view.kind === "undated") {
    if (view.year != null) params.set(YEAR, String(view.year));
    params.set(PERIOD, UNDATED);
  } else if (view.kind === "search") {
    params.set(SEARCH, view.term);
  } else {
    params.set(PERIOD, ANYTIME);
  }

  /* Mrizka je vychozi, takze se do adresy pise jen odchylka od ni — a jen
     tam, kde mrizka vubec jde: hledani, „vse“ ani „bez data“ ji nemaji. */
  if (!asCalendar && (view.kind === "month" || view.kind === "year")) {
    params.set(LAYOUT, LIST);
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}
