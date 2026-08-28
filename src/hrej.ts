import type { Game } from "./types";
import { searchIgdbGames } from "./igdb";

/**
 * Rozmery pro hrej.cz ve 2x, tedy 497x704 na retinu.
 * IGDB obalky jsou 3:4, takze se orezava sirka.
 */
export const HREJ_COVER_WIDTH = 994;
export const HREJ_COVER_HEIGHT = 1408;
const JPEG_QUALITY = 0.92;

/**
 * Zdroj pro stahovani. `t_1080p_2x` vraci 1620x2160, takze na 994x1408 zbyva
 * rezerva i po orezu. `t_original` by dal nativni rozliseni, ale u vetsiny
 * obalek je mensi nez tenhle alias a vazi az 4 MB.
 */
const sourceCoverUrl = (imageId: string) =>
  `https://images.igdb.com/igdb/image/upload/t_1080p_2x/${imageId}.jpg`;

/** Nazev souboru i title na hreji: `fire-emblem-fortunes-weave-994x1408`. */
export const coverName = (game: Game) =>
  `${game.slug ?? game.id}-${HREJ_COVER_WIDTH}x${HREJ_COVER_HEIGHT}`;

/**
 * Stahne obalku ve vysokem rozliseni a prevede ji na presne 994x1408 JPEG.
 * IGDB obrazky do ramce jen vepisuje a nikdy needituje vyrez, pomer 3:4 se
 * tedy na 0.706 musi doriznout tady — stred zachovavame, ubira se sirka.
 * CDN posila `access-control-allow-origin: *`, takze canvas neni tainted.
 */
export async function renderCover(game: Game): Promise<Blob> {
  const imageId = game.cover?.image_id;
  if (!imageId) throw new Error("Hra nemá obálku");

  const response = await fetch(sourceCoverUrl(imageId));
  if (!response.ok) {
    throw new Error(`Obálku nelze stáhnout (${response.status})`);
  }
  const bitmap = await createImageBitmap(await response.blob());

  const canvas = document.createElement("canvas");
  canvas.width = HREJ_COVER_WIDTH;
  canvas.height = HREJ_COVER_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas není dostupný");

  // Vyplnit cely ramec a presah symetricky odriznout (jako object-fit: cover).
  const scale = Math.max(
    HREJ_COVER_WIDTH / bitmap.width,
    HREJ_COVER_HEIGHT / bitmap.height,
  );
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(
    bitmap,
    (HREJ_COVER_WIDTH - width) / 2,
    (HREJ_COVER_HEIGHT - height) / 2,
    width,
    height,
  );
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Převod na JPEG se nepovedl");

  return blob;
}

/** Odpoved hreje je zabalena v `data`, u chyb prijde `error` z nasi proxy. */
async function unwrap(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? body?.message ?? response.statusText);
  }
  return (body?.data ?? body) as Record<string, unknown>;
}

/**
 * Posle oriznutou obalku na hrej.cz (pres proxy v dev serveru, protoze token
 * ani multipart nepatri do prohlizece) a vrati id vzniknuleho obrazku.
 */
