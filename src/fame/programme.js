/** Entrance floor: a small curated selection, independent of the seasonal archive. */
const BASE = 'https://pub-00ae264180144f48be81477925c676be.r2.dev';

export const FAME_PERIOD = 'hall-of-fame';

export const HALL_OF_FAME_ITEMS = [
  ['WhatsApp Video 2026-10-04 at 18.22.02.mp4', 'Hall of Fame · I', '4 October 2026 · Moving image'],
  ['Timeline 1_prob4.mp4', 'Hall of Fame · II', 'Moving image'],
].map(([key, title, subtitle]) => ({
  id: `fame:${key}`, kind: 'video', source: 'fame', period: FAME_PERIOD, date: null, title, subtitle,
  // Own query string so CORS responses never share a cache entry with plain fetches.
  url: `${BASE}/${encodeURIComponent(key)}?cors=1`,
}));

/** Lettering shown in the featured frame on the end wall. */
export const HALL_OF_FAME_FEATURE = {
  id: 'fame:feature', kind: 'text', text: 'Lionel', source: 'fame', period: FAME_PERIOD, date: null,
  title: 'Lionel', subtitle: 'Hall of Fame',
};

export const HALL_OF_FAME_FLOOR = {
  key: FAME_PERIOD, kind: 'fame', label: 'Hall of Fame', range: 'Entrance floor',
  count: HALL_OF_FAME_ITEMS.length, items: HALL_OF_FAME_ITEMS, featured: HALL_OF_FAME_FEATURE,
  months: [{ key: 'legends', label: 'Hall of Fame', items: HALL_OF_FAME_ITEMS }],
};

export const BACKGROUND_MUSIC_URL = `${BASE}/Twelve_White_Walls.mp3`;
