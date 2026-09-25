/**
 * Co se da odvodit z `Game` — adresa obalky, nahradni ikona a den v mesici.
 * Sdili to rozhrani (`App.tsx`) i export do PNG (`export.ts`); kdyby si to
 * kazdy pocital sam, rozejdou se pri prvni zmene a nikdo si toho nevsimne.
 *
 * Zadne React API tady nesmi byt, export kresli do canvasu bez komponent.
 */
import type { Game } from "./types";

/**
 * Obal ve velikosti, ktera odpovida miste zobrazeni. IGDB dava kazdou obalku
 * v nekolika variantach a `cover_big_2x` (528 × 748) je pro policko kalendare
 * o sirce 76 px sedmkrat vetsi, nez je potreba — v mesici se ctyriceti hrami
 * to byly megabajty pro nic.
 */
export const COVER_SIZES = {
  /** 180 × 256 — policko kalendare (76 px, tedy 152 px na retine). */
  cell: "t_cover_small_2x",
  /** 264 × 374 — karta v seznamu (180 px) a dlazdice v exportu. */
  card: "t_cover_big",
  /** 528 × 748 — detail hry, jeden obrazek na obrazovku. */
  detail: "t_cover_big_2x",
} as const;

/** Nativni rozmer `t_cover_big`. Export v nem kresli, takze neskaluje. */
export const CARD_COVER_WIDTH = 264;
export const CARD_COVER_HEIGHT = 374;

export const coverUrl = (
  imageId: string,
  size: keyof typeof COVER_SIZES = "detail",
) => `https://images.igdb.com/igdb/image/upload/${COVER_SIZES[size]}/${imageId}.jpg`;

/**
 * Obrys ovladace pro hry bez obalky, v soustave `viewBox="0 0 24 24"`.
 * Retezce bere `<path d>` v rozhrani i `new Path2D()` v exportu, takze je
 * nahrada v PNG presne ta, kterou je videt na webu.
 */
export const GAMEPAD_PATHS = [
  "M8.5 7.5h7a5.5 5.5 0 0 1 5.4 4.5l.8 4.3a2.6 2.6 0 0 1-4.7 2l-1.4-2H8.4l-1.4 2a2.6 2.6 0 0 1-4.7-2l.8-4.3a5.5 5.5 0 0 1 5.4-4.5Z",
  "M7.2 11.4v2.4M6 12.6h2.4",
  "M15.6 11.6h.01M17.8 13.4h.01",
];

/** Kresba ovladace pocita s timhle plátnem. */
export const GAMEPAD_VIEWBOX = 24;
export const GAMEPAD_STROKE = 1.5;

/**
 * Den v mesici, ale jen kdyz ho IGDB opravdu zna (`date_format === 0`).
 * U hry se znamym jen mesicem by prvni den lhal, proto radeji `null` —
 * mrizka i export takove hry odsunou do vlastniho pasu.
 */
export const dayOfMonth = (game: Game) =>
  game.date_format === 0 && game.first_release_date != null
    ? new Date(game.first_release_date * 1000).getUTCDate()
    : null;
