import { createIgdbApi } from "../../server/igdb.ts";

/**
 * Produkcni `/api/games`. Dev server ma stejnou logiku ve Vite pluginu, oba
 * volaji sdileny modul — jinak by se chovani rozchazelo.
 */
export default async (request: Request): Promise<Response> => {
  const api = createIgdbApi(
    process.env.TWITCH_CLIENT_ID ?? "",
    process.env.TWITCH_CLIENT_SECRET ?? "",
  );

  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const games = await api.handleGamesQuery(params);
    return new Response(JSON.stringify(games), {
      headers: {
        "Content-Type": "application/json",
        // Vypisy se meni po hodinach, ne po sekundach.
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/games" };
