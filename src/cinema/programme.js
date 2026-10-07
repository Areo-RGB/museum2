/** Programme independent of the archive manifest. */
export const YOUTUBE_FILMS = [
  ['_Nrxv-wW874', '16:04'], ['caE1LNS5ko0', '14:40'],
  ['7FDXjjBZAnI', '15:21'], ['fazVWhZYT3w', '16:18'], ['CRrCqnJQ2M8', '13:57'],
].map(([videoId, time], index) => ({
  id: `youtube:${videoId}`, title: `20 September 2026 · ${time}`,
  meta: `Film ${index + 1} of 5 · YouTube`,
  source: { type: 'youtube', videoId, url: `https://youtu.be/${videoId}` },
}));
export const CINEMA_FLOOR = {
  key: 'cinema', kind: 'cinema', label: 'The Little Cinema',
  range: 'YouTube programme', count: YOUTUBE_FILMS.length, items: [], months: [],
};
