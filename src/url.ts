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
  /** Hry, u kterych IGDB zna jen rok, kvartal nebo nic. */
  | { kind: "undated"; year: number };

/** Ma vypis navazany rok? Bez nej se v selectu zobrazuje "-". */
export const hasPeriod = (view: View): view is Extract<View, { year: number }> =>
  view.kind === "month" || view.kind === "year" || view.kind === "undated";

/** Nazvy parametru jsou cesky — adresa je videt a ma byt citelna. */
const YEAR = "rok";
const MONTH = "mesic";
const PERIOD = "obdobi";
const SEARCH = "hledat";
const LAYOUT = "pohled";

const UNDATED = "bez-data";
const WHOLE_YEAR = "rok";
const CALENDAR = "kalendar";

export type UrlState = { view: View; asCalendar: boolean };

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
  const asCalendar = params.get(LAYOUT) === CALENDAR;

  const hasYear = Number.isInteger(year) && year > 1970 && year < 2100;

  if (hasYear && Number.isInteger(month) && month >= 1 && month <= 12) {
    return { view: { kind: "month", year, month }, asCalendar };
  }
  if (hasYear && period === UNDATED) {
    // Mrizka umi jen mesic a rok, „bez data“ zadne datum nema.
    return { view: { kind: "undated", year }, asCalendar: false };
  }
  if (hasYear) return { view: { kind: "year", year }, asCalendar };
  if (term) return { view: { kind: "search", term }, asCalendar: false };

  return { view: { kind: "upcoming" }, asCalendar: false };
}

/**
 * Adresa pro dany stav. Vychozi vypis zustava na cistem „/“, aby se hlavni
 * stranka neindexovala pod dvema adresami.
 *
 * Znacky ani razeni v URL zamerne nejsou: znacky si kazdy drzi ve svem
 * prohlizeci, takze `?znacky=oblibene` by prijemci odkazu ukazalo prazdno.
 */
export function urlFor(view: View, asCalendar: boolean): string {
  const params = new URLSearchParams();

  if (view.kind === "month") {
    params.set(YEAR, String(view.year));
    params.set(MONTH, String(view.month));
  } else if (view.kind === "year") {
    params.set(YEAR, String(view.year));
    params.set(PERIOD, WHOLE_YEAR);
  } else if (view.kind === "undated") {
    params.set(YEAR, String(view.year));
    params.set(PERIOD, UNDATED);
  } else if (view.kind === "search") {
    params.set(SEARCH, view.term);
  }

  if (asCalendar) params.set(LAYOUT, CALENDAR);

  const query = params.toString();
  return query ? `/?${query}` : "/";
}
