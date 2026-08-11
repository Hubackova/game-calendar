import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_URL = "https://api.igdb.com/v4";

/** Minimalni pocet "want" hlasu (v IGDB je to pole `hypes`). */
const MIN_HYPES = 30;
/** IGDB nevrati vic nez 500 zaznamu na jeden dotaz. */
const PAGE_SIZE = 500;
/** Pojistka proti nekonecnemu strankovani. */
const MAX_RESULTS = 5000;

/**
 * Popularitni metriky z /popularity_types, kterymi doplnujeme `hypes`.
 * Typy 3, 4, 5 a 9 (Playing, Played, 24hr Peak Players, Global Top Sellers)
 * jsou u nevydanych her prazdne, takze nemaji smysl.
 */
const POPULARITY_METRICS = [
  { type: 2, label: "IGDB want to play" },
  { type: 10, label: "Steam wishlist" },
  { type: 1, label: "IGDB návštěvy" },
];
/** Kolik her brat z kazdeho zebricku (vcetne `hypes`). */
const TOP_PER_METRIC = 20;

/** IGDB id cestiny v /languages. */
const CZECH_LANGUAGE_ID = 4;
/** IGDB id organizace PEGI v /age_rating_organizations. */
const PEGI_ORGANIZATION_ID = 2;

const GAME_FIELDS = [
  "name, slug, url, summary, hypes, first_release_date",
  "total_rating, total_rating_count",
  "cover.image_id",
  "release_dates.date, release_dates.date_format",
  "genres.name",
  "platforms.name, platforms.abbreviation",
  "involved_companies.company.name, involved_companies.developer, involved_companies.publisher",
  "age_ratings.organization, age_ratings.rating_category.rating",
  "language_supports.language, language_supports.language_support_type.name",
  "game_type.type, game_status.status, parent_game.name",
].join(", ");

type RawGame = {
  first_release_date?: number;
  release_dates?: { date?: number; date_format?: number }[];
  genres?: { name?: string }[];
  platforms?: { name?: string; abbreviation?: string }[];
  involved_companies?: {
    company?: { name?: string };
    developer?: boolean;
    publisher?: boolean;
  }[];
  age_ratings?: {
    organization?: number;
    rating_category?: { rating?: string };
  }[];
  language_supports?: {
    language?: number;
    language_support_type?: { name?: string };
  }[];
  game_type?: { type?: string };
  game_status?: { status?: string };
  parent_game?: { name?: string };
};

/**
 * IGDB uklada presnost data zvlast v `release_dates.date_format`
 * (0 = presne datum, 1 = mesic, 2 = rok, 3-6 = Q1-Q4, 7 = TBD).
 * U ctvrtletnich dat je timestamp posledni den kvartalu, takze bez teto
 * informace by se z "Q1 2027" stalo "31. 3. 2027".
 */
function datePrecision(game: RawGame): number | undefined {
  const dates = game.release_dates ?? [];
  const match =
    dates.find((entry) => entry.date === game.first_release_date) ??
    dates.reduce<(typeof dates)[number] | undefined>(
      (earliest, entry) =>
        earliest?.date != null && (entry.date ?? Infinity) >= earliest.date
          ? earliest
          : entry,
      undefined,
    );

  return match?.date_format;
}

const uniq = (values: (string | undefined)[]) => [
  ...new Set(values.filter((value): value is string => Boolean(value))),
];

/**
 * IGDB vraci vnorene kolekce v podobe, ktera se na kartu nehodi — treba
 * `language_supports` ma pres 30 zaznamu na hru pro vsechny jazyky. Slozitost
 * resime tady, aby frontend dostal uz jen to, co zobrazuje.
 */
function shapeGames(games: unknown[]): unknown[] {
  return games.map((raw) => {
    const game = raw as RawGame & Record<string, unknown>;
    const {
      release_dates: _dates,
      genres,
      platforms,
      involved_companies: companies = [],
      age_ratings: ratings = [],
      language_supports: languages = [],
      game_type,
      game_status,
      parent_game,
      ...rest
    } = game;

    return {
      ...rest,
      date_format: datePrecision(game),
      genres: uniq((genres ?? []).map((genre) => genre.name)),
      platforms: uniq(
        (platforms ?? []).map(
          (platform) => platform.abbreviation ?? platform.name,
        ),
      ),
      developers: uniq(
        companies.filter((c) => c.developer).map((c) => c.company?.name),
      ),
      publishers: uniq(
        companies.filter((c) => c.publisher).map((c) => c.company?.name),
      ),
      pegi: ratings.find((r) => r.organization === PEGI_ORGANIZATION_ID)
        ?.rating_category?.rating,
      // Jen ceske lokalizace: Audio / Subtitles / Interface.
      czech: uniq(
        languages
          .filter((entry) => entry.language === CZECH_LANGUAGE_ID)
          .map((entry) => entry.language_support_type?.name),
      ),
      game_type: game_type?.type,
      status: game_status?.status,
      parent_game: parent_game?.name,
    };
  });
}

