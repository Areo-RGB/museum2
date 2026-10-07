import { loadManifest } from './cache.js';

/**
 * @typedef {Object} MediaItem
 * @property {string} id        Stable id (bucket key, slot id for uploads, ...)
 * @property {'image'|'video'} kind
 * @property {string} [url]     Remote URL
 * @property {Blob}   [blob]    Local blob (uploads)
 * @property {'collection'|'upload'|'fallback'} source
 * @property {string} title
 * @property {string} subtitle
 * @property {Date|null} [date]
 * @property {string} [period]  Period key, see periodFor()
 */

/**
 * @typedef {Object} Period
 * @property {string} key       e.g. "2023-1-spring"
 * @property {string} label     e.g. "Spring 2023"
 * @property {string} range     e.g. "March – May 2023"
 * @property {number} count     Number of items in the period
 * @property {number} order     Chronological sort key (undated last)
 */

export function kindOf(contentType = '') {
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('image/')) return 'image';
  return null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** Pull a capture date out of common camera / messenger file names. */
export function parseDate(key) {
  const name = key.split('/').pop().replace(/\.[^.]+$/, '');
  const epoch = name.match(/^(\d{13})$/);
  if (epoch) return { date: new Date(+epoch[1]), hasTime: false };
  const whatsapp = name.match(/(\d{4})-(\d{2})-(\d{2}) at (\d{2})\.(\d{2})/);
  const stamp = whatsapp ?? name.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})(?:[-_](\d{2})(\d{2}))?/);
  if (!stamp || +stamp[2] < 1 || +stamp[2] > 12) return null;
  const [, y, mo, d, h, mi] = stamp;
  return { date: new Date(+y, +mo - 1, +d, +(h ?? 0), +(mi ?? 0)), hasTime: h != null };
}

/** Derive a museum-label style caption from a file name. */
export function captionFor(key, kind) {
  const medium = kind === 'video' ? 'Moving image' : 'Photograph';
  const parsed = parseDate(key);
  if (!parsed) {
    const name = key.split('/').pop().replace(/\.[^.]+$/, '');
    return { title: name.replace(/[-_]+/g, ' ').trim(), subtitle: medium, date: null };
  }
  const { date, hasTime } = parsed;
  let title = `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  if (hasTime) title += ` · ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return { title, subtitle: medium, date };
}

const SEASONS = ['Winter', 'Spring', 'Summer', 'Autumn'];
export const UNDATED = 'undated';

/**
 * Meteorological seasons: December belongs to the following year's winter.
 * @param {Date|null} date
 */
export function periodFor(date) {
  if (!date) return { key: UNDATED, label: 'Undated', order: Infinity };
  const month = date.getMonth();
  const year = date.getFullYear() + (month === 11 ? 1 : 0);
  const season = month === 11 ? 0 : Math.floor((month + 1) / 3);
  return { key: `${year}-${season}`, label: `${SEASONS[season]} ${year}`, order: year * 4 + season };
}

function formatRange(dates) {
  if (!dates.length) return 'Date unknown';
  const min = new Date(Math.min(...dates)), max = new Date(Math.max(...dates));
  const m = (d) => MONTHS[d.getMonth()];
  if (min.getFullYear() !== max.getFullYear()) return `${m(min)} ${min.getFullYear()} – ${m(max)} ${max.getFullYear()}`;
  if (min.getMonth() === max.getMonth()) return `${m(min)} ${min.getFullYear()}`;
  return `${m(min)} – ${m(max)} ${max.getFullYear()}`;
}

/**
 * R2 doesn't send `Vary: Origin`, so a plain (non-CORS) fetch of an object can
 * leave a cached copy without CORS headers that later breaks WebGL use of the
 * same URL. A dedicated query string gives our CORS requests their own cache
 * entry; R2 ignores it when resolving the object.
 */
function corsCacheKey(url) {
  return `${url}${url.includes('?') ? '&' : '?'}cors=1`;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * The remote collection described by the R2 manifest. Hands out items like a
 * shuffled deck so frames don't repeat until the collection is exhausted.
 */
export class MediaLibrary {
  /** @param {MediaItem[]} items */
  constructor(items) {
    this.items = items;
    this.deck = [];
  }

  static async load(url) {
    try {
      const manifest = await loadManifest(url);
      const items = (manifest.assets ?? []).flatMap((asset) => {
        const kind = kindOf(asset.contentType);
        if (!kind || !asset.url) return [];
        const caption = captionFor(asset.key, kind);
        return [{
          id: asset.key, kind, url: corsCacheKey(asset.url), source: 'collection', sizeBytes: asset.sizeBytes,
          ...caption, period: periodFor(caption.date).key,
        }];
      });
      return new MediaLibrary(items);
    } catch (err) {
      console.warn('[library] manifest unavailable, using fallback only', err);
      return new MediaLibrary([]);
    }
  }

  get size() { return this.items.length; }

  /** Time periods present in the collection, oldest first, undated last. @returns {Period[]} */
  periods() {
    return this.floors().map(({ months, items, ...p }) => p);
  }

  /**
   * The building's floors: one per period, each with all of its items in
   * chronological order, grouped by month.
   * @returns {(Period & { items: MediaItem[], months: { key: string, label: string, items: MediaItem[] }[] })[]}
   */
  floors() {
    const groups = new Map();
    for (const item of this.items) {
      const p = periodFor(item.date);
      if (!groups.has(p.key)) groups.set(p.key, { ...p, items: [] });
      groups.get(p.key).items.push(item);
    }
    const byDate = (a, b) => (a.date ?? 0) - (b.date ?? 0) || a.id.localeCompare(b.id);
    return [...groups.values()]
      .sort((a, b) => a.order - b.order)
      .map((floor) => {
        const items = floor.items.sort(byDate);
        const months = new Map();
        for (const item of items) {
          const key = item.date ? `${item.date.getFullYear()}-${item.date.getMonth()}` : UNDATED;
          const label = item.date ? MONTHS[item.date.getMonth()] : 'Undated';
          if (!months.has(key)) months.set(key, { key, label, items: [] });
          months.get(key).items.push(item);
        }
        return {
          ...floor, items, count: items.length, months: [...months.values()],
          range: formatRange(items.flatMap((i) => i.date ?? [])),
        };
      });
  }

  byId(id) {
    this._index ??= new Map(this.items.map((i) => [i.id, i]));
    return this._index.get(id) ?? null;
  }

  /**
   * Draw the next item. `accept` lets the caller reject items (e.g. too many
   * videos on screen, or the item is already hanging somewhere).
   * @param {(item: MediaItem) => boolean} [accept]
   */
  draw(accept = () => true) {
    if (!this.items.length) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.deck.length) this.deck = shuffle([...this.items]);
      const index = this.deck.findIndex(accept);
      if (index >= 0) return this.deck.splice(index, 1)[0];
      this.deck = []; // nothing acceptable left in this pass; reshuffle once
    }
    return null;
  }
}