export async function uploadCover(game: Game, blob: Blob): Promise<number> {
  const response = await fetch(
    `/api/hrej/images?title=${encodeURIComponent(coverName(game))}`,
    { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob },
  );

  const data = await unwrap(response);
  const id = data.id;
  if (typeof id !== "number") {
    throw new Error(
      `Odpověď Hrej neobsahuje id obrázku: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
  return id;
}

export type HrejRef = { id: number; title: string };

/**
 * Ciselniky nemaji jednotny tvar: platformy a vyvojari maji `title` jako
 * string, zanry jako lokalizovany objekt `{ cs: "Závody" }`. Srovname to hned
 * pri nacteni, aby zbytek kodu resil jen jeden tvar.
 */
function normalizeRef(raw: unknown): HrejRef | null {
  const ref = raw as { id?: unknown; title?: unknown };
  if (typeof ref?.id !== "number") return null;

  const title =
    typeof ref.title === "string"
      ? ref.title
      : (ref.title as { cs?: string } | null)?.cs;

  return title ? { id: ref.id, title } : null;
}

/**
 * Dohleda id v hrej ciselniku podle nazvu. Presna shoda ma prednost, aby
 * "Nintendo Switch" nesebral "Nintendo Switch 2".
 */
async function lookup(
  resource: "game-developers" | "game-publishers" | "game-platforms",
  title: string,
): Promise<HrejRef | null> {
  const params = new URLSearchParams({
    limit: "10",
    offset: "0",
    title,
    locale: "cs",
  });
  const data = await unwrap(await fetch(`/api/hrej/${resource}?${params}`));

  const items = (Array.isArray(data) ? data : [])
    .map(normalizeRef)
    .filter((item): item is HrejRef => item !== null);
  if (!items.length) return null;

  const wanted = title.toLowerCase();
  return items.find((item) => item.title.toLowerCase() === wanted) ?? items[0];
}

/**
 * IGDB zkratky platforem se s hrej ciselnikem nekryji, hledame proto pod jinym
 * vyrazem. Co v mape neni, jde do hledani tak, jak to prislo z IGDB.
 * Overeno proti /game-platforms: PC 8, PlayStation 5 3, PlayStation 4 29,
 * Xbox Series X/S 26, Xbox One 6, Switch 30, Switch 2 46, Mac 19, Linux 7.
 */
const PLATFORM_SEARCH: Record<string, string> = {
  PC: "PC",
  Mac: "Mac",
  Linux: "Linux",
  PS5: "PlayStation 5",
  PS4: "PlayStation 4",
  "Series X|S": "Xbox Series",
  XONE: "Xbox One",
  // Hrej nema "Nintendo" v nazvu, jen "Switch" a "Switch 2".
  Switch: "Switch",
  "Switch 2": "Switch 2",
  iOS: "iOS",
  Android: "Android",
};

/**
 * IGDB ma 23 zanru, hrej 94 a mnohem jemnejsi deleni — mapujeme proto na
 * nazvy, ne na id, a id se dohleda v ciselniku. Co tu neni (Indie, Quiz/Trivia,
 * Visual Novel, Pinball), nema na hreji rozumny protejsek a preskoci se.
 * Jeden IGDB zanr muze dat vic hrej zanru.
 */
const GENRE_MAP: Record<string, string[]> = {
  Adventure: ["Adventura"],
  Arcade: ["Arkáda"],
  "Card & Board Game": ["Karetní", "Desková hra"],
  Fighting: ["Bojovka"],
  "Hack and slash/Beat 'em up": ["Hack'n'slash"],
  MOBA: ["MOBA"],
  Music: ["Hudební"],
  Platform: ["Plošinovka"],
  "Point-and-click": ["Adventura"],
  Puzzle: ["Logické"],
  Racing: ["Závody"],
  "Real Time Strategy (RTS)": ["Real-time strategie"],
  "Role-playing (RPG)": ["RPG"],
  Shooter: ["Akce"],
  Simulator: ["Simulátor"],
  Sport: ["Sportovní"],
  Strategy: ["Strategie"],
  Tactical: ["Taktická akce"],
  "Turn-based strategy (TBS)": ["Tahová strategie"],
};

/** Cely ciselnik zanru; 94 polozek se vejde do jedne stranky, presto strankujeme. */
async function fetchGenres(): Promise<HrejRef[]> {
  const genres: HrejRef[] = [];

  for (let offset = 0; offset < 500; offset += 100) {
    const params = new URLSearchParams({
      limit: "100",
      offset: String(offset),
      locale: "cs",
    });
    const data = await unwrap(await fetch(`/api/hrej/game-genres?${params}`));
    const page = Array.isArray(data) ? data : [];

    genres.push(
      ...page.map(normalizeRef).filter((ref): ref is HrejRef => ref !== null),
    );
    if (page.length < 100) break;
  }

  return genres;
}

/** Navrh zanru pro hru — jen ty z GENRE_MAP, ktere ciselnik opravdu obsahuje. */
function suggestGenres(game: Game, catalogue: HrejRef[]): HrejRef[] {
  const byTitle = new Map(
    catalogue.map((genre) => [genre.title.toLowerCase(), genre]),
  );
  const wanted = game.genres.flatMap((genre) => GENRE_MAP[genre] ?? []);
  const found = wanted
    .map((title) => byTitle.get(title.toLowerCase()))
    .filter((genre): genre is HrejRef => genre !== undefined);

  return [...new Map(found.map((genre) => [genre.id, genre])).values()];
}

const PEGI_WORDS: Record<string, number> = {
  Three: 3,
  Seven: 7,
  Twelve: 12,
  Sixteen: 16,
  Eighteen: 18,
};

function pegiRating(pegi?: string): number | null {
  if (!pegi) return null;
  const parsed = Number.parseInt(pegi, 10);
  return Number.isFinite(parsed) ? parsed : (PEGI_WORDS[pegi] ?? null);
}

const OFFSET_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  timeZoneName: "longOffset",
});

/** Praha ma bud +01:00, nebo +02:00 — hrej ocekava offset platny pro to datum. */
function pragueOffset(year: number, month: number, day: number): string {
  const parts = OFFSET_FORMAT.formatToParts(
    new Date(Date.UTC(year, month, day, 12)),
  );
  const zone = parts.find((part) => part.type === "timeZoneName")?.value;
  return zone?.replace("GMT", "") || "+01:00";
}

const pad = (value: number) => String(value).padStart(2, "0");

export type ReleaseDatePlan = {
  releaseDate: string;
  displayJustReleaseYear: boolean;
};

/**
 * Presny den posilame tak, jak je. Cokoli mene presneho (mesic, kvartal, rok)
 * se podle zadani prevadi na 31. 12. daneho roku + displayJustReleaseYear.
 */
export function releaseDatePlan(game: Game): ReleaseDatePlan | null {
  const timestamp = game.first_release_date;
  if (timestamp == null) return null;

  const date = new Date(timestamp * 1000);
  const exactDay = game.date_format === 0;
  const year = date.getUTCFullYear();
  const month = exactDay ? date.getUTCMonth() : 11;
  const day = exactDay ? date.getUTCDate() : 31;

  return {
    releaseDate: `${year}-${pad(month + 1)}-${pad(day)}T00:00:00.000${pragueOffset(year, month, day)}`,
    displayJustReleaseYear: !exactDay,
  };
}

export type GameType = "GAME" | "DLC";

/** IGDB nazvy typu, ktere na hreji odpovidaji DLC spis nez samostatne hre. */
const DLC_TYPES = /dlc|expansion|add-?on|pack|episode|season/i;

/** Predvolba typu podle IGDB `game_type` — clovek ji v modalu prepise. */
export const guessGameType = (game: Game): GameType =>
  DLC_TYPES.test(game.game_type ?? "") ? "DLC" : "GAME";

/** Naseptavac firem v hrej ciselniku — at nezakladame duplikat. */
export async function searchCompanies(
  role: "developer" | "publisher",
  title: string,
): Promise<HrejRef[]> {
  const resource = role === "developer" ? "game-developers" : "game-publishers";
  const params = new URLSearchParams({
    limit: "10",
    offset: "0",
    title,
    locale: "cs",
  });
  const data = await unwrap(await fetch(`/api/hrej/${resource}?${params}`));

  return (Array.isArray(data) ? data : [])
    .map(normalizeRef)
    .filter((item): item is HrejRef => item !== null);
}

/**
 * Zalozi vyvojare nebo vydavatele v hrej ciselniku. Jedine povinne pole je
 * `title` — overeno prazdnym POSTem, ktery si u obou stezoval jen na nej.
 */
export async function createCompany(
  role: "developer" | "publisher",
  title: string,
): Promise<HrejRef> {
  const resource = role === "developer" ? "game-developers" : "game-publishers";
  const response = await fetch(`/api/hrej/${resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  const created = normalizeRef(await unwrap(response));
  if (!created) {
    throw new Error(
      role === "developer"
        ? "Hrej nevrátil id nového vývojáře"
        : "Hrej nevrátil id nového vydavatele",
    );
  }
  return created;
}

/** Naseptavac rodicovske hry pro DLC. */
export async function searchGamesByTitle(title: string): Promise<HrejRef[]> {
  const found = await searchHrejGames(title);
  return found
    .filter((item) => item.title)
    .slice(0, 10)
    .map((item) => ({ id: item.id, title: item.title }));
}

export type GamePayload = {
  title: string;
  /** Bez popisu se posila prazdny objekt — `cs: ""` hrej odmita jako blank. */
  text: { cs: string } | Record<string, never>;
  content: Record<string, never>;
  platformIds: number[];
  developerId: number | null;
  publisherId: number | null;
  genreIds: number[];
  localizationIds: number[];
  minimumHWRequirements: null;
  recommendedHWRequirements: null;
  pegiRating: number | null;
  releaseDate: string | null;
  mainImageId: number | null;
  parentGameId: number | null;
  type: GameType;
  displayJustReleaseYear: boolean;
  canceled: boolean;
  user: null;
  thirdpartyType: "NONE";
  stats: never[];
  statDefaultSort: "NUMBER_0";
  statDefaultSortDirection: "DESC";
  project: null;
  esport: boolean;
  userAccounts: boolean;
  reviewSummary: Record<string, never>;
  reviewScore: null;
  pandaGame: null;
  labelColor: null;
  label: null;
  coolUrl: null;
  tournamentGameTitles: {
    left: string;
    right: string;
    sideA: null;
    sideB: null;
  };
  vetos: never[];
};

export type ExistingCheck = {
  /** Jednoznacna shoda nazvu — zakladat znovu by delalo duplikat. */
  exact: HrejGame | null;
  /** Podobne nazvy, at se pozna „Phantom Blade 0“ vs. „Phantom Blade Zero“. */
  similar: HrejGame[];
};

/**
 * Zjisti, jestli hra na hreji uz neni. Vedle presne shody vraci i podobne
 * zaznamy — presna shoda casto selze na drobnem rozdilu v nazvu, a prave
 * tehdy vznika duplikat.
 */
async function findExisting(game: Game): Promise<ExistingCheck> {
  const wanted = normalizeTitle(game.name);
  const year = game.first_release_date
    ? new Date(game.first_release_date * 1000).getUTCFullYear()
    : undefined;

  /*
   * Hrej hleda na cely retezec, takze „Phantom Blade 0“ nevrati nic, i kdyz
   * ma „Phantom Blade Zero“. Kdyz nic nenajdeme, zkusime nazev bez posledniho
   * slova — prave tam se cislo nebo podtitul lisi nejcasteji.
   */
  const shortened = game.name.trim().replace(/\s+\S+$/, "");
  const queries = [
    game.name,
    toArabic(game.name),
    shortened.includes(" ") ? shortened : "",
  ].filter((query, index, all) => query && all.indexOf(query) === index);

  const found: HrejGame[] = [];
  for (const query of queries) {
    found.push(...(await searchHrejGames(query)));
    if (found.length) break;
  }

  const matching = found.filter(
    (item) => item.title && normalizeTitle(item.title) === wanted,
  );
  const exact =
    matching.length === 1
      ? matching[0]
      : (matching.find(
          (item) =>
            item.title.includes(`(${year})`) ||
            item.releaseDate?.startsWith(String(year)),
        ) ?? null);

  return {
    exact,
    similar: found.filter((item) => item.id !== exact?.id).slice(0, 5),
  };
}

export type GamePlan = {
  /** Payload bez `mainImageId` — to vznikne az nahranim obalky. */
  payload: Omit<GamePayload, "mainImageId">;
  /** Co se v ciselnicich naslo, pro rekapitulaci v modalu. */
  platforms: { term: string; match: HrejRef | null }[];
  developer: { term: string; match: HrejRef | null } | null;
  publisher: { term: string; match: HrejRef | null } | null;
  /** Navrzene zanry a cely ciselnik, aby sly v modalu upravit. */
  genres: { suggested: HrejRef[]; catalogue: HrejRef[] };
  /** Je hra na hreji uz zalozena? */
  existing: ExistingCheck;
};

/**
 * Pripravi payload nove hry. Ciselniky se dohledavaji predem, aby modal mohl
 * ukazat, co se naslo — nenalezeny vyvojar/vydavatel zustava prazdny.
 */
export async function planGame(game: Game): Promise<GamePlan> {
  const platformTerms = game.platforms.map(
    (platform) => PLATFORM_SEARCH[platform] ?? platform,
  );
  const developerTerm = game.developers[0];
  const publisherTerm = game.publishers[0];

  const [platformMatches, developerMatch, publisherMatch, catalogue, existing] =
    await Promise.all([
      Promise.all(platformTerms.map((term) => lookup("game-platforms", term))),
      developerTerm ? lookup("game-developers", developerTerm) : null,
      publisherTerm ? lookup("game-publishers", publisherTerm) : null,
      fetchGenres(),
      findExisting(game),
    ]);

  const release = releaseDatePlan(game);
  const suggested = suggestGenres(game, catalogue);

  return {
    genres: { suggested, catalogue },
    existing,
    platforms: platformTerms.map((term, index) => ({
      term,
      match: platformMatches[index],
    })),
    developer: developerTerm
      ? { term: developerTerm, match: developerMatch }
      : null,
    publisher: publisherTerm
      ? { term: publisherTerm, match: publisherMatch }
      : null,
    payload: {
      title: game.name,
      // Popis je nepovinny a doplnuje se rucne v modalu; IGDB `summary`
      // je anglicky, takze ho nepouzivame.
      text: {},
      content: {},
      platformIds: platformMatches
        .filter((match): match is HrejRef => match !== null)
        .map((match) => match.id),
      developerId: developerMatch?.id ?? null,
      publisherId: publisherMatch?.id ?? null,
      genreIds: suggested.map((genre) => genre.id),
      localizationIds: [],
      minimumHWRequirements: null,
      recommendedHWRequirements: null,
      pegiRating: pegiRating(game.pegi),
      releaseDate: release?.releaseDate ?? null,
      parentGameId: null,
      type: "GAME",
      displayJustReleaseYear: release?.displayJustReleaseYear ?? false,
      canceled: false,
      user: null,
      thirdpartyType: "NONE",
      stats: [],
      statDefaultSort: "NUMBER_0",
      statDefaultSortDirection: "DESC",
      project: null,
      esport: false,
      userAccounts: false,
      reviewSummary: {},
      reviewScore: null,
      pandaGame: null,
      labelColor: null,
      label: null,
      coolUrl: null,
      tournamentGameTitles: {
        left: "Mapa",
        right: "Info",
        sideA: null,
        sideB: null,
      },
      vetos: [],
    },
  };
}

export type HrejGame = Record<string, unknown> & {
  id: number;
  title: string;
  releaseDate?: string | null;
  displayJustReleaseYear?: boolean;
  coolUrl?: string;
};

/** Porovnavame kalendarni den, ne cely ISO retezec — hrej neposila milisekundy. */
const day = (iso?: string | null) => iso?.slice(0, 10) ?? null;

const ROMAN: Record<string, number> = {
  ii: 2,
  iii: 3,
  iv: 4,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  xi: 11,
  xii: 12,
  xiii: 13,
  xiv: 14,
  xv: 15,
};

/**
 * IGDB pise rimske cislice ("Grand Theft Auto VI"), hrej arabske
 * ("Grand Theft Auto 6"). Jednopismenne I/V/X zamerne neprevadime — z
 * "Mega Man X" by se stal "Mega Man 10".
 */
const toArabic = (title: string) =>
  title.replace(/\s+([IVXivx]{2,})$/, (match, numeral: string) =>
    ROMAN[numeral.toLowerCase()] ? ` ${ROMAN[numeral.toLowerCase()]}` : match,
  );

/** Hrej rozlisuje stejnojmenne hry rokem: "Fable (2027)". */
const normalizeTitle = (title: string) =>
  toArabic(title.trim().replace(/\s*\(\d{4}\)\s*$/, "")).toLowerCase();

async function searchHrejGames(title: string): Promise<HrejGame[]> {
  const params = new URLSearchParams({
    limit: "20",
    offset: "0",
    title,
    locale: "cs",
  });
  const data = await unwrap(await fetch(`/api/hrej/games?${params}`));
  return (Array.isArray(data) ? data : []) as HrejGame[];
}

/** Hledani her na Hrej pro rucni overeni — jen ke zobrazeni, nic se nepari. */
export async function searchHrejGamesByTitle(
  title: string,
): Promise<HrejGame[]> {
  return (await searchHrejGames(title)).slice(0, 10);
}

/**
 * Stejny nazev jeste neznamena stejnou hru: Hrej ma „Ecstatica II“ z roku 1997,
 * IGDB remake z 2026. Bez teto kontroly by Opravit prepsalo datum puvodni hre.
 * Rozdil jednoho roku tolerujeme — vydani se casto posouva pres Novy rok.
 */
function plausibleMatch(item: HrejGame, year?: number): boolean {
  const hrejYear = Number(item.releaseDate?.slice(0, 4));
  // Zaznam bez data je v poradku, prave ten chceme doplnit.
  if (!Number.isFinite(hrejYear)) return true;
  if (year == null) return true;
  return Math.abs(hrejYear - year) <= 1;
}

export async function findHrejGame(
  title: string,
  year?: number,
): Promise<HrejGame | null> {
  const wanted = normalizeTitle(title);
  // Hledani na "VI" vraci Vice City, ale ne GTA 6 — zkusime i arabsky tvar.
  const queries = [title, toArabic(title)].filter(
    (query, index, all) => all.indexOf(query) === index,
  );

  for (const query of queries) {
    const candidates = (await searchHrejGames(query)).filter(
      (item) => item.title && normalizeTitle(item.title) === wanted,
    );
    if (candidates.length === 1) {
      return plausibleMatch(candidates[0], year) ? candidates[0] : null;
    }
    if (candidates.length > 1) {
      const byYear = candidates.find(
        (item) =>
          item.title.includes(`(${year})`) ||
          item.releaseDate?.startsWith(String(year)),
      );
      return byYear ?? null;
    }
  }

  return null;
}

/** Verejna adresa zaznamu na hreji. */
export const hrejGameUrl = (coolUrl?: string) =>
  coolUrl ? `https://hrej.cz/game/${coolUrl}` : undefined;

export type DateCheck = {
  game: Game;
  /** Datum, ktere by melo platit podle IGDB. */
  igdbDate: string;
  hrej: HrejGame | null;
};

/**
 * Projde hry s presnym datem vydani a porovna je s hrejem. Bezi po peticich,
 * aby to nebylo 30 requestu za sebou ani 30 naraz.
 */
export async function compareReleaseDates(
  games: Game[],
  onProgress?: (done: number, total: number) => void,
): Promise<{
  mismatched: DateCheck[];
  missing: Game[];
  checked: number;
  /** Dotazy, ktere selhaly — bez toho by hra vypadala jako neznama. */
  failed: number;
}> {
  const exact = games.filter(
    (game) => game.date_format === 0 && game.first_release_date != null,
  );
  const mismatched: DateCheck[] = [];
  const missing: Game[] = [];
  let failed = 0;
  let done = 0;

  for (let start = 0; start < exact.length; start += 5) {
    const batch = exact.slice(start, start + 5);
    const found = await Promise.all(
      batch.map((game) =>
        findHrejGame(
          game.name,
          new Date((game.first_release_date ?? 0) * 1000).getUTCFullYear(),
        ).catch(() => {
          failed += 1;
          return undefined;
        }),
      ),
    );

    batch.forEach((game, index) => {
      const hrej = found[index];
      const igdbDate = releaseDatePlan(game)?.releaseDate;
      // `undefined` = dotaz selhal, `null` = hrej hru nezna.
      if (!igdbDate || hrej === undefined) return;

      if (!hrej) missing.push(game);
      else if (day(hrej.releaseDate) !== day(igdbDate)) {
        mismatched.push({ game, igdbDate, hrej });
      }
    });

    done += batch.length;
    onProgress?.(done, exact.length);
  }

  return { mismatched, missing, checked: exact.length, failed };
}

/**
 * Prepise datum vydani. Posilame cely objekt tak, jak prisel z GET, a k tomu
 * odvozena `*Id` pole — kdyby update DTO cetlo jen ta, nevynulovalo by
 * vyvojare, zanry ani obalku.
 */
export async function updateReleaseDate(
  hrej: HrejGame,
  releaseDate: string,
): Promise<void> {
  const related = <T>(value: unknown) => (value ?? []) as { id: T }[];

  const payload = {
    ...hrej,
    developerId: (hrej.developer as { id: number } | null)?.id ?? null,
    publisherId: (hrej.publisher as { id: number } | null)?.id ?? null,
    genreIds: related<number>(hrej.genres).map((item) => item.id),
    platformIds: related<number>(hrej.platforms).map((item) => item.id),
    localizationIds: related<number>(hrej.localizations).map((item) => item.id),
    mainImageId: (hrej.mainImage as { id: number } | null)?.id ?? null,
    releaseDate,
    displayJustReleaseYear: false,
  };

  const response = await fetch("/api/hrej/games", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await unwrap(response);
}

export type CreatedGame = {
  id?: number;
  coolUrl?: string;
  title?: string;
  /** Hra vznikla, ale obrazek se k ni nepodarilo pripojit. */
  imageWarning?: string;
};

/**
 * Doplni obrazku vazbu na hru. Musi se to delat az po vytvoreni hry, protoze
 * driv `gameId` neexistuje. `file` a `area` posilame null — obrazek uz je
 * nahrany a nechceme ho prekreslovat.
 */
async function attachGameToImage(
  imageId: number,
  gameId: number,
  title: string,
): Promise<void> {
  const response = await fetch(`/api/hrej/images/${imageId}?locale=cs`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      origin: "HUMAN_MADE",
      tagIds: [],
      gameId,
      file: null,
      area: null,
      forceGenerateVariants: false,
    }),
  });
  await unwrap(response);
}

/**
 * Zretezeny zapis: obalka → hra s jejim `mainImageId` → zpetna vazba
 * `gameId` u obrazku. Kdyz selze druhy krok, obrazek na hreji uz zustane
 * nahrany; kdyz treti, hra existuje a hlasime to jen jako varovani.
 */
export async function createGame(
  game: Game,
  cover: Blob,
  plan: GamePlan,
  edits: {
    description: string;
    genreIds: number[];
    type: GameType;
    parentGameId: number | null;
    developerId: number | null;
    publisherId: number | null;
  },
): Promise<CreatedGame> {
  if (edits.type === "DLC" && !edits.parentGameId) {
    throw new Error("DLC musí mít vybranou rodičovskou hru");
  }

  const mainImageId = await uploadCover(game, cover);

  const response = await fetch("/api/hrej/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...plan.payload,
      // Prazdne `cs` hrej odmita jako blank, radeji klic vubec neposilame.
      text: edits.description ? { cs: edits.description } : {},
      genreIds: edits.genreIds,
      developerId: edits.developerId,
      publisherId: edits.publisherId,
      type: edits.type,
      parentGameId: edits.type === "DLC" ? edits.parentGameId : null,
      mainImageId,
    }),
  });

  const created = (await unwrap(response)) as CreatedGame;
  if (!created.id) {
    return {
      ...created,
      imageWarning: "Hra nevrátila id, obrázek zůstal bez vazby",
    };
  }

  try {
    await attachGameToImage(mainImageId, created.id, coverName(game));
    return created;
  } catch (error) {
    // Hra uz existuje, takze to neni duvod cely zapis oznacit za neuspesny.
    return { ...created, imageWarning: (error as Error).message };
  }
}

