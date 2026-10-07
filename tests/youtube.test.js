import test from 'node:test';
import assert from 'node:assert/strict';
import { YouTubeFilm, youtubeEmbedURL } from '../src/cinema/youtube.js';

test('embed includes origin and inline playback, rejects invalid IDs', () => {
  const url = new URL(youtubeEmbedURL('_Nrxv-wW874', 'https://gallery.h03.uk'));
  assert.equal(url.searchParams.get('origin'), 'https://gallery.h03.uk');
  assert.equal(url.searchParams.get('playsinline'), '1');
  assert.equal(url.searchParams.get('enablejsapi'), '1');
  assert.throws(() => youtubeEmbedURL('invalid', 'https://gallery.h03.uk'));
});

test('YouTube playback controls, state and destruction follow the iframe lifecycle', async () => {
  const originals = { window: globalThis.window, document: globalThis.document, location: globalThis.location };
  let callbacks, plays = 0, pauses = 0, destroys = 0, removed = 0, volume;
  globalThis.location = { origin: 'https://gallery.h03.uk' };
  globalThis.document = { createElement: () => ({ remove() { removed++; } }) };
  globalThis.window = { YT: { Player: class {
    constructor(iframe, { events }) { callbacks = events; queueMicrotask(() => events.onReady()); }
    playVideo() { plays++; }
    pauseVideo() { pauses++; }
    setVolume(value) { volume = value; }
    getDuration() { return 100; }
    getCurrentTime() { return 25; }
    destroy() { destroys++; }
  } } };
  try {
    const film = new YouTubeFilm('_Nrxv-wW874', { replaceChildren() {} }, () => {});
    await film.ready;
    await film.play();
    callbacks.onStateChange({ data: 1 });
    assert.equal(film.paused, false);
    assert.equal(plays, 1);
    assert.equal(film.progress, 0.25);
    film.setVolume(0.4);
    assert.equal(volume, 40);
    film.pause();
    assert.equal(pauses, 1);
    film.dispose();
    assert.equal(destroys, 1);
    assert.equal(removed, 1);
    await film.play();
    assert.equal(plays, 1, 'destroyed player cannot resume');
    const cancelled = new YouTubeFilm('_Nrxv-wW874', { replaceChildren() {} }, () => {});
    cancelled.dispose();
    await cancelled.ready;
    assert.equal(destroys, 1, 'cancellation before API readiness never creates a player');
  } finally { Object.assign(globalThis, originals); }
});

test('controls are safe while the iframe API is still initializing', async () => {
  const originals = { window: globalThis.window, document: globalThis.document, location: globalThis.location };
  let events, volume;
  globalThis.location = { origin: 'https://gallery.h03.uk' };
  globalThis.document = { createElement: () => ({ remove() {} }) };
  globalThis.window = { YT: { Player: class {
    constructor(iframe, options) { events = options.events; }
    destroy() {}
  } } };
  try {
    const film = new YouTubeFilm('_Nrxv-wW874', { replaceChildren() {} }, () => {});
    await Promise.resolve();
    assert.doesNotThrow(() => film.pause());
    assert.doesNotThrow(() => film.setVolume(0.3));
    await film.play();
    film.player.setVolume = value => { volume = value; };
    events.onReady();
    await film.ready;
    assert.equal(volume, 30, 'volume selected before ready is applied when ready');
    film.dispose();
  } finally { Object.assign(globalThis, originals); }
});
