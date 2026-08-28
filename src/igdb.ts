import type { Game } from "./types";

/** Hledani v IGDB pres dev server; vraci uz zpracovane hry jako zbytek appky. */
export async function searchIgdbGames(term: string): Promise<Game[]> {
  const response = await fetch(`/api/games?q=${encodeURIComponent(term)}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? response.statusText);
  return body as Game[];
}