/**
 * Chystane hry z Hrej. Sestupne razeni podle data da budouci hry na zacatek,
 * takze staci strankovat, dokud se nedostaneme do minulosti.
 */
/** Obdobi ve dnech; `to` je vylucne. `null` = od dneska dal. */
export type Period = { from: string; to: string } | null;

/**
 * Hry z Hrej v danem obdobi. Sestupne razeni podle data znamena, ze stacime
 * strankovat, dokud se nedostaneme pod spodni hranici.
 */
async function fetchHrejGamesInPeriod(period: Period): Promise<HrejGame[]> {
  const today = new Date().toISOString().slice(0, 10);
  const lowerBound = period ? period.from : today;
  const games: HrejGame[] = [];

  for (let offset = 0; offset < 2000; offset += 100) {
    const params = new URLSearchParams({
      limit: "100",
      offset: String(offset),
      sort: "-releaseDate",
      locale: "cs",
    });
    const data = await unwrap(await fetch(`/api/hrej/games?${params}`));
    const page = (Array.isArray(data) ? data : []) as HrejGame[];
    if (!page.length) break;

    games.push(
      ...page.filter((game) => {
        const date = day(game.releaseDate) ?? "";
        if (!date) return false;
        return period ? date >= period.from && date < period.to : date > today;
      }),
    );

    // Posledni hra na strance je uz pod hranici, dal nema smysl chodit.
    if ((day(page[page.length - 1].releaseDate) ?? "") < lowerBound) break;
  }

  return games;
}

