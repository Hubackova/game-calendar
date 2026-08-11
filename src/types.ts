export type Game = {
  id: number;
  name: string;
  slug?: string;
  url?: string;
  summary?: string;
  /** Pocet "want" hlasu pred vydanim. */
  hypes?: number;
  first_release_date?: number;
  /** Presnost data z IGDB: 0 = den, 1 = mesic, 2 = rok, 3-6 = Q1-Q4, 7 = TBD. */
  date_format?: number;
  total_rating?: number;
  total_rating_count?: number;
  cover?: { image_id: string };
  genres: string[];
  platforms: string[];
  developers: string[];
  publishers: string[];
  /** PEGI hodnoceni, napr. "18". */
  pegi?: string;
  /** Ceske lokalizace: Audio / Subtitles / Interface. */
  czech: string[];
  game_type?: string;
  status?: string;
  parent_game?: string;
  /**
   * Umisteni v popularitnich zebriccich, od nejlepsiho. Plni jen mesicni
   * vypis; hra muze byt ve vic zebriccich nebo v zadnem.
   */
  popularity?: { label: string; rank: number }[];
};
