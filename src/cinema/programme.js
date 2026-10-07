// What the cinema can show. Placeholder films are procedural canvases so the
// room works offline; swap them for real titles by adding entries with
// `source: { type: 'video', url }` (the URL must send CORS headers).

/**
 * @typedef {Object} Film
 * @property {string} id
 * @property {string} title
 * @property {string} meta      Short line under the title
 * @property {{type:'generated', generator:string} | {type:'video', url:string}} source
 */

/** @type {Film[]} */
export const PLACEHOLDER_FILMS = [
  { id: 'leader', title: 'Countdown', meta: 'Academy leader · 0:09 loop', source: { type: 'generated', generator: 'leader' } },
  { id: 'aurora', title: 'Northern Lights', meta: 'Ambient · endless', source: { type: 'generated', generator: 'aurora' } },
  { id: 'starfield', title: 'Hyperspace', meta: 'Sci-fi short · endless', source: { type: 'generated', generator: 'starfield' } },
  { id: 'bars', title: 'Test Pattern No. 5', meta: 'Calibration reel', source: { type: 'generated', generator: 'bars' } },
];

/**
 * Videos from the R2 collection, presented as home movies.
 * @param {import('../media/library.js').MediaLibrary} library
 * @returns {Film[]}
 */
export function collectionFilms(library) {
  return library.items
    .filter((item) => item.kind === 'video')
    .map((item) => ({ id: item.id, title: item.title, meta: 'Home movie · with sound', source: { type: 'video', url: item.url } }));
}
