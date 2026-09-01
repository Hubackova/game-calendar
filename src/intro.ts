/**
 * Uvodni vysvetleni se ukazuje jen napoprve. Priznak drzime v localStorage
 * (stejne jako znacky), takze se nikam neposila a plati per prohlizec.
 */
const KEY = "intro-seen";

export function introSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    // Privatni rezim nebo zakazane ukladani — uvod se ukaze, nic se nerozbije.
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* Nezapamatovany uvod je mensi problem nez spadla aplikace. */
  }
}
