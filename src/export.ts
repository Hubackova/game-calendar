/**
 * Export mesicniho vypisu do PNG. Zamerne to neni snimek obrazovky — mrizka
 * kalendare je na sdileni prilis siroka a prazdna. Kreslime vlastni dlazdici
 * ctyr obalek na radek s dnem v rohu, takze obrazek ma vlastni layout a nema
 * se s CSS kalendare co rozejit.
 *
 * Obalky kreslime v jejich nativnich 264 × 374 (`t_cover_big`), diky cemuz se
 * nikam neskaluje a odpada `devicePixelRatio`. Mesic se ctyriceti hrami vyjde
 * na 1180 × ~4100 px, tedy hluboko pod limitem plátna v iOS Safari.
 */
import {
  CARD_COVER_HEIGHT,
  CARD_COVER_WIDTH,
  GAMEPAD_PATHS,
  GAMEPAD_STROKE,
  GAMEPAD_VIEWBOX,
  coverUrl,
  dayOfMonth,
} from "./game";
import type { Game } from "./types";

const COLS = 4;
const GAP = 20;
const PAD = 32;
const WIDTH = PAD * 2 + COLS * CARD_COVER_WIDTH + (COLS - 1) * GAP;

const HEADER_H = 104;
const FOOTER_H = 64;
/** Vyska pruhu, ktery uvozuje hry bez konkretniho dne. */
const SECTION_H = 60;

/** Vic obalek naraz nema smysl — prohlizec stejne pusti jen nekolik spojeni. */
const CONCURRENCY = 8;

type Palette = {
  bg: string;
  text: string;
  heading: string;
  border: string;
  placeholder: string;
};

/** Export jde za aktualnim motivem, at odpovida tomu, co ma clovek na obrazovce. */
function palette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback;
  return {
    bg: read("--bg", "#fff"),
    text: read("--text", "#6b6375"),
    heading: read("--text-h", "#08060d"),
    border: read("--border", "#e5e4e7"),
    placeholder: read("--code-bg", "#f4f3ec"),
  };
}

/**
 * Obalky nacitame znovu a s `crossOrigin`, protoze bez nej by plátno bylo
 * „tainted“ a `toBlob()` by spadl. IGDB posila `access-control-allow-origin: *`,
 * takze to projde. Stejny atribut je i na `<img>` v rozhrani, jinak by si
 * prohlizec drzel dve cache a stahoval kazdou obalku dvakrat.
 */
function loadCover(game: Game): Promise<HTMLImageElement | null> {
  const imageId = game.cover?.image_id;
  if (!imageId) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    // Hra, ktere se obalka nestahne, dostane stejnou nahradu jako hra bez ni.
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = coverUrl(imageId, "card");
  });
}

async function loadCovers(games: Game[]): Promise<Map<number, HTMLImageElement>> {
  const covers = new Map<number, HTMLImageElement>();
  for (let start = 0; start < games.length; start += CONCURRENCY) {
    const batch = games.slice(start, start + CONCURRENCY);
    const loaded = await Promise.all(batch.map(loadCover));
    loaded.forEach((image, index) => {
      if (image) covers.set(batch[index].id, image);
    });
  }
  return covers;
}

/** Zkrati text na jeden radek a doplni vypustku. */
function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

/** Rozlomi nazev na nejvyse dva radky; co se nevejde, konci vypustkou. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }
  if (line && lines.length < maxLines) lines.push(line);

  const last = lines.length - 1;
  if (lines[last]) lines[last] = ellipsize(ctx, lines[last], maxWidth);
  return lines;
}

/**
 * Nahrada obalky — stejny obrys ovladace jako na webu. Na rozdil od rozhrani
 * tady pod nej kreslime i nazev: v obrazku neni kam najet mysi, takze by z
 * hry zbyl jen sedy obdelnik.
 */
function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  game: Game,
  colors: Palette,
) {
  ctx.fillStyle = colors.placeholder;
  ctx.fillRect(x, y, CARD_COVER_WIDTH, CARD_COVER_HEIGHT);
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, CARD_COVER_WIDTH - 2, CARD_COVER_HEIGHT - 2);

  const size = CARD_COVER_WIDTH * 0.4;
  const scale = size / GAMEPAD_VIEWBOX;
  ctx.save();
  ctx.translate(x + (CARD_COVER_WIDTH - size) / 2, y + CARD_COVER_HEIGHT / 2 - size);
  ctx.scale(scale, scale);
  ctx.strokeStyle = colors.text;
  // `ctx.scale` meni i sirku tahu, takze 1.5 tady znamena totez co v SVG.
  ctx.lineWidth = GAMEPAD_STROKE;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.45;
  for (const path of GAMEPAD_PATHS) ctx.stroke(new Path2D(path));
  ctx.restore();

  ctx.fillStyle = colors.heading;
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  const lines = wrap(ctx, game.name, CARD_COVER_WIDTH - 32, 2);
  lines.forEach((line, index) => {
    ctx.fillText(
      line,
      x + CARD_COVER_WIDTH / 2,
      y + CARD_COVER_HEIGHT / 2 + 34 + index * 26,
    );
  });
  ctx.textAlign = "left";
}

