/**
 * Redakcni nastroje (porovnani s Hrej, nahrani obalky, zalozeni hry) se
 * zobrazuji jen pri zapnutem prepinaci. Do bundlu se dostane jen hodnota,
 * ne token — zapisy stejne jdou pres proxy dev serveru, ktera v produkcnim
 * buildu vubec neexistuje.
 *
 * Casem tohle nahradi vlastni Hrej token na uzivatele.
 */
export const EDITOR_TOOLS = import.meta.env.VITE_EDITOR_TOOLS === "1";