/**
 * IGDB nepodporuje CORS a client secret nesmi skoncit v prohlizeci,
 * takze autentizaci i dotazy delame na strane dev serveru.
 */
function igdbPlugin(clientId: string, clientSecret: string): Plugin {
  let token: { value: string; expiresAt: number } | null = null;

  async function getToken(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    });
    const res = await fetch(`${TOKEN_URL}?${params}`, { method: "POST" });
    if (!res.ok) {
      throw new Error(`Twitch OAuth ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    token = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return token.value;
  }

  async function query(endpoint: string, body: string): Promise<unknown> {
    const res = await fetch(`${IGDB_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${await getToken()}`,
        "Content-Type": "text/plain",
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`IGDB ${endpoint} ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  /**
   * Vsechny chystane hry s aspon MIN_HYPES "want" hlasy.
   * IGDB vraci max 500 zaznamu na dotaz, takze strankujeme pres offset.
   */
  async function getUpcomingGames(): Promise<unknown[]> {
    const now = Math.floor(Date.now() / 1000);
    const games: unknown[] = [];

    for (let offset = 0; offset < MAX_RESULTS; offset += PAGE_SIZE) {
      const page = (await query(
        "games",
        `fields ${GAME_FIELDS};
         where first_release_date > ${now} & hypes >= ${MIN_HYPES};
         sort hypes desc;
         limit ${PAGE_SIZE};
         offset ${offset};`,
      )) as unknown[];

      games.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    return shapeGames(games);
  }

  /**
   * Nejockavanejsi hry vydavane v danem mesici. Vedle `hypes` se ptame
   * i na popularitni metriky — `hypes` pokryva jen cast her (v rijnu 2026
   * 56 ze 160) a mine tituly, ktere lidi sleduji jinde nez na IGDB.
   */
  async function getMonthGames(year: number, month: number): Promise<unknown[]> {
    const start = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
    const end = Math.floor(Date.UTC(year, month, 1) / 1000);

    // Nejdriv jen id a hypes, at nestahujeme vnorena pole pro stovky her.
    const candidates = (await query(
      "games",
      `fields id, hypes;
       where first_release_date >= ${start} & first_release_date < ${end};
       sort hypes desc;
       limit 500;`,
    )) as { id: number; hypes?: number }[];
    if (!candidates.length) return [];

    const ids = candidates.map((game) => game.id);
    /** Vsechna umisteni hry, i kdyz se do vypisu dostala uz podle hypes. */
    const selected = new Map<number, { label: string; rank: number }[]>();
    candidates
      .filter((game) => game.hypes)
      .slice(0, TOP_PER_METRIC)
      .forEach((game) => selected.set(game.id, []));

    const ranked = await Promise.all(
      POPULARITY_METRICS.map((metric) =>
        query(
          "popularity_primitives",
          `fields game_id, value;
           where popularity_type = ${metric.type} & game_id = (${ids});
           sort value desc;
           limit ${TOP_PER_METRIC};`,
        ) as Promise<{ game_id: number }[]>,
      ),
    );

    ranked.forEach((rows, index) => {
      rows.forEach((row, position) => {
        const placements = selected.get(row.game_id) ?? [];
        placements.push({
          label: POPULARITY_METRICS[index].label,
          rank: position + 1,
        });
        selected.set(row.game_id, placements);
      });
    });

    /** Nejlepsi umisteni napric metrikami — radi hry, ktere nemaji hypes. */
    const bestRank = (id: number) =>
      Math.min(
        ...(selected.get(id) ?? []).map((place) => place.rank),
        Number.MAX_SAFE_INTEGER,
      );

    const games = shapeGames(
      (await query(
        "games",
        `fields ${GAME_FIELDS};
         where id = (${[...selected.keys()]});
         limit ${selected.size};`,
      )) as unknown[],
    ) as { id: number; hypes?: number }[];

    return games
      .map((game) => ({
        ...game,
        popularity: (selected.get(game.id) ?? []).sort(
          (a, b) => a.rank - b.rank,
        ),
      }))
      .sort(
        (a, b) =>
          (b.hypes ?? 0) - (a.hypes ?? 0) || bestRank(a.id) - bestRank(b.id),
      );
  }

  /**
   * Vyhledavani her podle nazvu bez dalsich filtru — hleda i uz vydane hry
   * a tituly pod hranici MIN_HYPES. Pri `search` neumi IGDB `sort`,
   * poradi urcuje relevance.
   */
  async function searchGames(term: string): Promise<unknown[]> {
    // Uvozovky a strednik by rozbily apicalypse dotaz.
    const safeTerm = term.replace(/["\\;]/g, "").slice(0, 100);

    return shapeGames(
      (await query(
        "games",
        `search "${safeTerm}";
         fields ${GAME_FIELDS};
         limit 50;`,
      )) as unknown[],
    );
  }

  return {
    name: "igdb-api",
    configureServer(server) {
      server.middlewares.use("/api/games", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        try {
          if (!clientId || !clientSecret) {
            throw new Error(
              "Chybi TWITCH_CLIENT_ID nebo TWITCH_CLIENT_SECRET v .env.local",
            );
          }
          const url = new URL(
            req.originalUrl ?? req.url ?? "/",
            "http://localhost",
          );
          const term = url.searchParams.get("q")?.trim();
          const year = Number(url.searchParams.get("year"));
          const month = Number(url.searchParams.get("month"));
          const hasPeriod =
            Number.isInteger(year) && month >= 1 && month <= 12;

          res.end(
            JSON.stringify(
              hasPeriod
                ? await getMonthGames(year, month)
                : term
                  ? await searchGames(term)
                  : await getUpcomingGames(),
            ),
          );
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });
    },
  };
}

const HREJ_API_URL = "https://hrej.cz/api/v1";
const HREJ_UPLOAD_URL = `${HREJ_API_URL}/images?locale=cs`;

/** Co smi klient pres proxy volat — token je citlivy, allowlist je levny. */
const HREJ_RESOURCES = new Set([
  "games",
  "game-developers",
  "game-publishers",
  "game-platforms",
  "game-genres",
]);

/** Navic povolujeme `images/{id}` — pripojeni hry k uz nahranemu obrazku. */
const isAllowedResource = (resource: string) =>
  HREJ_RESOURCES.has(resource) || /^images\/\d+$/.test(resource);

/** Odpoved hreje posleme klientovi; chybu zabalime, aby mel co zobrazit. */
async function pipeUpstream(
  upstream: Response,
  res: { statusCode: number; end: (chunk: string) => void },
) {
  const body = await upstream.text();
  res.statusCode = upstream.ok ? upstream.status : 502;
  res.end(
    upstream.ok
      ? body
      : JSON.stringify({
          error: `hrej.cz ${upstream.status}: ${body.slice(0, 500)}`,
        }),
  );
}

/**
 * Nahravani obalek na hrej.cz. Prohlizec to neposle sam: je to jina domena
 * a session cookie hrej.cz na localhostu neexistuje, takze multipart poskladame
 * tady a pripojime autentizaci z .env.local.
 *
 * Klient posle jen surove JPEG v tele requestu; nazev prijde v query stringu.
 */
function hrejPlugin(token: string): Plugin {
  return {
    name: "hrej-upload",
    configureServer(server) {
      server.middlewares.use("/api/hrej/images", async (req, res, next) => {
        // `images/{id}` patri obecne proxy nize, tohle je jen nahravani.
        const path = (req.url ?? "/").split("?")[0];
        if (path !== "/" && path !== "") {
          next();
          return;
        }

        res.setHeader("Content-Type", "application/json");
        try {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Jen POST" }));
            return;
          }
          if (!token) throw new Error("Chybi HREJ_API_TOKEN v .env.local");

          const url = new URL(
            req.originalUrl ?? req.url ?? "/",
            "http://localhost",
          );
          const title = url.searchParams.get("title")?.trim();
          if (!title) throw new Error("Chybi parametr title");

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const jpeg = Buffer.concat(chunks);
          if (!jpeg.length) throw new Error("Prazdne telo requestu");

          const form = new FormData();
          form.set("title", title);
          form.set("origin", "HUMAN_MADE");
          form.set(
            "file",
            new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }),
            `${title}.jpg`,
          );
          // Obrazek uz je oriznuty na cilovy pomer, takze bereme cely ramec.
          form.set("area[top]", "0");
          form.set("area[left]", "0");
          form.set("area[width]", "1");
          form.set("area[height]", "1");
          form.set("forceGenerateVariants", "true");

          const upstream = await fetch(HREJ_UPLOAD_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
            body: form,
          });

          await pipeUpstream(upstream, res);
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });

      // Ciselniky (GET) a zakladani her (POST) — telo i query jen prehodime.
      server.middlewares.use("/api/hrej", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        try {
          if (!token) throw new Error("Chybi HREJ_API_TOKEN v .env.local");

          const url = new URL(
            req.originalUrl ?? req.url ?? "/",
            "http://localhost",
          );
          const resource = url.pathname.replace(/^\/api\/hrej\/?/, "");
          if (!isAllowedResource(resource)) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: `Neznámý zdroj: ${resource}` }));
            return;
          }

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = Buffer.concat(chunks);

          url.searchParams.set("locale", url.searchParams.get("locale") ?? "cs");
          const upstream = await fetch(
            `${HREJ_API_URL}/${resource}?${url.searchParams}`,
            {
              method: req.method,
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
                ...(body.length ? { "Content-Type": "application/json" } : {}),
              },
              body: body.length ? body : undefined,
            },
          );

          await pipeUpstream(upstream, res);
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      igdbPlugin(env.TWITCH_CLIENT_ID, env.TWITCH_CLIENT_SECRET),
      hrejPlugin(env.HREJ_API_TOKEN),
    ],
  };
});
