import type { Game } from "./types";

/**
 * Necha si od Gemini navrhnout cesky popis hry. Bezi pres dev server —
 * API klic nesmi do prohlizece a prompt patri k backendu.
 */
export async function suggestDescription(game: Game): Promise<string> {
  const response = await fetch("/api/describe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Zanry neposilame — ty si ma model urcit sam z popisu a vlastnich znalosti.
    body: JSON.stringify({
      name: game.name,
      summary: game.summary,
      developers: game.developers,
      publishers: game.publishers,
    }),
  });

  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? response.statusText);
  return body.text as string;
}
