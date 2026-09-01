/**
 * Cteni z IGDB. Modul je zamerne bez zavislosti na Vite ani Netlify, aby ho
 * mohl pouzit dev server (plugin) i produkcni serverless funkce — jinak by
 * produkce nemela zadne `/api/games`.
 */
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
/** Kolik her brat z kazdeho zebricku (vcetne `hypes`) u mesicniho vypisu. */
const TOP_PER_METRIC = 30;
/** Rocni vypis je sirsi — bere vic z kazdeho zebricku a orizne se na sto. */
const YEAR_PER_METRIC = 100;
const YEAR_LIMIT = 100;

/**
 * Edice („: Digital Premium Edition“) jsou v IGDB samostatne hry s odkazem
 * na zakladni titul. Ve vypisech chceme jen tu zakladni, jinak jeden titul
 * zabere pul stranky.
 */
const BASE_GAME_ONLY = "version_parent = null";

const CURRENT_YEAR = new Date().getFullYear();
/** Jak daleko dopredu koukat, kdyz se hry bez data neomezuji rokem. */
const UNDATED_SPAN_YEARS = 8;

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

export type GamesQuery = {
  ids?: string | null;
  q?: string | null;
  year?: string | null;
  month?: string | null;
  whole?: string | null;
  undated?: string | null;
};

export function createIgdbApi(clientId: string, clientSecret: string) {
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
         where first_release_date > ${now} & hypes >= ${MIN_HYPES} & ${BASE_GAME_ONLY};
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
       where first_release_date >= ${from} & first_release_date < ${to} & ${BASE_GAME_ONLY};
       sort hypes desc;
       limit 500;`,
    )) as Candidate[];
  }

  /**
   * Z kandidatu vybere nejockavanejsi hry. Vedle `hypes` se ptame i na
   * popularitni metriky — `hypes` pokryva jen cast her (v rijnu 2026 56 ze
   * 160) a mine tituly, ktere lidi sleduji jinde nez na IGDB.
   */
  async function rankGames(
    candidates: Candidate[],
    perMetric = TOP_PER_METRIC,
    limit?: number,
  ): Promise<unknown[]> {
    if (!candidates.length) return [];

    const ids = candidates.map((game) => game.id);
    /** Vsechna umisteni hry, i kdyz se do vypisu dostala uz podle hypes. */
    const selected = new Map<number, { label: string; rank: number }[]>();
    candidates
      .filter((game) => game.hypes)
      .slice(0, perMetric)
      .forEach((game) => selected.set(game.id, []));

    const ranked = await Promise.all(
      POPULARITY_METRICS.map(
        (metric) =>
          query(
            "popularity_primitives",
            `fields game_id, value;
           where popularity_type = ${metric.type} & game_id = (${ids});
           sort value desc;
           limit ${perMetric};`,
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
      )
      .slice(0, limit ?? Infinity);
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
      YEAR_PER_METRIC,
      YEAR_LIMIT,
    );
  }

  /**
   * Hry, u kterych IGDB zna jen rok, kvartal nebo vubec nic (`TBD`).
   * Do konkretniho mesice je zaradit nelze, maji proto vlastni vypis.
   *
   * Bez roku bereme vsechno od dneska dal — hry s hrubym datem jsou casto
   * ohlasene na nekolik let dopredu a delit je po rocich nema smysl.
   */
  async function getUndatedGames(year: number | null): Promise<unknown[]> {
    const now = Math.floor(Date.now() / 1000);
    const start = year != null ? Math.floor(Date.UTC(year, 0, 1) / 1000) : now;
    const end = Math.floor(
      Date.UTC((year ?? CURRENT_YEAR + UNDATED_SPAN_YEARS) + 1, 0, 1) / 1000,
    );
    const candidates = await fetchCandidates(start, end);

    return rankGames(
      candidates.filter((game) => {
        const precision = datePrecision(game);
        return precision == null || !MONTH_PRECISIONS.includes(precision);
      }),
    );
  }

  /**
   * Konkretni hry podle id — pouziva se pro oblibene, aby se do vypisu
   * dostaly i tituly, ktere by se do zebricku nevesly.
   */
  async function getGamesByIds(raw: string): Promise<unknown[]> {
    const ids = raw
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0)
      .slice(0, 200);
    if (!ids.length) return [];

    return shapeGames(
      (await query(
        "games",
        `fields ${GAME_FIELDS};
         where id = (${ids.join(",")});
         limit ${ids.length};`,
      )) as unknown[],
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
         where ${BASE_GAME_ONLY};
         limit 50;`,
      )) as unknown[],
    );
  }

  /**
   * Jedno misto, ktere z parametru vybere spravny vypis. Sdileji ho dev server
   * i serverless funkce, aby se chovaly stejne.
   */
  async function handleGamesQuery(params: GamesQuery): Promise<unknown[]> {
    if (!clientId || !clientSecret) {
      throw new Error("Chybi TWITCH_CLIENT_ID nebo TWITCH_CLIENT_SECRET");
    }

    const year = Number(params.year);
    const month = Number(params.month);
    const hasYear = Number.isInteger(year) && year > 0;
    const term = params.q?.trim();

    if (params.ids) return getGamesByIds(params.ids);
    if (params.undated === "1") return getUndatedGames(hasYear ? year : null);
    if (hasYear && params.whole === "1") return getYearGames(year);
    if (hasYear && month >= 1 && month <= 12) {
      return getMonthGames(year, month);
    }
    if (term) return searchGames(term);
    return getUpcomingGames();
  }

  return { handleGamesQuery };
}
