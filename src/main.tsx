import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { langFromPath, savedLang } from "./i18n";
import { LANG_PREFIX } from "./meta";

/*
 * Kdo si jazyk jednou prepnul, ma ho dostat i na korenove adrese. Podle
 * prohlizece se nepresmerovava zamerne: Googlebot chodi s `en-US` a na „/“
 * musi vzdy videt cestinu, jinak by se cesky obsah do indexu nedostal.
 */
const saved = savedLang();
if (saved === "en" && langFromPath(window.location.pathname) === "cs") {
  const { pathname, search, hash } = window.location;
  window.location.replace(LANG_PREFIX.en + pathname + search + hash);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