/**
 * Opacny pruch: bere chystane hry z hreje a hleda je v IGDB. Odhali i hry,
 * ktere v nasem vypisu nejsou (napr. pod hranici sledujicich), takze by je
 * porovnani od IGDB minulo.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * IGDB pousti ctyri dotazy za sekundu. Pri stovkach hledani se limit projevi
 * a bez opakovani by kazde odmitnuti vypadalo jako „hru neznam“.
 */
async function searchIgdbWithRetry(title: string): Promise<Game[] | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await searchIgdbGames(title);
    } catch {
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

export async function compareHrejCalendar(
  onProgress?: (done: number, total: number) => void,
  period: Period = null,
): Promise<{
  mismatched: DateCheck[];
  checked: number;
  unmatched: number;
  failed: number;
}> {
  const upcoming = await fetchHrejGamesInPeriod(period);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const mismatched: DateCheck[] = [];
  let unmatched = 0;
  let failed = 0;
  let done = 0;

  /*
   * IGDB pousti ctyri dotazy za sekundu, takze davka ctyr smi trvat nejmene
   * sekundu. Drzet tempo je rychlejsi nez narazet do limitu a opakovat:
   * pri kratsi pauze se cely pruchod protahl na dvojnasobek kvuli retry.
   */
  for (let start = 0; start < upcoming.length; start += 4) {
    const batch = upcoming.slice(start, start + 4);
    const startedAt = Date.now();
    const found = await Promise.all(
      batch.map((game) => searchIgdbWithRetry(game.title)),
    );
    const remaining = 1050 - (Date.now() - startedAt);
    if (remaining > 0 && start + 4 < upcoming.length) await sleep(remaining);

    batch.forEach((hrej, index) => {
      if (found[index] === null) {
        failed += 1;
        return;
      }
      const wanted = normalizeTitle(hrej.title);
      /*
       * Presna shoda nazvu, konkretni den a datum v budoucnosti. Ta posledni
       * podminka je kriticka: u jednoslovnych nazvu ("Skate", "Judas",
       * "Hunger") vraci IGDB stejnojmennou starou hru a bez ni bychom
       * chystanemu titulu nabidli prepsat datum na rok 2007.
       */
      const candidates = (found[index] ?? []).filter((game) => {
        if (normalizeTitle(game.name) !== wanted) return false;
        if (game.date_format !== 0 || game.first_release_date == null) {
          return false;
        }
        // V ramci obdobi rozhoduje obdobi, jinak musi byt datum v budoucnu.
        if (period) {
          const date = new Date(game.first_release_date * 1000)
            .toISOString()
            .slice(0, 10);
          return date >= period.from && date < period.to;
        }
        return game.first_release_date > nowSeconds;
      });
      // Vic stejnojmennych chystanych her nerozhodneme, radeji nechame byt.
      const match = candidates.length === 1 ? candidates[0] : undefined;
      const igdbDate = match ? releaseDatePlan(match)?.releaseDate : undefined;
      if (!match || !igdbDate) {
        unmatched += 1;
        return;
      }
      if (day(igdbDate) !== day(hrej.releaseDate)) {
        mismatched.push({ game: match, igdbDate, hrej });
      }
    });

    done += batch.length;
    onProgress?.(done, upcoming.length);
  }

  return { mismatched, checked: upcoming.length, unmatched, failed };
}
