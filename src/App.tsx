import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import type { Game } from "./types";
import { suggestDescription } from "./gemini";
import { EDITOR_TOOLS } from "./config";
import { loadMarks, saveMarks, type Mark } from "./favorites";
import { applyTheme, currentTheme, loadTheme, type Theme } from "./theme";
import { fetchGamesByIds } from "./igdb";
import {
  HREJ_COVER_HEIGHT,
  HREJ_COVER_WIDTH,
  compareHrejCalendar,
  compareReleaseDates,
  coverName,
  createCompany,
  searchCompanies,
  createGame,
  guessGameType,
  hrejGameUrl,
  planGame,
  searchHrejGamesByTitle,
  searchGamesByTitle,
  renderCover,
  updateReleaseDate,
  uploadCover,
  type DateCheck,
  type ExistingCheck,
  type GamePlan,
  type HrejGame,
  type Period,
  type GameType,
  type HrejRef,
} from "./hrej";

const coverUrl = (imageId: string) =>
  `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${imageId}.jpg`;

const dayFormat = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" });
const monthFormat = new Intl.DateTimeFormat("cs-CZ", {
  month: "long",
  year: "numeric",
});

/**
 * Datum vypisujeme jen tak presne, jak ho IGDB zna. U ctvrtletnich vydani je
 * timestamp posledni den kvartalu, takze bez `date_format` by z „Q1 2027“
 * vzniklo zavadejici „31. 3. 2027“.
 */
const releaseDate = (game: Game) => {
  const { first_release_date: timestamp, date_format: precision } = game;
  if (timestamp == null || precision === 7) return "datum neznámé";

  const date = new Date(timestamp * 1000);
  if (precision != null && precision >= 3 && precision <= 6) {
    return `Q${precision - 2} ${date.getFullYear()}`;
  }
  if (precision === 2) return String(date.getFullYear());
  if (precision === 1) return monthFormat.format(date);
  return dayFormat.format(date);
};

/** Radek detailu; prazdne hodnoty se nevykresli, aby karta nebyla plna pomlcek. */
function Detail({
  label,
  value,
}: {
  label: string;
  value?: string | string[];
}) {
  const text = Array.isArray(value) ? value.join(", ") : value;
  if (!text) return null;

  return (
    <>
      <dt>{label}</dt>
      <dd>{text}</dd>
    </>
  );
}

