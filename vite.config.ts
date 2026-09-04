import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createIgdbApi } from "./server/igdb.ts";
import { localizedUrl, type View } from "./src/url.ts";
import { LANG_PREFIX, LANGS, META, type Lang } from "./src/meta.ts";

/** Dev server jen zpristupni sdileny modul; produkce ma stejnou logiku ve funkci. */
function igdbPlugin(clientId: string, clientSecret: string): Plugin {
  const api = createIgdbApi(clientId, clientSecret);

  return {
    name: "igdb-api",
    configureServer(server) {
      server.middlewares.use("/api/games", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        try {
          const url = new URL(
            req.originalUrl ?? req.url ?? "/",
            "http://localhost",
          );
          const params = Object.fromEntries(url.searchParams);
          res.end(JSON.stringify(await api.handleGamesQuery(params)));
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
  "Napiš o hře česky dvě až tři věty, dohromady do 450 znaků.",
  "Vycházej z dodaných údajů a z toho, co o hře sám víš; nic si nevymýšlej.",
  "První věta začne názvem hry a řekne, o jaký typ hry jde — žánr urči sám,",
  "popiš ho přirozenou češtinou a doplň, čím je hratelnost specifická:",
  "pohled, klíčové mechaniky, kombinace žánrů.",
  "Druhou větu o studiu piš jen tehdy, když k němu umíš dodat konkrétní",
  "kontext (např. jaké známé hry mají jeho lidé za sebou). Když takový",
  "kontext nemáš nebo si jím nejsi jistý, studio i vydavatele vynech úplně.",
  "Nepiš datum vydání, platformy, hodnocení ani marketingová klišé.",
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

          // Zanry zamerne neposilame — ma si je urcit model sam.
          const facts = [
            `Název: ${game.name}`,
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

/**
 * Absolutni adresy do `<head>` (canonical, og:url, og:image) a do robots.txt
 * se sitemapou. Adresu nechceme mit zadratovanou v kodu: Netlify ji dava
 * v `URL`, lokalne padneme na dev server.
 */
/**
 * Dosadi do sablony `index.html` hodnoty jednoho jazyka. Cesky i anglicky
 * `index.html` vznikaji ze stejneho souboru, takze se hlavicky nemohou
 * rozejit — a texty maji jediny zdroj v `src/meta.ts`.
 */
function fillMeta(html: string, lang: Lang, base: string): string {
  const meta = META[lang];
  return html
    .replaceAll("%SITE_URL%", base)
    .replaceAll("%PREFIX%", LANG_PREFIX[lang])
    .replaceAll("%LANG%", meta.htmlLang)
    .replaceAll("%OG_LOCALE%", meta.ogLocale)
    .replaceAll("%TITLE%", meta.title)
    .replaceAll("%DESCRIPTION%", meta.description)
    .replaceAll("%BRAND%", meta.brand)
    .replaceAll("%OG_IMAGE_ALT%", meta.imageAlt);
}

function seoPlugin(siteUrl: string): Plugin {
  const base = siteUrl.replace(/\/+$/, "");
  let serving = false;
  let outDir = "dist";

  return {
    name: "seo-urls",
    // Musi bezet driv nez Vite resi vlastni `%VAR%` v index.html.
    enforce: "pre",

    configResolved(config) {
      serving = config.command === "serve";
      outDir = config.build.outDir;
    },

    /*
     * V devu dosadime cestinu hned; anglicka verze se v devu pozna z cesty
     * a prelozi se az v prohlizeci, hlavicka zustane ceska. Pri buildu
     * zastupne znacky naopak musi prezit — hlavicku plni `writeBundle`,
     * ktere uz vidi i vlozene odkazy na sbalene skripty.
     */
    transformIndexHtml: (html) =>
      serving
        ? fillMeta(html, "cs", base)
        : html.replaceAll("%SITE_URL%", base),

    /* Dev server nema `/en/index.html` — poslouzi stejny soubor jako korenu. */
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? "/").split("?")[0];
        if (path === "/en" || path === "/en/") req.url = "/";
        next();
      });
    },

    async writeBundle() {
      const template = await readFile(join(outDir, "index.html"), "utf8");

      for (const lang of LANGS) {
        const dir = join(outDir, LANG_PREFIX[lang]);
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, "index.html"),
          fillMeta(template, lang, base),
          "utf8",
        );
      }
    },
    // `generateBundle` bezi jen pri buildu, `transformIndexHtml` i v devu.
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: [
          "User-agent: *",
          "Allow: /",
          // Endpointy nemaji co delat ve vysledcich hledani.
          "Disallow: /api/",
          "",
          `Sitemap: ${base}/sitemap.xml`,
          "",
        ].join("\n"),
      });

      // Vypisy drzime jako stavy a adresu z nich sklada `localizedUrl()`, aby
      // sitemapa nemohla ukazovat jinam, nez kam odkazuje aplikace — a nez
      // kam miri canonical v `syncMeta()`. Kazdy jazyk ma i vlastni nazvy
      // parametru, takze prilepeni prefixu by nestacilo.
      const today = new Date();
      const lastmod = today.toISOString().slice(0, 10);
      // „/“ uz je kalendar aktualniho mesice, dalsi mesice zaciname od pristiho.
      const views: View[] = [];
      for (let offset = 1; offset <= 12; offset += 1) {
        const month = new Date(today.getFullYear(), today.getMonth() + offset);
        views.push({
          kind: "month",
          year: month.getFullYear(),
          month: month.getMonth() + 1,
        });
      }
      for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
        views.push({ kind: "year", year });
      }
      // Vypisy bez konkretniho obdobi — canonical na nich ukazuje sam na sebe.
      views.push({ kind: "undated", year: null });
      views.push({ kind: "upcoming" });

      /* Kazdy vypis existuje v obou jazycich a hlasi se navzajem hreflangem. */
      const localized = LANGS.flatMap((lang) => [
        LANG_PREFIX[lang] + "/",
        ...views.map((view) => localizedUrl(view, true, lang)),
      ]);

      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...localized.flatMap((path) => [
            "  <url>",
            // V XML musi byt `&` escapovany, jinak je sitemapa nevalidni.
            `    <loc>${base}${path.replaceAll("&", "&amp;")}</loc>`,
            `    <lastmod>${lastmod}</lastmod>`,
            "    <changefreq>daily</changefreq>",
            "  </url>",
          ]),
          "</urlset>",
          "",
        ].join("\n"),
      });
    },
  };
}

