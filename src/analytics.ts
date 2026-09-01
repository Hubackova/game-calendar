/**
 * GoatCounter. Skript vklada build (viz `analyticsPlugin` ve vite.config.ts),
 * takze v devu ani bez nastaveneho uctu tu nic nebezi — funkce jen mlci.
 *
 * `count.js` odesle pageview jen pri nacteni stranky. Prepnuti mesice je
 * u nas jen `pushState`, takze dalsi zobrazeni musime nahlasit sami.
 */
type GoatCounter = { count?: (vars: { path: string }) => void };

export function countPageview(path: string): void {
  const goatcounter = (window as { goatcounter?: GoatCounter }).goatcounter;
  goatcounter?.count?.({ path });
}
