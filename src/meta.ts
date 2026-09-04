/**
 * Staticka hlavicka stranky pro oba jazyky. Cesky `index.html` i anglicky
 * `en/index.html` se skladaji pri buildu, takze tyhle texty potrebuje jak
 * `vite.config.ts`, tak slovniky v `i18n.ts` — a zadny z nich sem nesmi
 * pritahnout prohlizecove API, jinak by build spadl.
 *
 * Proto tady nic nedelame, jen data.
 */
export const LANGS = ["cs", "en"] as const;

export type Lang = (typeof LANGS)[number];

/** Cesta k jazykove verzi. Cestina je na korenu, anglictina pod `/en`. */
export const LANG_PREFIX: Record<Lang, string> = { cs: "", en: "/en" };

export type Meta = {
  htmlLang: string;
  ogLocale: string;
  title: string;
  description: string;
  brand: string;
  imageAlt: string;
};

export const META: Record<Lang, Meta> = {
  cs: {
    htmlLang: "cs",
    ogLocale: "cs_CZ",
    title: "Herní kalendář — chystané hry a data vydání",
    description:
      "Chystané hry podle data vydání. Označ si srdíčkem a žárovkou, co chceš hrát, a sestav si vlastní kalendář — jen co IGDB doplní datum, hra v něm naskočí.",
    brand: "Herní kalendář",
    imageAlt: "Herní kalendář — přehled chystaných her",
  },
  en: {
    htmlLang: "en",
    ogLocale: "en_GB",
    title: "Games calendar — upcoming games and release dates",
    description:
      "Upcoming games by release date. Mark what you want to play with a heart or a bulb and build your own calendar — a game appears as soon as IGDB adds its date.",
    brand: "Games calendar",
    imageAlt: "Games calendar — an overview of upcoming games",
  },
};