/** Cislo dne v rohu obalky. Tmavy stitek drzi kontrast na svetle i tmave arte. */
function drawDayBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  day: number,
) {
  const label = String(day);
  ctx.font = "700 26px system-ui, sans-serif";
  const width = Math.max(44, ctx.measureText(label).width + 26);
  const height = 42;

  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.beginPath();
  ctx.roundRect(x + 12, y + 12, width, height, 10);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 12 + width / 2, y + 12 + height / 2 + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** Dlazdice obalek; vraci vysku, kterou zabrala. */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  games: Game[],
  covers: Map<number, HTMLImageElement>,
  top: number,
  colors: Palette,
  withDays: boolean,
): number {
  games.forEach((game, index) => {
    const x = PAD + (index % COLS) * (CARD_COVER_WIDTH + GAP);
    const y = top + Math.floor(index / COLS) * (CARD_COVER_HEIGHT + GAP);
    const cover = covers.get(game.id);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, CARD_COVER_WIDTH, CARD_COVER_HEIGHT, 10);
    ctx.clip();
    if (cover) {
      ctx.drawImage(cover, x, y, CARD_COVER_WIDTH, CARD_COVER_HEIGHT);
    } else {
      drawPlaceholder(ctx, x, y, game, colors);
    }
    ctx.restore();

    if (withDays) {
      const day = dayOfMonth(game);
      if (day != null) drawDayBadge(ctx, x, y, day);
    }
  });

  const rows = Math.ceil(games.length / COLS);
  return rows === 0 ? 0 : rows * CARD_COVER_HEIGHT + (rows - 1) * GAP;
}

function download(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Plátno se nepodařilo převést na PNG"));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      // Az po kliknuti — drive by prohlizec stahoval z uvolnene adresy.
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}

export type MonthExport = {
  games: Game[];
  /** Nadpis obrazku, treba „Říjen 2026“. */
  title: string;
  /** Podtitul za pomlckou, treba „chystané hry“. */
  subtitle: string;
  /** Uvod pasu s hrami bez konkretniho dne. */
  looseLabel: string;
  year: number;
  month: number;
};

/**
 * Vykresli mesic a rovnou ho stahne. Rozdeleni na hry s dnem a bez nej je
 * stejne jako v mrizce — hra, u ktere IGDB zna jen mesic, by v rohu s prvnim
 * dnem lhala.
 */
export async function exportMonthPng({
  games,
  title,
  subtitle,
  looseLabel,
  year,
  month,
}: MonthExport): Promise<void> {
  const dated = games
    .filter((game) => dayOfMonth(game) != null)
    .sort((a, b) => dayOfMonth(a)! - dayOfMonth(b)!);
  const loose = games.filter((game) => dayOfMonth(game) == null);

  const covers = await loadCovers([...dated, ...loose]);
  const colors = palette();

  const rowsHeight = (count: number) => {
    const rows = Math.ceil(count / COLS);
    return rows === 0 ? 0 : rows * CARD_COVER_HEIGHT + (rows - 1) * GAP;
  };

  const height =
    HEADER_H +
    rowsHeight(dated.length) +
    (loose.length ? SECTION_H + rowsHeight(loose.length) : 0) +
    FOOTER_H;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Plátno není k dispozici");

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = colors.heading;
  ctx.font = "700 38px system-ui, sans-serif";
  const titleWidth = ctx.measureText(title).width;
  ctx.fillText(title, PAD, 58);
  ctx.fillStyle = colors.text;
  ctx.font = "400 30px system-ui, sans-serif";
  ctx.fillText(`— ${subtitle}`, PAD + titleWidth + 12, 58);

  let cursor = HEADER_H;
  cursor += drawGrid(ctx, dated, covers, cursor, colors, true);

  if (loose.length) {
    cursor += SECTION_H;
    ctx.fillStyle = colors.text;
    ctx.font = "600 24px system-ui, sans-serif";
    ctx.fillText(looseLabel, PAD, cursor - 22);
    cursor += drawGrid(ctx, loose, covers, cursor, colors, false);
  }

  ctx.fillStyle = colors.text;
  ctx.font = "400 24px system-ui, sans-serif";
  ctx.fillText(window.location.host, PAD, height - 24);

  const padded = String(month).padStart(2, "0");
  await download(canvas, `${window.location.host}-${year}-${padded}.png`);
}
