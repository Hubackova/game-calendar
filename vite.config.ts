import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_URL = "https://api.igdb.com/v4";

/** Minimalni pocet sledujicich pred vydanim (v IGDB je to pole `hypes`). */
const MIN_HYPES = 30;
/** IGDB nevrati vic nez 500 zaznamu na jeden dotaz. */
const PAGE_SIZE = 500;
/** Pojistka proti nekonecnemu strankovani. */
const MAX_RESULTS = 5000;

/**
 * Popularitni metriky z /popularity_types, kterymi doplnujeme `hypes`.
 * Typy 3, 4, 5 a 9 (Playing, Played, 24hr Peak Players, Global Top Sellers)
 * jsou u nevydanych her prazdne, takze nemaji smysl. Typ 2 (Want to Play)
 * tu nema misto — radi hry skoro identicky jako `hypes` (Spearman 0.93).
 */
const POPULARITY_METRICS = [
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
   * Vsechny chystane hry s aspon MIN_HYPES sledujicimi.
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

  /** Presnosti, ktere patri do konkretniho mesice: den a mesic. */
  const MONTH_PRECISIONS = [0, 1];

  type Candidate = RawGame & { id: number; hypes?: number };

  /** Jen id, hypes a presnost data — vnorena pole by pro stovky her byla drahá. */
  async function fetchCandidates(
    from: number,
    to: number,
  ): Promise<Candidate[]> {
    return (await query(
      "games",
      `fields id, hypes, first_release_date, release_dates.date, release_dates.date_format;
       where first_release_date >= ${from} & first_release_date < ${to};
       sort hypes desc;
       limit 500;`,
    )) as Candidate[];
  }

  /**
   * Z kandidatu vybere nejockavanejsi hry. Vedle `hypes` se ptame i na
   * popularitni metriky — `hypes` pokryva jen cast her (v rijnu 2026 56 ze
   * 160) a mine tituly, ktere lidi sleduji jinde nez na IGDB.
   */
  async function rankGames(candidates: Candidate[]): Promise<unknown[]> {
    if (!candidates.length) return [];

    const ids = candidates.map((game) => game.id);
    /** Vsechna umisteni hry, i kdyz se do vypisu dostala uz podle hypes. */
    const selected = new Map<number, { label: string; rank: number }[]>();
    candidates
      .filter((game) => game.hypes)
      .slice(0, TOP_PER_METRIC)
      .forEach((game) => selected.set(game.id, []));

    const ranked = await Promise.all(
      POPULARITY_METRICS.map(
        (metric) =>
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
        // Metriky mohou vratit i hru, ktera do naseho vyberu nepatri.
        if (!selected.has(row.game_id) && !ids.includes(row.game_id)) return;
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
   * Hry vydavane v danem mesici. Berou se jen ty, u kterych IGDB zna aspon
   * mesic — u rocni a kvartalni presnosti je timestamp posledni den obdobi,
   * takze „rok 2026“ i „Q4 2026“ by jinak spadly do prosince.
   */
  async function getMonthGames(
    year: number,
    month: number,
  ): Promise<unknown[]> {
    const start = Math.floor(Date.UTC(year, month - 1, 1) / 1000);
    const end = Math.floor(Date.UTC(year, month, 1) / 1000);
    const candidates = await fetchCandidates(start, end);

    return rankGames(
      candidates.filter((game) => {
        const precision = datePrecision(game);
        return precision != null && MONTH_PRECISIONS.includes(precision);
      }),
    );
  }

  /** Cely rok — stejny filtr na presnost jako u mesice. */
  async function getYearGames(year: number): Promise<unknown[]> {
    const start = Math.floor(Date.UTC(year, 0, 1) / 1000);
    const end = Math.floor(Date.UTC(year + 1, 0, 1) / 1000);
    const candidates = await fetchCandidates(start, end);

    return rankGames(
      candidates.filter((game) => {
        const precision = datePrecision(game);
        return precision != null && MONTH_PRECISIONS.includes(precision);
      }),
    );
  }

  /**
   * Hry, u kterych IGDB zna jen rok, kvartal nebo vubec nic (`TBD`).
   * Do konkretniho mesice je zaradit nelze, maji proto vlastni vypis.
   */
  async function getUndatedGames(year: number): Promise<unknown[]> {
    const start = Math.floor(Date.UTC(year, 0, 1) / 1000);
    const end = Math.floor(Date.UTC(year + 1, 0, 1) / 1000);
    const candidates = await fetchCandidates(start, end);

    return rankGames(
      candidates.filter((game) => {
        const precision = datePrecision(game);
        return precision == null || !MONTH_PRECISIONS.includes(precision);
      }),
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
          const hasYear = Number.isInteger(year) && year > 0;
          const undated = url.searchParams.get("undated") === "1";
          const wholeYear = url.searchParams.get("whole") === "1";

          res.end(
            JSON.stringify(
              hasYear && undated
                ? await getUndatedGames(year)
                : hasYear && wholeYear
                  ? await getYearGames(year)
                  : hasYear && month >= 1 && month <= 12
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

/** Odpoved Hrej posleme klientovi; chybu zabalime, aby mel co zobrazit. */
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
          error: `Hrej ${upstream.status}: ${body.slice(0, 500)}`,
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

          url.searchParams.set(
            "locale",
            url.searchParams.get("locale") ?? "cs",
          );
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

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
/** Free tier, a na kratky cesky text s prehledem staci. */
const GEMINI_MODEL = "gemini-3.6-flash";

const DESCRIPTION_INSTRUCTION = [
  "Jsi redaktor českého herního magazínu.",
  "Popiš česky, o čem hra je a jak se hraje: tři až čtyři věty, do 600 znaků.",
  "Jádrem popisu je hratelnost — žánr vysvětli slovy, co v té hře člověk dělá",
  "(z čeho je pohled, co ovládá, jaká je náplň hraní), ne jen jeho názvem.",
  "Zmiň zasazení a téma, pokud je z podkladů poznáš.",
  "Studio a vydavatele neuváděj, web je zobrazuje zvlášť; stejně tak datum",
  "vydání a platformy.",
  "Vycházej výhradně z dodaných údajů — nic si nedomýšlej. Když je podkladů",
  "málo, napiš kratší popis místo vymýšlení detailů.",
  "Vrať jen text popisu, bez markdownu, uvozovek a nadpisů.",
].join(" ");

type GeminiResponse = {
  status?: string;
  output_text?: string;
  steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
};

/**
 * Text je v `steps[]` u kroku `model_output` — krok `thought` obsahuje
 * interni uvazovani a musi se preskocit. `output_text` z dokumentace REST
 * odpoved nevraci, kontrolujeme ho jen pro pripad, ze se to zmeni.
 */
function geminiText(body: GeminiResponse): string {
  if (body.output_text?.trim()) return body.output_text.trim();

  return (body.steps ?? [])
    .filter((step) => step.type === "model_output")
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text as string)
    .join("\n")
    .trim();
}

type DescribeRequest = {
  name?: string;
  summary?: string;
  genres?: string[];
  developers?: string[];
  publishers?: string[];
};

/**
 * Navrh ceskeho popisu hry pres Gemini. Klic zustava na serveru a prompt taky,
 * aby se ladil na jednom miste.
 */
function geminiPlugin(apiKey: string): Plugin {
  return {
    name: "gemini-describe",
    configureServer(server) {
      server.middlewares.use("/api/describe", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        try {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Jen POST" }));
            return;
          }
          if (!apiKey) throw new Error("Chybi GEMINI_API_KEY v .env.local");

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const game = JSON.parse(
            Buffer.concat(chunks).toString() || "{}",
          ) as DescribeRequest;
          if (!game.name) throw new Error("Chybi nazev hry");

          const facts = [
            `Název: ${game.name}`,
            game.genres?.length ? `Žánry: ${game.genres.join(", ")}` : null,
            game.developers?.length
              ? `Vývojář: ${game.developers.join(", ")}`
              : null,
            game.publishers?.length
              ? `Vydavatel: ${game.publishers.join(", ")}`
              : null,
            game.summary ? `Anglický popis z IGDB: ${game.summary}` : null,
          ]
            .filter(Boolean)
            .join("\n");

          const upstream = await fetch(GEMINI_URL, {
            method: "POST",
            headers: {
              "x-goog-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: GEMINI_MODEL,
              system_instruction: DESCRIPTION_INSTRUCTION,
              input: facts,
              generation_config: { temperature: 0.7 },
            }),
          });

          const body = await upstream.text();
          if (!upstream.ok) {
            throw new Error(`Gemini ${upstream.status}: ${body.slice(0, 400)}`);
          }

          const parsed = JSON.parse(body) as GeminiResponse;
          const text = geminiText(parsed);
          if (!text) {
            throw new Error(
              `Gemini nevrátil text (status ${parsed.status}): ${body.slice(0, 300)}`,
            );
          }
          res.end(JSON.stringify({ text }));
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
      geminiPlugin(env.GEMINI_API_KEY),
    ],
  };
});