/** Sdilene telo potvrzovaciho modalu — Escape a backdrop resi nativni dialog. */
function ConfirmDialog({
  open,
  heading,
  busy,
  confirmDisabled,
  confirmLabel,
  onCancel,
  onConfirm,
  children,
}: {
  open: boolean;
  heading: string;
  busy: boolean;
  confirmDisabled?: boolean;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <dialog ref={dialog} className="confirm" onClose={onCancel}>
      <h3>{heading}</h3>
      <div className="confirm-body">{children}</div>
      <div className="confirm-actions">
        <button type="button" onClick={onCancel} disabled={busy}>
          Zrušit
        </button>
        <button
          type="button"
          className="primary"
          onClick={onConfirm}
          disabled={busy || confirmDisabled}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

/**
 * Upozorneni nad rekapitulaci, jestli hra na hreji uz neni. Podobne nazvy
 * hlasime taky — duplikat vznika typicky prave tehdy, kdyz se presna shoda
 * mine o drobnost („Phantom Blade 0“ vs. „Phantom Blade Zero“).
 */
function ExistsBanner({ existing }: { existing: ExistingCheck }) {
  const link = (game: HrejGame) => {
    const url = hrejGameUrl(game.coolUrl);
    const label = `${game.title}${
      game.releaseDate ? ` (${game.releaseDate.slice(0, 10)})` : ""
    }`;
    return url ? (
      <a href={url} target="_blank" rel="noreferrer">
        {label}
      </a>
    ) : (
      <span>{label}</span>
    );
  };

  if (existing.exact) {
    return (
      <p className="exists exists-found">
        Hra na Hrej <strong>už je</strong>: {link(existing.exact)}
      </p>
    );
  }

  if (existing.similar.length > 0) {
    return (
      <p className="exists exists-similar">
        Přesná shoda nenalezena, ale Hrej má podobné záznamy:{" "}
        {existing.similar.map((game, index) => (
          <span key={game.id}>
            {index > 0 && ", "}
            {link(game)}
          </span>
        ))}
      </p>
    );
  }

  return <p className="exists exists-none">Na Hrej jsem hru nenašla.</p>;
}

/**
 * Radek `developerId` / `publisherId` v rekapitulaci. Firmu lze bud dohledat
 * v ciselniku, nebo zalozit novou — hledani je tu proto, ze IGDB nazvy se
 * casto lisi ("Bandai Namco Entertainment" vs. "BANDAI NAMCO") a slepe
 * zakladani by delalo duplikaty.
 */
function CompanyRow({
  label,
  role,
  found,
  chosen,
  onChosen,
  onError,
}: {
  label: string;
  role: "developer" | "publisher";
  found: { term: string; match: HrejRef | null } | null;
  chosen: HrejRef | null;
  onChosen: (ref: HrejRef) => void;
  onError: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState(found?.term ?? "");
  const [results, setResults] = useState<HrejRef[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = () => {
    const term = query.trim();
    if (!term) return;
    setSearching(true);
    searchCompanies(role, term)
      .then(setResults)
      .catch((err: Error) => {
        console.error(err);
        setResults([]);
        onError(err.message);
      })
      .finally(() => setSearching(false));
  };

  return (
    <>
      <dt>{label}</dt>
      <dd>
        {chosen ? (
          <>
            {chosen.title} ({chosen.id}){" "}
            <button
              type="button"
              className="inline-add"
              onClick={() => setPicking(true)}
            >
              změnit
            </button>
          </>
        ) : (
          <>
            {found ? (
              <>prázdné — „{found.term}“ Hrej nezná </>
            ) : (
              <>prázdné (IGDB neuvádí) </>
            )}
            {found && (
              <button
                type="button"
                className="inline-add"
                disabled={adding}
                onClick={() => {
                  setAdding(true);
                  createCompany(role, found.term)
                    .then(onChosen)
                    .catch((err: Error) => {
                      console.error(err);
                      onError(err.message);
                    })
                    .finally(() => setAdding(false));
                }}
              >
                {adding ? "Zakládám…" : "Přidat na Hrej"}
              </button>
            )}{" "}
            <button
              type="button"
              className="inline-add"
              onClick={() => setPicking(true)}
            >
              najít existující
            </button>
          </>
        )}

        {picking && (
          <div className="company-picker">
            <div className="parent-input">
              <input
                type="search"
                value={query}
                aria-label={`Hledat ${label} v číselníku Hrej`}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  // Jinak by Enter poslal cely dialog.
                  event.preventDefault();
                  search();
                }}
              />
              <button
                type="button"
                onClick={search}
                disabled={searching || !query.trim()}
              >
                {searching ? "Hledám…" : "Hledat"}
              </button>
            </div>
            {results && (
              <ul className="parent-results">
                {results.map((company) => (
                  <li key={company.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChosen(company);
                        setPicking(false);
                        setResults(null);
                      }}
                    >
                      {company.title}{" "}
                      <span className="meta">#{company.id}</span>
                    </button>
                  </li>
                ))}
                {!results.length && <li className="meta">Nic nenalezeno</li>}
              </ul>
            )}
          </div>
        )}
      </dd>
    </>
  );
}

/** Nahled obalky, ktera pujde na hrej — drzi si i vlastni object URL. */
function useCoverPreview() {
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(
    null,
  );

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  return {
    preview,
    show: (blob: Blob) => setPreview({ blob, url: URL.createObjectURL(blob) }),
    clear: () => setPreview(null),
  };
}

const coverSize = `${HREJ_COVER_WIDTH}×${HREJ_COVER_HEIGHT}`;

/**
 * Nahrani samotne obalky. Pred odeslanim ukazeme presne ten JPEG, ktery pujde
 * nahoru — upload zaklada zaznam v cizim CMS, takze chceme potvrzeni.
 */
function UploadCoverButton({ game }: { game: Game }) {
  const [state, setState] = useState<
    "idle" | "preparing" | "confirm" | "uploading" | "done" | "failed"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const { preview, show, clear } = useCoverPreview();
  const open = state === "confirm" || state === "uploading";
  if (!game.cover) return null;

  const close = () => {
    clear();
    setState("idle");
  };

  return (
    <>
      <button
        type="button"
        className="cover-action"
        disabled={state === "preparing" || open}
        title={message ?? `Nahrát obálku na Hrej (${coverSize} JPEG)`}
        aria-label={`Nahrát obálku na Hrej: ${game.name}, ${coverSize}`}
        onClick={() => {
          setState("preparing");
          setMessage(null);
          renderCover(game)
            .then((blob) => {
              show(blob);
              setState("confirm");
            })
            .catch((err: Error) => {
              console.error(err);
              setMessage(err.message);
              setState("failed");
            });
        }}
      >
        {state === "preparing"
          ? "…"
          : state === "failed"
            ? "!"
            : state === "done"
              ? "✓"
              : "↑"}
      </button>

      <ConfirmDialog
        open={open}
        heading="Nahrát obálku na Hrej?"
        busy={state === "uploading"}
        confirmLabel={state === "uploading" ? "Nahrávám…" : "Nahrát"}
        onCancel={close}
        onConfirm={() => {
          if (!preview) return;
          setState("uploading");
          uploadCover(game, preview.blob)
            .then(() => {
              clear();
              setState("done");
            })
            .catch((err: Error) => {
              console.error(err);
              setMessage(err.message);
              clear();
              setState("failed");
            });
        }}
      >
        {preview && <img src={preview.url} alt="" width={160} />}
        <dl className="details">
          <Detail label="Hra" value={game.name} />
          <Detail label="Title" value={coverName(game)} />
          <Detail label="Rozměr" value={`${coverSize} JPEG`} />
          <Detail
            label="Velikost"
            value={
              preview ? `${Math.round(preview.blob.size / 1024)} kB` : undefined
            }
          />
          <Detail label="Varianty" value="forceGenerateVariants: true" />
        </dl>
      </ConfirmDialog>
    </>
  );
}

/** Popisek dohledaneho ciselniku: `Rebel Wolves (2951)` nebo varovani. */
const refLabel = (
  found: { term: string; match: { id: number; title: string } | null } | null,
) => {
  if (!found) return "prázdné (IGDB neuvádí)";
  if (!found.match) return `prázdné — „${found.term}“ Hrej nezná`;
  return `${found.match.title} (${found.match.id})`;
};

/**
 * Zalozeni hry na hreji. Ciselniky dohledame jeste pred potvrzenim, aby modal
 * ukazal skutecna id; potvrzeni pak nahraje obalku a hned zapise hru.
 */
function NewGameButton({ game }: { game: Game }) {
  const [state, setState] = useState<
    "idle" | "preparing" | "confirm" | "sending" | "done" | "failed"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [plan, setPlan] = useState<GamePlan | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  /** hrej odmita prazdny `text.cs`, popis proto pise clovek tady. */
  const [description, setDescription] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  /** Zanry navrzene mapovanim, clovek je v modalu upravuje. */
  const [genres, setGenres] = useState<HrejRef[]>([]);
  const [gameType, setGameType] = useState<GameType>("GAME");
  /** Firmy dohledane v ciselniku, pripadne cerstve zalozene. */
  const [developer, setDeveloper] = useState<HrejRef | null>(null);
  const [publisher, setPublisher] = useState<HrejRef | null>(null);
  /** Rodicovska hra pro DLC — bez ni zapis nepustime. */
  const [parent, setParent] = useState<HrejRef | null>(null);
  const [parentQuery, setParentQuery] = useState("");
  const [parentResults, setParentResults] = useState<HrejRef[] | null>(null);
  const [searchingParent, setSearchingParent] = useState(false);

  const searchParent = () => {
    const query = parentQuery.trim();
    if (!query) return;
    setSearchingParent(true);
    searchGamesByTitle(query)
      .then(setParentResults)
      .catch((err: Error) => {
        console.error(err);
        setParentResults([]);
      })
      .finally(() => setSearchingParent(false));
  };
  const { preview, show, clear } = useCoverPreview();
  const open = state === "confirm" || state === "sending";
  if (!game.cover) return null;

  const close = () => {
    clear();
    setPlan(null);
    setState("idle");
  };

  return (
    <>
      <button
        type="button"
        className="cover-action"
        disabled={state === "preparing" || open}
        title={
          message ??
          created ??
          "Založit hru na Hrej (nahraje obálku a vytvoří záznam)"
        }
        aria-label={`Založit hru na Hrej: ${game.name}`}
        onClick={() => {
          setState("preparing");
          setMessage(null);
          Promise.all([renderCover(game), planGame(game)])
            .then(([blob, prepared]) => {
              show(blob);
              setPlan(prepared);
              setGenres(prepared.genres.suggested);
              setGameType(guessGameType(game));
              setDeveloper(prepared.developer?.match ?? null);
              setPublisher(prepared.publisher?.match ?? null);
              setState("confirm");
            })
            .catch((err: Error) => {
              console.error(err);
              setMessage(err.message);
              setState("failed");
            });
        }}
      >
        {state === "preparing" || state === "sending"
          ? "…"
          : state === "failed"
            ? "!"
            : state === "done"
              ? "✓"
              : "+"}
      </button>

      <ConfirmDialog
        open={open}
        heading="Založit hru na Hrej?"
        busy={state === "sending"}
        confirmDisabled={gameType === "DLC" && !parent}
        confirmLabel={state === "sending" ? "Zakládám…" : "Vytvořit hru"}
        onCancel={close}
        onConfirm={() => {
          if (!preview || !plan) return;
          setState("sending");
          createGame(game, preview.blob, plan, {
            description: description.trim(),
            genreIds: genres.map((genre) => genre.id),
            type: gameType,
            parentGameId: parent?.id ?? null,
            developerId: developer?.id ?? null,
            publisherId: publisher?.id ?? null,
          })
            .then((result) => {
              const label = `Vytvořeno: ${result.coolUrl ?? result.id ?? "bez id"}`;
              setCreated(
                result.imageWarning
                  ? `${label} — obrázek se nepodařilo připojit: ${result.imageWarning}`
                  : label,
              );
              close();
              // Hra vznikla i s varovanim, jen upozornime vykricnikem.
              setState(result.imageWarning ? "failed" : "done");
            })
            .catch((err: Error) => {
              console.error(err);
              setMessage(err.message);
              clear();
              setPlan(null);
              setState("failed");
            });
        }}
      >
        {/* Nahore, at je videt driv nez cokoli dalsiho. */}
        {plan && <ExistsBanner existing={plan.existing} />}
        {preview && <img src={preview.url} alt="" width={130} />}
        {plan && (
          <dl className="details">
            <Detail label="title" value={plan.payload.title} />
            <Detail
              label="platformIds"
              value={plan.platforms.map((found) => refLabel(found)).join(", ")}
            />
            <CompanyRow
              label="developerId"
              role="developer"
              found={plan.developer}
              chosen={developer}
              onChosen={setDeveloper}
              onError={setMessage}
            />
            <CompanyRow
              label="publisherId"
              role="publisher"
              found={plan.publisher}
              chosen={publisher}
              onChosen={setPublisher}
              onError={setMessage}
            />
            <Detail
              label="IGDB žánry"
              value={game.genres.length ? game.genres : "žádné"}
            />
            <Detail
              label="pegiRating"
              value={
                plan.payload.pegiRating == null
                  ? "null (IGDB neuvádí)"
                  : String(plan.payload.pegiRating)
              }
            />
            <Detail
              label="releaseDate"
              value={plan.payload.releaseDate ?? "null"}
            />
            <Detail
              label="displayJustReleaseYear"
              value={String(plan.payload.displayJustReleaseYear)}
            />
            <Detail label="mainImageId" value={`z obálky ${coverName(game)}`} />
          </dl>
        )}

        <div className="game-type">
          <span className="field-label">
            type {game.game_type && <>— IGDB uvádí „{game.game_type}“</>}
          </span>
          <select
            value={gameType}
            aria-label="Typ záznamu"
            onChange={(event) => {
              setGameType(event.target.value as GameType);
              setParentResults(null);
            }}
          >
            <option value="GAME">GAME — samostatná hra</option>
            <option value="DLC">DLC — rozšíření</option>
          </select>

          {gameType === "DLC" && (
            <div className="parent-search">
              <span className="field-label">
                parentGameId — vyber rodičovskou hru z databáze Hrej
              </span>
              {parent ? (
                <ul className="chips">
                  <li>
                    {parent.title} ({parent.id})
                    <button
                      type="button"
                      aria-label="Zrušit výběr rodičovské hry"
                      onClick={() => setParent(null)}
                    >
                      ×
                    </button>
                  </li>
                </ul>
              ) : (
                <>
                  <div className="parent-input">
                    <input
                      type="search"
                      value={parentQuery}
                      placeholder="Název hry na Hrej…"
                      aria-label="Hledat rodičovskou hru"
                      onChange={(event) => setParentQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        // Jinak by Enter poslal cely dialog.
                        event.preventDefault();
                        searchParent();
                      }}
                    />
                    <button
                      type="button"
                      onClick={searchParent}
                      disabled={searchingParent || !parentQuery.trim()}
                    >
                      {searchingParent ? "Hledám…" : "Hledat"}
                    </button>
                  </div>
                  {parentResults && (
                    <ul className="parent-results">
                      {parentResults.map((candidate) => (
                        <li key={candidate.id}>
                          <button
                            type="button"
                            onClick={() => setParent(candidate)}
                          >
                            {candidate.title}{" "}
                            <span className="meta">#{candidate.id}</span>
                          </button>
                        </li>
                      ))}
                      {!parentResults.length && (
                        <li className="meta">Nic nenalezeno</li>
                      )}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {plan && (
          <div className="genres">
            <span className="field-label">
              genreIds — namapované z IGDB, uprav podle potřeby
            </span>
            <ul className="chips">
              {genres.map((genre) => (
                <li key={genre.id}>
                  {genre.title}
                  <button
                    type="button"
                    aria-label={`Odebrat žánr ${genre.title}`}
                    onClick={() =>
                      setGenres((current) =>
                        current.filter((item) => item.id !== genre.id),
                      )
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
              {!genres.length && <li className="empty">žádný žánr</li>}
            </ul>
            <select
              value=""
              aria-label="Přidat žánr"
              onChange={(event) => {
                const added = plan.genres.catalogue.find(
                  (genre) => String(genre.id) === event.target.value,
                );
                if (added) setGenres((current) => [...current, added]);
              }}
            >
              <option value="">Přidat žánr…</option>
              {plan.genres.catalogue
                .filter((genre) => !genres.some((it) => it.id === genre.id))
                .map((genre) => (
                  <option key={genre.id} value={genre.id}>
                    {genre.title}
                  </option>
                ))}
            </select>
          </div>
        )}

        <label className="description">
          <span className="field-label">
            text.cs — nepovinné, prázdné pole pošle jen{" "}
            <code>{"text: {}"}</code>{" "}
            <button
              type="button"
              className="inline-add"
              disabled={suggesting}
              onClick={() => {
                setSuggesting(true);
                setMessage(null);
                suggestDescription(game)
                  .then(setDescription)
                  .catch((err: Error) => {
                    console.error(err);
                    setMessage(err.message);
                  })
                  .finally(() => setSuggesting(false));
              }}
            >
              {suggesting ? "Píšu…" : "Navrhnout přes Gemini"}
            </button>
          </span>
          <textarea
            value={description}
            rows={4}
            placeholder="Český popis hry…"
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
      </ConfirmDialog>
    </>
  );
}

const WEEKDAYS = ["po", "út", "st", "čt", "pá", "so", "ne"];

/** Den v mesici, na ktery hra pripada; jen u presneho data. */
const dayOfMonth = (game: Game) =>
  game.date_format === 0 && game.first_release_date != null
    ? new Date(game.first_release_date * 1000).getUTCDate()
    : null;

/** Jedna hra v policku kalendare — jen obalka, nazev je v tooltipu. */
function CalendarEntry({
  game,
  onOpen,
}: {
  game: Game;
  onOpen: (game: Game) => void;
}) {
  return (
    <li className="cal-game">
      <button
        type="button"
        className="cal-open"
        title={`${game.name} — ${releaseDate(game)}`}
        onClick={() => onOpen(game)}
      >
        {game.cover ? (
          <img src={coverUrl(game.cover.image_id)} alt={game.name} width={64} />
        ) : (
          // Bez obalky by policko zustalo prazdne, tady nazev smysl ma.
          <span className="cal-noimg">{game.name}</span>
        )}
      </button>
    </li>
  );
}

/** Detail hry po kliknuti v kalendari. */
function GameDialog({
  game,
  mark,
  onMark,
  onClose,
}: {
  game: Game | null;
  mark: Mark | undefined;
  onMark: (id: number, mark: Mark) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (game) dialog.current?.showModal();
    else dialog.current?.close();
  }, [game]);

  return (
    <dialog ref={dialog} className="confirm game-detail" onClose={onClose}>
      <h3>
        {game?.name ?? ""}
        {game && (
          <MarkButtons
            name={game.name}
            mark={mark}
            onMark={(next) => onMark(game.id, next)}
          />
        )}
      </h3>
      <div className="confirm-body">
        {game && (
          <div className="detail-body">
            {game.cover && (
              <img src={coverUrl(game.cover.image_id)} alt="" width={200} />
            )}
            <div className="detail-text">
              <dl className="details">
                <Detail label="Vydání" value={releaseDate(game)} />
                <Detail label="Vývojář" value={game.developers} />
                <Detail label="Vydavatel" value={game.publishers} />
                <Detail label="Platformy" value={game.platforms} />
                <Detail label="Žánry" value={game.genres} />
                <Detail label="PEGI" value={game.pegi} />
              </dl>
              {game.summary && <p className="detail-summary">{game.summary}</p>}
              {game.url && (
                <p className="detail-link">
                  <a href={game.url} target="_blank" rel="noreferrer">
                    Stránka na IGDB
                  </a>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="confirm-actions">
        <button type="button" onClick={onClose}>
          Zavřít
        </button>
      </div>
    </dialog>
  );
}

/**
 * Mesicni mrizka. Hry s presnym datem sedi ve svem dni, hry se znamym jen
 * mesicem by na prvniho lhaly, takze maji vlastni pasek pod kalendarem.
 */
function CalendarMonth({
  games,
  year,
  month,
  onOpen,
  todayRef,
}: {
  games: Game[];
  year: number;
  month: number;
  onOpen: (game: Game) => void;
  /** Dnesni policko, aby na nej slo po otevreni odscrollovat. */
  todayRef?: React.Ref<HTMLDivElement>;
}) {
  const byDay = new Map<number, Game[]>();
  const withoutDay: Game[] = [];
  for (const game of games) {
    const day = dayOfMonth(game);
    if (day == null) withoutDay.push(game);
    else byDay.set(day, [...(byDay.get(day) ?? []), game]);
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay(): nedele = 0, my chceme pondeli jako prvni sloupec.
  const firstWeekday =
    (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const today = new Date();
  const isThisMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      <div className="calendar">
        {WEEKDAYS.map((day) => (
          <div key={day} className="cal-head">
            {day}
          </div>
        ))}
        {cells.map((day, index) => {
          const isToday = isThisMonth && day === today.getDate();
          return (
            <div
              key={index}
              ref={isToday ? todayRef : undefined}
              className={
                "cal-day" +
                (day === null ? " cal-empty" : "") +
                (isToday ? " cal-today" : "")
              }
            >
              {day !== null && (
                <>
                  <span className="cal-number">{day}</span>
                  <ul className="cal-games">
                    {(byDay.get(day) ?? []).map((game) => (
                      <CalendarEntry
                        key={game.id}
                        game={game}
                        onOpen={onOpen}
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>

      {withoutDay.length > 0 && (
        <div className="cal-loose">
          <span className="field-label">Bez konkrétního dne</span>
          <ul className="cal-games">
            {withoutDay.map((game) => (
              <CalendarEntry key={game.id} game={game} onOpen={onOpen} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * Kalendar pro jeden mesic, nebo pro cely rok — pak jsou mesice pod sebou.
 * Detail hry drzi tahle uroven, aby na dvanact mrizek stacil jeden dialog.
 */
function CalendarView({
  games,
  year,
  month,
  marks,
  onMark,
}: {
  games: Game[];
  year: number;
  /** `null` = cely rok. */
  month: number | null;
  marks: Map<number, Mark>;
  onMark: (id: number, mark: Mark) => void;
}) {
  const [detail, setDetail] = useState<Game | null>(null);
  const todayCell = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (todayCell.current) {
      todayCell.current.scrollIntoView({ block: "center" });
    } else {
      // Obdobi bez dneska — jinak by clovek zustal uprostred predchoziho vypisu.
      window.scrollTo({ top: 0 });
    }
  }, [year, month]);

  const monthOf = (game: Game) =>
    game.first_release_date == null
      ? null
      : new Date(game.first_release_date * 1000).getUTCMonth() + 1;

  const months = month
    ? [month]
    : Array.from({ length: 12 }, (_, index) => index + 1);

  return (
    <>
      {months.map((current) => (
        <section key={current} className="cal-month">
          {month === null && (
            <h2 className="cal-month-title">
              {MONTHS[current - 1]} {year}
            </h2>
          )}
          <CalendarMonth
            games={games.filter((game) => monthOf(game) === current)}
            year={year}
            month={current}
            onOpen={setDetail}
            todayRef={todayCell}
          />
        </section>
      ))}

      <GameDialog
        game={detail}
        mark={detail ? marks.get(detail.id) : undefined}
        onMark={onMark}
        onClose={() => setDetail(null)}
      />
    </>
  );
}

/** Ikona zarovky; jako SVG, at ji lze barvit pres `currentColor`. */
function BulbIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9 21h6v-1H9v1zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zm-2 16h4v1h-4v-1z"
      />
    </svg>
  );
}

/**
 * Znacky u hry. Hra muze mit jen jednu, takze kliknuti na druhou tu prvni
 * prepne — proto jedna komponenta pro obe, ne dve nezavisla tlacitka.
 */
function MarkButtons({
  name,
  mark,
  onMark,
}: {
  name: string;
  mark: Mark | undefined;
  onMark: (mark: Mark) => void;
}) {
  return (
    <>
      <button
        type="button"
        className={mark === "fav" ? "mark mark-fav-on" : "mark"}
        aria-pressed={mark === "fav"}
        title={mark === "fav" ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
        aria-label={`Oblíbené: ${name}`}
        onClick={() => onMark("fav")}
      >
        ♥
      </button>
      <button
        type="button"
        className={mark === "interest" ? "mark mark-int-on" : "mark"}
        aria-pressed={mark === "interest"}
        title={mark === "interest" ? "Už mě nezajímá" : "Zajímá mě"}
        aria-label={`Zajímá mě: ${name}`}
        onClick={() => onMark("interest")}
      >
        <BulbIcon />
      </button>
    </>
  );
}

/** Kompaktni pasek cisel v hlavicce vysledku. */
function Stats({
  items,
}: {
  items: { value: number; label: string; tone?: "bad" }[];
}) {
  return (
    <ul className="stats">
      {items.map((item) => (
        <li key={item.label} className={item.tone}>
          <strong>{item.value}</strong> {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Radek nesedicího data: ukazuje, ktery hrej zaznam se prepise. */
function MismatchRow({ check }: { check: DateCheck }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "failed">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  /** Po uspesne oprave uz na hreji plati datum z IGDB. */
  const [savedDate, setSavedDate] = useState<string | null>(null);

  const hrejDate = check.hrej?.releaseDate?.slice(0, 10) ?? "—";
  const igdbDate = check.igdbDate.slice(0, 10);
  const url = hrejGameUrl(check.hrej?.coolUrl);

  return (
    <li>
      <div>
        <strong>{check.game.name}</strong>
        <div className="meta">
          {/* Bez nazvu zaznamu by clovek klikal na Opravit naslepo. */}
          Hrej:{" "}
          {url ? (
            <a href={url} target="_blank" rel="noreferrer">
              {check.hrej?.title}
            </a>
          ) : (
            (check.hrej?.title ?? "—")
          )}{" "}
          {savedDate ? (
            <>
              <span className="was">{hrejDate}</span> → {savedDate} ✓
            </>
          ) : (
            <>
              {hrejDate} → IGDB: {igdbDate}
            </>
          )}
          {message && <span className="error"> · {message}</span>}
        </div>
      </div>
      <button
        type="button"
        disabled={state === "saving" || state === "done"}
        onClick={() => {
          if (!check.hrej) return;
          setState("saving");
          setMessage(null);
          updateReleaseDate(check.hrej, check.igdbDate)
            .then(() => {
              setSavedDate(igdbDate);
              setState("done");
            })
            .catch((err: Error) => {
              console.error(err);
              setMessage(err.message);
              setState("failed");
            });
        }}
      >
        {state === "saving"
          ? "Ukládám…"
          : state === "done"
            ? "Opraveno ✓"
            : state === "failed"
              ? "Zkusit znovu"
              : "Opravit"}
      </button>
    </li>
  );
}

/**
 * Hra, kterou automaticke parovani na Hrej nenaslo. Da se dohledat rucne —
 * treba proto, ze ji Hrej vede pod jinym nazvem. Vysledek je jen informace,
 * parovani by nemelo smysl, protoze se nikam neuklada.
 */
function MissingRow({ game }: { game: Game }) {
  const [query, setQuery] = useState(game.name);
  const [results, setResults] = useState<HrejGame[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = () => {
    const term = query.trim();
    if (!term) return;
    setSearching(true);
    searchHrejGamesByTitle(term)
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  };

  return (
    <li className="missing-row">
      <div className="missing-row-content">
        <div className="row-head">
          <strong>{game.name}</strong>
          <span className="meta">{releaseDate(game)}</span>
        </div>

        <div className="parent-input">
          <input
            type="search"
            value={query}
            aria-label={`Najít ${game.name} na Hrej`}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // Jinak by Enter poslal cely dialog.
              event.preventDefault();
              search();
            }}
          />
          <button
            type="button"
            onClick={search}
            disabled={searching || !query.trim()}
          >
            {searching ? "Hledám…" : "Najít na Hrej"}
          </button>
        </div>

        {results && (
          <ul className="found-list">
            {results.map((found) => (
              <li key={found.id}>
                {found.title}{" "}
                <span className="meta">
                  {found.releaseDate?.slice(0, 10) ?? "bez data"}
                </span>
              </li>
            ))}
            {!results.length && (
              <li className="meta empty">Hrej nic podobného nemá</li>
            )}
          </ul>
        )}
      </div>

      {game.cover ? (
        <NewGameButton game={game} />
      ) : (
        // Bez obalky nemame co nahrat, a tim ani mainImageId.
        <span className="meta">bez obálky</span>
      )}
    </li>
  );
}

type CompareResult = Awaited<ReturnType<typeof compareReleaseDates>>;
type ReverseResult = Awaited<ReturnType<typeof compareHrejCalendar>>;

/** Porovnani dat vydani mezi vypsanymi IGDB hrami a hrejem. */
function CompareButton({
  games,
  period,
  periodLabel,
}: {
  games: Game[];
  /** Druha faze projde kalendar Hrej jen za tohle obdobi. */
  period: Period;
  periodLabel: string;
}) {
  const [state, setState] = useState<"idle" | "running" | "open" | "failed">(
    "idle",
  );
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<CompareResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** Druha faze: hrej kalendar -> IGDB, na vyzadani (184 dotazu do IGDB). */
  const [reverse, setReverse] = useState<ReverseResult | null>(null);
  const [reverseState, setReverseState] = useState<
    "idle" | "running" | "failed"
  >("idle");
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (state === "open") dialog.current?.showModal();
    else dialog.current?.close();
  }, [state]);

  return (
    <>
      <button
        type="button"
        className="compare"
        disabled={state === "running" || !games.length}
        title={message ?? "Porovnat data vydání s Hrej"}
        onClick={() => {
          setState("running");
          setMessage(null);
          setProgress({ done: 0, total: 0 });
          compareReleaseDates(games, (done, total) =>
            setProgress({ done, total }),
          )
            .then((compared) => {
              setResult(compared);
              setState("open");
            })
            .catch((err: Error) => {
              console.error(err);
              setMessage(err.message);
              setState("failed");
            });
        }}
      >
        {state === "running"
          ? `Porovnávám ${progress.done}/${progress.total}…`
          : "Porovnat"}
      </button>

      <dialog
        ref={dialog}
        className="confirm compare-result"
        onClose={() => setState("idle")}
      >
        <h3>Porovnání dat vydání</h3>
        <div className="confirm-body">
          {result && (
            <>
              <Stats
                items={[
                  { value: result.checked, label: "zkontrolováno" },
                  {
                    value: result.mismatched.length,
                    label: "nesedí",
                    tone: result.mismatched.length ? "bad" : undefined,
                  },
                  { value: result.missing.length, label: "Hrej nezná" },
                  ...(result.failed
                    ? [
                        {
                          value: result.failed,
                          label: "dotazů selhalo",
                          tone: "bad" as const,
                        },
                      ]
                    : []),
                ]}
              />

              {result.mismatched.length > 0 && (
                <ul className="mismatches">
                  {result.mismatched.map((check) => (
                    <MismatchRow key={check.game.id} check={check} />
                  ))}
                </ul>
              )}
              {!result.mismatched.length && (
                <p className="all-good">Všechna data sedí 🎉</p>
              )}

              {result.missing.length > 0 && (
                <details>
                  <summary>
                    Nenalezeno na Hrej ({result.missing.length})
                  </summary>
                  <ul className="mismatches">
                    {result.missing.map((game) => (
                      <MissingRow key={game.id} game={game} />
                    ))}
                  </ul>
                </details>
              )}

              <div className="reverse">
                <p className="meta">
                  Zatím se kontrolovaly jen vypsané hry. Druhý průchod vezme hry
                  z kalendáře Hrej ({periodLabel}) a dohledá je v IGDB — najde i
                  ty, které v našem výpisu nejsou.
                </p>
                {reverse ? (
                  <>
                    <Stats
                      items={[
                        { value: reverse.checked, label: "her z Hrej" },
                        {
                          value: reverse.mismatched.length,
                          label: "nesedí",
                          tone: reverse.mismatched.length ? "bad" : undefined,
                        },
                        { value: reverse.unmatched, label: "bez shody v IGDB" },
                        ...(reverse.failed
                          ? [
                              {
                                value: reverse.failed,
                                label: "dotazů selhalo",
                                tone: "bad" as const,
                              },
                            ]
                          : []),
                      ]}
                    />
                    {reverse.mismatched.length > 0 && (
                      <ul className="mismatches">
                        {reverse.mismatched.map((check) => (
                          <MismatchRow
                            key={`r-${check.hrej?.id ?? check.game.id}`}
                            check={check}
                          />
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={reverseState === "running"}
                    onClick={() => {
                      setReverseState("running");
                      setProgress({ done: 0, total: 0 });
                      compareHrejCalendar(
                        (done, total) => setProgress({ done, total }),
                        period,
                      )
                        .then((compared) => {
                          setReverse(compared);
                          setReverseState("idle");
                        })
                        .catch((err: Error) => {
                          console.error(err);
                          setMessage(err.message);
                          setReverseState("failed");
                        });
                    }}
                  >
                    {reverseState === "running"
                      ? `Kontroluji ${progress.done}/${progress.total}…`
                      : `Zkontrolovat kalendář Hrej (${periodLabel})`}
                  </button>
                )}
                {reverseState === "failed" && message && (
                  <p className="error">{message}</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="confirm-actions">
          <button type="button" onClick={() => setState("idle")}>
            Zavřít
          </button>
        </div>
      </dialog>
    </>
  );
}

/** Co je zrovna vypsane — kazdy stav ma vlastni dotaz na /api/games. */
type View =
  | { kind: "upcoming" }
  | { kind: "search"; term: string }
  | { kind: "month"; year: number; month: number }
  | { kind: "year"; year: number }
  /** Hry, u kterych IGDB zna jen rok, kvartal nebo nic. */
  | { kind: "undated"; year: number };

const MONTHS = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

/** Ma vypis navazany rok? Bez nej se v selectu zobrazuje "-". */
const hasPeriod = (view: View): view is Extract<View, { year: number }> =>
  view.kind === "month" || view.kind === "year" || view.kind === "undated";

const pad2 = (value: number) => String(value).padStart(2, "0");

/** Obdobi pro druhou fazi porovnani — musi odpovidat tomu, co je vypsane. */
function comparePeriod(view: View): Period {
  if (view.kind === "month") {
    const nextMonth = view.month === 12 ? 1 : view.month + 1;
    const nextYear = view.month === 12 ? view.year + 1 : view.year;
    return {
      from: `${view.year}-${pad2(view.month)}-01`,
      to: `${nextYear}-${pad2(nextMonth)}-01`,
    };
  }
  if (view.kind === "year" || view.kind === "undated") {
    return { from: `${view.year}-01-01`, to: `${view.year + 1}-01-01` };
  }
  return null;
}

const periodLabel = (view: View) =>
  view.kind === "month"
    ? `${MONTHS[view.month - 1]} ${view.year}`
    : view.kind === "year" || view.kind === "undated"
      ? String(view.year)
      : "od dneška dál";

/** Kolik her ukazat na jedne strance seznamu. */
const PAGE_SIZE = 20;

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
/* Filtrovat do minulosti nema smysl, kalendar se diva dopredu. */
const YEARS = Array.from({ length: 8 }, (_, index) => CURRENT_YEAR + index);

function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ kind: "upcoming" });
  const [inputValue, setInputValue] = useState("");
  /** Rok drzime i mimo `view`, aby sel vybrat driv nez mesic. */
  const [year, setYear] = useState(CURRENT_YEAR);
  /** "hypes" = poradi ze serveru, jinak nazev popularitni metriky. */
  const [sortBy, setSortBy] = useState("hypes");
  /** Kalendarni mrizka dava smysl jen nad jednim mesicem. */
  const [asCalendar, setAsCalendar] = useState(false);
  /** `null` = podle systemu, dokud si clovek nevybere. */
  const [theme, setTheme] = useState<Theme | null>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  /** Znacky u her (srdicko / zarovka); drzi se v localStorage. */
  const [marks, setMarks] = useState<Map<number, Mark>>(loadMarks);
  /** "all" = vse, "fav" = jen srdicko, "both" = srdicko i zajima me. */
  const [markFilter, setMarkFilter] = useState<"all" | "fav" | "both">("all");
  const [page, setPage] = useState(1);
  /** Oznacene hry stazene podle id — nemusi byt v aktualnim vypisu. */
  const [markedGames, setMarkedGames] = useState<Game[]>([]);

  /** Hra ma vzdy jen jednu znacku, takze druha tu prvni prepise. */
  const setMark = (id: number, mark: Mark) =>
    setMarks((current) => {
      const next = new Map(current);
      if (next.get(id) === mark) next.delete(id);
      else next.set(id, mark);
      saveMarks(next);
      return next;
    });

  /**
   * Patri oblibena hra do prave zobrazeneho obdobi? Kalendar i mesicni vypis
   * berou jen presnost na den nebo mesic, „bez data“ naopak jen tu hrubsi.
   */
  const belongsToView = (game: Game) => {
    const timestamp = game.first_release_date;
    if (timestamp == null) return false;
    const date = new Date(timestamp * 1000);
    const precise = game.date_format === 0 || game.date_format === 1;

    if (view.kind === "month") {
      return (
        precise &&
        date.getUTCFullYear() === view.year &&
        date.getUTCMonth() + 1 === view.month
      );
    }
    if (view.kind === "year") {
      return precise && date.getUTCFullYear() === view.year;
    }
    if (view.kind === "undated") {
      return !precise && date.getUTCFullYear() === view.year;
    }
    if (view.kind === "upcoming") return timestamp * 1000 > Date.now();
    return false;
  };

  /** Oblibene doplnujeme na konec, aby serverove poradi zustalo netknute. */
  const listGames = useMemo(
    () => {
      const known = new Set(games.map((game) => game.id));
      const extra = markedGames.filter(
        (game) => !known.has(game.id) && belongsToView(game),
      );
      return extra.length ? [...games, ...extra] : games;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [games, markedGames, view],
  );

  /** Metriky bereme z dat, at je backend muze pridat bez zasahu do UI. */
  const metrics = useMemo(() => {
    const labels: string[] = [];
    listGames.forEach((game) =>
      game.popularity?.forEach((place) => {
        if (!labels.includes(place.label)) labels.push(place.label);
      }),
    );
    return labels;
  }, [listGames]);

  const sortedGames = useMemo(() => {
    if (!metrics.includes(sortBy)) return listGames;
    // Hry mimo top 20 dane metriky umisteni nemaji a padaji nakonec.
    const rank = (game: Game) =>
      game.popularity?.find((place) => place.label === sortBy)?.rank ??
      Number.MAX_SAFE_INTEGER;

    return [...listGames].sort((a, b) => rank(a) - rank(b));
  }, [listGames, metrics, sortBy]);

  const load = useCallback((current: View) => {
    setLoading(true);
    setError(null);
    const url =
      current.kind === "month"
        ? `/api/games?year=${current.year}&month=${current.month}`
        : current.kind === "year"
          ? `/api/games?year=${current.year}&whole=1`
          : current.kind === "undated"
            ? `/api/games?year=${current.year}&undated=1`
            : current.kind === "search"
              ? `/api/games?q=${encodeURIComponent(current.term)}`
              : "/api/games";

    fetch(url)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? res.statusText);
        return data as Game[];
      })
      .then(setGames)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(view);
  }, [load, view]);

  useEffect(() => {
    setPage(1);
  }, [view, sortBy, markFilter]);

  useEffect(() => {
    const ids = [...marks.keys()];
    if (!ids.length) return setMarkedGames([]);

    let cancelled = false;
    fetchGamesByIds(ids)
      .then((loaded) => !cancelled && setMarkedGames(loaded))
      .catch((err: Error) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [marks]);

  /* Bez zvoleneho obdobi se ridime naposledy vybranym rokem. */
  const selectedYear = hasPeriod(view) ? view.year : year;

  const selectPeriod = (value: string) => {
    // Mrizka umi mesic i cely rok; „bez data“ a vychozi vypis uz ne.
    if (value === "" || value === "undated") setAsCalendar(false);
    if (value === "undated") return setView({ kind: "undated", year });
    if (value === "year") return setView({ kind: "year", year });
    const month = Number(value);
    setView(month ? { kind: "month", year, month } : { kind: "upcoming" });
  };

  /** Kalendar potrebuje mesic — kdyz zadny neni, vezmeme nejblizsi povoleny. */
  const toggleCalendar = () => {
    const next = !asCalendar;
    setAsCalendar(next);
    if (next && view.kind !== "month" && view.kind !== "year") {
      const month = selectedYear > CURRENT_YEAR ? 1 : CURRENT_MONTH;
      setInputValue("");
      setView({ kind: "month", year: selectedYear, month });
    }
  };

  const shownGames =
    markFilter === "all"
      ? sortedGames
      : sortedGames.filter((game) => {
          const mark = marks.get(game.id);
          return markFilter === "fav" ? mark === "fav" : mark !== undefined;
        });

  const pageCount = Math.max(1, Math.ceil(shownGames.length / PAGE_SIZE));
  // Po zmene filtru muze byt ulozena stranka mimo rozsah.
  const currentPage = Math.min(page, pageCount);
  const pageGames = shownGames.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const goToPage = (next: number) => {
    setPage(next);
    window.scrollTo({ top: 0 });
  };

  return (
    <>
      <header className="header">
        <div className="header-inner">
          {/* Ve vysledcich hledani by porovnani slo proti necemu jinemu. */}
          {EDITOR_TOOLS && view.kind !== "search" && (
            <CompareButton
              games={games}
              period={comparePeriod(view)}
              periodLabel={periodLabel(view)}
            />
          )}

          <div className="period">
            <select
              /* Bez zvoleneho obdobi rok nic neovlivnuje, proto "-". */
              value={hasPeriod(view) ? view.year : ""}
              aria-label="Rok vydání"
              onChange={(event) => {
                if (!event.target.value) return setView({ kind: "upcoming" });

                const picked = Number(event.target.value);
                setYear(picked);
                if (view.kind === "month") {
                  setView({ kind: "month", year: picked, month: view.month });
                } else if (view.kind === "undated") {
                  setView({ kind: "undated", year: picked });
                } else {
                  // Vyber roku bez obdobi znamena „ukaz mi ten rok“.
                  setView({ kind: "year", year: picked });
                }
              }}
            >
              <option value="">–</option>
              {YEARS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={
                view.kind === "month"
                  ? view.month
                  : view.kind === "undated"
                    ? "undated"
                    : view.kind === "year"
                      ? "year"
                      : ""
              }
              aria-label="Období vydání"
              onChange={(event) => {
                setInputValue("");
                selectPeriod(event.target.value);
              }}
            >
              {/* Prvni volba filtr rusi, proto ma nazev, ne placeholder. */}
              <option value="">Nejočekávanější (bez období)</option>
              <option value="year">celý rok</option>
              {MONTHS.map((_, index) => index + 1)
                // V aktualnim roce nenabizime mesice, ktere uz probehly.
                .filter(
                  (month) =>
                    selectedYear > CURRENT_YEAR || month >= CURRENT_MONTH,
                )
                .map((month) => (
                  <option key={month} value={month}>
                    {MONTHS[month - 1]}
                  </option>
                ))}
              <option value="undated">bez data (rok/kvartál)</option>
            </select>

            <button
              type="button"
              className="view-toggle"
              aria-pressed={asCalendar}
              onClick={toggleCalendar}
            >
              {asCalendar ? "Seznam" : "Kalendář"}
            </button>

            <select
              value={markFilter}
              aria-label="Filtr podle značek"
              onChange={(event) =>
                setMarkFilter(event.target.value as "all" | "fav" | "both")
              }
            >
              <option value="all">Vše</option>
              <option value="fav">Jen ♥</option>
              <option value="both">♥ + zajímá mě</option>
            </select>

            {/* Metriky zna jen mesicni vypis, jinde neni podle ceho radit. */}
            {view.kind !== "upcoming" &&
              view.kind !== "search" &&
              metrics.length > 0 && (
                <select
                  value={metrics.includes(sortBy) ? sortBy : "hypes"}
                  aria-label="Řadit podle"
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  <option value="hypes">Řadit: IGDB sledující</option>
                  {metrics.map((label) => (
                    <option key={label} value={label}>
                      Řadit: {label}
                    </option>
                  ))}
                </select>
              )}
          </div>

          <form
            className="search"
            onSubmit={(event) => {
              event.preventDefault();
              const term = inputValue.trim();
              setView(term ? { kind: "search", term } : { kind: "upcoming" });
            }}
          >
            <input
              type="search"
              value={inputValue}
              placeholder="Hledat hru…"
              aria-label="Hledat hru"
              onChange={(event) => {
                setInputValue(event.target.value);
                // Vymazani inputu vrati vychozi seznam.
                if (event.target.value === "") setView({ kind: "upcoming" });
              }}
            />
            <button type="submit">Hledat</button>
          </form>

          <button
            type="button"
            className="theme-toggle"
            title={
              currentTheme(theme) === "dark"
                ? "Přepnout na denní režim"
                : "Přepnout na noční režim"
            }
            aria-label="Přepnout denní a noční režim"
            onClick={() =>
              setTheme(currentTheme(theme) === "dark" ? "light" : "dark")
            }
          >
            {currentTheme(theme) === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <section className={asCalendar ? "games games-wide" : "games"}>
        {/* Jeden pruh na vsechna hlaseni — drzi vysku, takze stranka neposkakuje. */}
        <p className="status" role="status" aria-live="polite">
          {loading ? (
            "Načítám…"
          ) : error ? (
            <span className="error">{error}</span>
          ) : games.length === 0 ? (
            "Nic nenalezeno — zkus jiný název."
          ) : shownGames.length === 0 && markFilter !== "all" ? (
            "Žádné označené hry v tomto výpisu."
          ) : (
            ""
          )}
        </p>

        {asCalendar && (view.kind === "month" || view.kind === "year") ? (
          <CalendarView
            games={shownGames}
            marks={marks}
            onMark={setMark}
            year={view.year}
            month={view.kind === "month" ? view.month : null}
          />
        ) : (
          <ul className="game-list">
            {pageGames.map((game) => (
              <li key={game.id} className="game">
                {game.cover && (
                  <img
                    src={coverUrl(game.cover.image_id)}
                    alt={game.name}
                    width={180}
                  />
                )}
                <div className="game-body">
                  <h2>
                    {game.url ? (
                      <a href={game.url} target="_blank" rel="noreferrer">
                        {game.name}
                      </a>
                    ) : (
                      game.name
                    )}
                    <MarkButtons
                      name={game.name}
                      mark={marks.get(game.id)}
                      onMark={(next) => setMark(game.id, next)}
                    />
                    {EDITOR_TOOLS && (
                      <>
                        <UploadCoverButton game={game} />
                        <NewGameButton game={game} />
                      </>
                    )}
                  </h2>

                  <p className="meta">
                    {releaseDate(game)}
                    {game.hypes != null && (
                      <span title="Počet lidí, kteří hru na IGDB sledovali před vydáním">
                        {" · "}
                        {game.hypes} IGDB sledujících
                      </span>
                    )}
                    {game.popularity?.map((place) => (
                      <span key={place.label} className="popularity">
                        {place.label} #{place.rank}
                      </span>
                    ))}
                  </p>

                  {game.summary && <p className="summary">{game.summary}</p>}

                  <dl className="details">
                    <Detail label="Žánry" value={game.genres} />
                    <Detail label="Vývojář" value={game.developers} />
                    <Detail label="Platformy" value={game.platforms} />
                  </dl>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!asCalendar && pageCount > 1 && (
          <nav className="pager" aria-label="Stránkování">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              ← Předchozí
            </button>
            <span>
              {currentPage} / {pageCount}
            </span>
            <button
              type="button"
              disabled={currentPage === pageCount}
              onClick={() => goToPage(currentPage + 1)}
            >
              Další →
            </button>
          </nav>
        )}
      </section>
    </>
  );
}

export default App;
