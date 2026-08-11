import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import type { Game } from "./types";
import {
  HREJ_COVER_HEIGHT,
  HREJ_COVER_WIDTH,
  compareReleaseDates,
  coverName,
  createDeveloper,
  createGame,
  guessGameType,
  planGame,
  searchGamesByTitle,
  renderCover,
  updateReleaseDate,
  uploadCover,
  type DateCheck,
  type GamePlan,
  type GameType,
  type HrejRef,
} from "./hrej";

const LOCALIZATION_LABELS: Record<string, string> = {
  Audio: "dabing",
  Subtitles: "titulky",
  Interface: "rozhraní",
};

const coverUrl = (imageId: string) =>
  `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${imageId}.jpg`;

async function downloadCover(game: Game) {
  const objectUrl = URL.createObjectURL(await renderCover(game));
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${coverName(game)}.jpg`;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

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

/** Kolecko u nazvu hry — stazeni obalky nebo jeji nahrani na hrej.cz. */
function CoverButton({
  game,
  icon,
  label,
  action,
}: {
  game: Game;
  icon: string;
  label: string;
  action: (game: Game) => Promise<unknown>;
}) {
  const [state, setState] = useState<"idle" | "pending" | "failed" | "done">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  if (!game.cover) return null;

  const size = `${HREJ_COVER_WIDTH}×${HREJ_COVER_HEIGHT}`;
  return (
    <button
      type="button"
      className="cover-action"
      disabled={state === "pending"}
      title={message ?? `${label} (${size} JPEG)`}
      aria-label={`${label}: ${game.name}, ${size}`}
      onClick={() => {
        setState("pending");
        setMessage(null);
        action(game)
          .then(() => setState("done"))
          .catch((err: Error) => {
            console.error(err);
            setMessage(err.message);
            setState("failed");
          });
      }}
    >
      {state === "pending"
        ? "…"
        : state === "failed"
          ? "!"
          : state === "done"
            ? "✓"
            : icon}
    </button>
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
      {children}
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
        title={message ?? `Nahrát obálku na hrej.cz (${coverSize} JPEG)`}
        aria-label={`Nahrát obálku na hrej.cz: ${game.name}, ${coverSize}`}
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
        heading="Nahrát obálku na hrej.cz?"
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
const refLabel = (found: { term: string; match: { id: number; title: string } | null } | null) => {
  if (!found) return "prázdné (IGDB neuvádí)";
  if (!found.match) return `prázdné — „${found.term}“ hrej nezná`;
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
  /** Zanry navrzene mapovanim, clovek je v modalu upravuje. */
  const [genres, setGenres] = useState<HrejRef[]>([]);
  const [gameType, setGameType] = useState<GameType>("GAME");
  /** Vyvojar dohledany v ciselniku, pripadne cerstve zalozeny. */
  const [developer, setDeveloper] = useState<HrejRef | null>(null);
  const [addingDeveloper, setAddingDeveloper] = useState(false);
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
          "Založit hru na hrej.cz (nahraje obálku a vytvoří záznam)"
        }
        aria-label={`Založit hru na hrej.cz: ${game.name}`}
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
        heading="Založit hru na hrej.cz?"
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
        {preview && <img src={preview.url} alt="" width={120} />}
        {plan && (
          <dl className="details">
            <Detail label="title" value={plan.payload.title} />
            <Detail
              label="platformIds"
              value={plan.platforms
                .map((found) => refLabel(found))
                .join(", ")}
            />
            <dt>developerId</dt>
            <dd>
              {developer ? (
                `${developer.title} (${developer.id})`
              ) : plan.developer ? (
                <>
                  prázdné — „{plan.developer.term}“ hrej nezná{" "}
                  <button
                    type="button"
                    className="inline-add"
                    disabled={addingDeveloper}
                    onClick={() => {
                      const name = plan.developer?.term;
                      if (!name) return;
                      setAddingDeveloper(true);
                      createDeveloper(name)
                        .then(setDeveloper)
                        .catch((err: Error) => {
                          console.error(err);
                          setMessage(err.message);
                        })
                        .finally(() => setAddingDeveloper(false));
                    }}
                  >
                    {addingDeveloper ? "Zakládám…" : "Přidat na hrej"}
                  </button>
                </>
              ) : (
                "prázdné (IGDB neuvádí)"
              )}
            </dd>
            <Detail label="publisherId" value={refLabel(plan.publisher)} />
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
            <Detail
              label="mainImageId"
              value={`z obálky ${coverName(game)}`}
            />
          </dl>
        )}

        <div className="game-type">
          <span className="field-label">
            type{" "}
            {game.game_type && (
              <>— IGDB uvádí „{game.game_type}“</>
            )}
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
                parentGameId — vyber rodičovskou hru z databáze hreje
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
                      placeholder="Název hry na hreji…"
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
            <code>{"text: {}"}</code>
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

/** Radek nesedicího data s moznosti prepsat ho na hreji. */
function MismatchRow({ check }: { check: DateCheck }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "failed">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  return (
    <li>
      <div>
        <strong>{check.game.name}</strong>
        <div className="meta">
          hrej: {check.hrej?.releaseDate?.slice(0, 10) ?? "—"} → IGDB:{" "}
          {check.igdbDate.slice(0, 10)}
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
            .then(() => setState("done"))
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

type CompareResult = Awaited<ReturnType<typeof compareReleaseDates>>;

/** Porovnani dat vydani mezi vypsanymi IGDB hrami a hrejem. */
function CompareButton({ games }: { games: Game[] }) {
  const [state, setState] = useState<"idle" | "running" | "open" | "failed">(
    "idle",
  );
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<CompareResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
        title={message ?? "Porovnat data vydání s hrej.cz"}
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
        {result && (
          <>
            <p className="meta">
              Zkontrolováno {result.checked} her s přesným datem ·{" "}
              {result.mismatched.length} nesedí · {result.missing.length} hrej
              nezná
            </p>

            {result.mismatched.length > 0 && (
              <ul className="mismatches">
                {result.mismatched.map((check) => (
                  <MismatchRow key={check.game.id} check={check} />
                ))}
              </ul>
            )}
            {!result.mismatched.length && <p>Všechna data sedí. 🎉</p>}

            {result.missing.length > 0 && (
              <details>
                <summary>Na hreji nenalezeno ({result.missing.length})</summary>
                <ul className="mismatches">
                  {result.missing.map((game) => (
                    <li key={game.id}>
                      <div>
                        <strong>{game.name}</strong>
                        <div className="meta">{releaseDate(game)}</div>
                      </div>
                      {/* Otevre stejny potvrzovaci modal jako "+" u karty. */}
                      {game.cover ? (
                        <NewGameButton game={game} />
                      ) : (
                        // Bez obalky nemame co nahrat, a tim ani mainImageId.
                        <span className="meta">bez obálky</span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}

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
  | { kind: "month"; year: number; month: number };

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

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, index) => CURRENT_YEAR - 1 + index);

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

  /** Metriky bereme z dat, at je backend muze pridat bez zasahu do UI. */
  const metrics = useMemo(() => {
    const labels: string[] = [];
    games.forEach((game) =>
      game.popularity?.forEach((place) => {
        if (!labels.includes(place.label)) labels.push(place.label);
      }),
    );
    return labels;
  }, [games]);

  const sortedGames = useMemo(() => {
    if (!metrics.includes(sortBy)) return games;
    // Hry mimo top 20 dane metriky umisteni nemaji a padaji nakonec.
    const rank = (game: Game) =>
      game.popularity?.find((place) => place.label === sortBy)?.rank ??
      Number.MAX_SAFE_INTEGER;

    return [...games].sort((a, b) => rank(a) - rank(b));
  }, [games, metrics, sortBy]);

  const load = useCallback((current: View) => {
    setLoading(true);
    setError(null);
    const url =
      current.kind === "month"
        ? `/api/games?year=${current.year}&month=${current.month}`
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

  const selectMonth = (month: number) =>
    setView(month ? { kind: "month", year, month } : { kind: "upcoming" });

  return (
    <section className="games">
      <header className="header">
        {/* Ve vysledcich hledani by porovnani slo proti necemu jinemu. */}
        {view.kind !== "search" && <CompareButton games={games} />}

        <div className="period">
          <select
            value={year}
            aria-label="Rok vydání"
            onChange={(event) => {
              const picked = Number(event.target.value);
              setYear(picked);
              if (view.kind === "month") {
                setView({ kind: "month", year: picked, month: view.month });
              }
            }}
          >
            {YEARS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={view.kind === "month" ? view.month : ""}
            aria-label="Měsíc vydání"
            onChange={(event) => {
              setInputValue("");
              selectMonth(Number(event.target.value));
            }}
          >
            <option value="">Měsíc…</option>
            {MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </select>

          {/* Metriky zna jen mesicni vypis, jinde neni podle ceho radit. */}
          {view.kind === "month" && metrics.length > 0 && (
            <select
              value={metrics.includes(sortBy) ? sortBy : "hypes"}
              aria-label="Řadit podle"
              onChange={(event) => setSortBy(event.target.value)}
            >
              <option value="hypes">Řadit: want hlasy</option>
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
      </header>

      {loading && <p>Načítám…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && games.length === 0 && (
        <p>Nic nenalezeno — zkus jiný název.</p>
      )}

      <ul className="game-list">
        {sortedGames.map((game) => (
          <li key={game.id} className="game">
            {game.cover && (
              <img
                src={coverUrl(game.cover.image_id)}
                alt={game.name}
                width={120}
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
                {game.pegi && <span className="pegi">PEGI {game.pegi}</span>}
                <CoverButton
                  game={game}
                  icon="↓"
                  label="Stáhnout obálku"
                  action={downloadCover}
                />
                <UploadCoverButton game={game} />
                <NewGameButton game={game} />
              </h2>

              <p className="meta">
                {releaseDate(game)}
                {game.hypes != null && ` · ${game.hypes}× want`}
                {game.total_rating != null &&
                  ` · ${Math.round(game.total_rating)} / 100`}
                {game.total_rating_count
                  ? ` (${game.total_rating_count} hodnocení)`
                  : ""}
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
                <Detail label="Vydavatel" value={game.publishers} />
                <Detail label="Platformy" value={game.platforms} />
                <Detail
                  label="Čeština"
                  value={game.czech.map(
                    (type) => LOCALIZATION_LABELS[type] ?? type,
                  )}
                />
                <Detail label="Typ" value={game.game_type} />
                <Detail label="Stav" value={game.status} />
                <Detail label="Součást hry" value={game.parent_game} />
              </dl>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default App;
