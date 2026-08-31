/**
 * Znacky u her: srdicko („oblíbené“) nebo zarovka („zajímá mě“). Hra muze mit
 * vzdy jen jednu, proto je to mapa id -> znacka, ne dve mnoziny.
 * Ulozeni muze byt nedostupne (privatni okno, zakazana data), proto vzdy v try.
 */
export type Mark = "fav" | "interest";

const STORAGE_KEY = "game-marks";
/** Puvodni klic s polem id, kdyz existovaly jen oblibene. */
const LEGACY_KEY = "favorite-games";

export function loadMarks(): Map<number, Mark> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>;
      return new Map(
        Object.entries(parsed)
          .filter(([, mark]) => mark === "fav" || mark === "interest")
          .map(([id, mark]) => [Number(id), mark as Mark]),
      );
    }

    // Migrace ze stareho formatu — vsechno byly oblibene.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]");
    if (!Array.isArray(legacy)) return new Map();
    return new Map(
      legacy.filter(Number.isFinite).map((id: number) => [id, "fav"]),
    );
  } catch {
    return new Map();
  }
}

export function saveMarks(marks: Map<number, Mark>): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(marks)),
    );
  } catch {
    /* bez ukladani aplikace porad funguje, jen se to nezapamatuje */
  }
}
