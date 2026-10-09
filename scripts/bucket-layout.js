// Where each object lives in the R2 bucket. Collection media is filed by the
// same seasonal period the museum uses for its floors, so every folder under
// `floors/` is one elevator stop:
//
//   floors/2023-1-spring/IMG_20230415_101500.jpg
//   floors/2024-0-winter/VID_20231209_164640.mp4   (December counts as next winter)
//   floors/undated/...
//   hall-of-fame/<curated entrance-floor videos>
//   music/<background music>
//   manifest.json
import { captionFor, kindOf, periodFor, UNDATED } from '../src/media/library.js';
import { HALL_OF_FAME_FILES, HALL_OF_FAME_FOLDER, MUSIC_FOLDER } from '../src/fame/programme.js';

const SEASONS = ['winter', 'spring', 'summer', 'autumn'];

export const MANIFEST_KEY = 'manifest.json';

/** Folder name for a file's floor, sortable chronologically: "2023-1-spring". */
export function floorFolder(key) {
  const period = periodFor(captionFor(key, 'image').date);
  if (period.key === UNDATED) return UNDATED;
  const [year, season] = period.key.split('-');
  return `${year}-${season}-${SEASONS[season]}`;
}

/**
 * The key an object should have, or null when it is obsolete (stray copies of
 * the manifest from earlier uploads).
 */
export function targetKey(key, contentType = '') {
  const name = key.split('/').pop();
  if (name === MANIFEST_KEY) return key === MANIFEST_KEY ? key : null;
  if (HALL_OF_FAME_FILES.includes(name)) return `${HALL_OF_FAME_FOLDER}/${name}`;
  if (contentType.startsWith('audio/')) return `${MUSIC_FOLDER}/${name}`;
  if (kindOf(contentType)) return `floors/${floorFolder(key)}/${name}`;
  return `other/${name}`;
}

/** Public URL for a key: each path segment encoded, slashes kept. */
export function publicUrl(base, key) {
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