/**
 * GoatCounter — merit chceme jen produkci, takze v devu se tag nevklada vubec.
 * Bez kodu webu je plugin necinny, aby build fungoval i bez nej.
 *
 * (Cloudflare Web Analytics neslo pouzit: sdilene sufixy jako `.netlify.app`
 * si u nich nejde zaregistrovat.)
 */
/**
 * Kod webu neni tajny — je videt v HTML kazde stranky, takze ho drzime tady
 * a env promenna slouzi jen k prepnuti na jiny ucet nebo k vypnuti (`0`).
 */
const GOATCOUNTER_SITE = "next-games";

function analyticsPlugin(site = GOATCOUNTER_SITE): Plugin {
  // `GOATCOUNTER_SITE=0` merenim vypne, treba na testovacim deployi.
  const code = site.trim() === "0" ? "" : site.trim();
  // Prijmeme i celou adresu endpointu, kdyby ucet mel vlastni domenu.
  const endpoint = code.includes("//")
    ? code.replace(/\/+$/, "")
    : `https://${code}.goatcounter.com/count`;

  return {
    name: "goatcounter",
    apply: "build",
    transformIndexHtml: () =>
      code
        ? [
            {
              tag: "script",
              attrs: {
                async: true,
                src: "https://gc.zgo.at/count.js",
                "data-goatcounter": endpoint,
              },
              injectTo: "body" as const,
            },
          ]
        : [],
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
      seoPlugin(env.SITE_URL || env.URL || "http://localhost:5173"),
      analyticsPlugin(env.GOATCOUNTER_SITE),
    ],
  };
});
