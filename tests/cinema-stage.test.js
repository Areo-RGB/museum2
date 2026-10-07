import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayout } from '../src/world/layout.js';
import { CINEMA_FLOOR, YOUTUBE_FILMS } from '../src/cinema/programme.js';
import { floorName } from '../src/world/lobby.js';

test('ordinary floors contain no theatre or cinema doorway', () => {
  const layout = createLayout({ key: 'spring', months: [], label: 'Spring' });
  assert.equal(layout.cinema, null);
  assert.equal(layout.walls.some(w => w.room === 'cinema'), false);
  assert.ok(layout.walls.some(w => w.x === 7 && !w.y0 && w.d === layout.hall.length));
});

test('Cinema is a separate elevator destination without archive frames', () => {
  const layout = createLayout(CINEMA_FLOOR);
  assert.ok(layout.cinema);
  assert.equal(layout.slots.length, 0);
  assert.equal(layout.sections.length, 0);
  assert.equal(layout.benches.length, 0);
  assert.ok(layout.walls.some(w => w.room === 'cinema'));
  assert.equal(floorName(0, [CINEMA_FLOOR]), 'C');
});

test('cinema programme contains only the five requested YouTube videos', () => {
  assert.deepEqual(YOUTUBE_FILMS.map(f => f.source.videoId), [
    '_Nrxv-wW874', 'caE1LNS5ko0', '7FDXjjBZAnI', 'fazVWhZYT3w', 'CRrCqnJQ2M8',
  ]);
  assert.ok(YOUTUBE_FILMS.every(f => f.source.type === 'youtube'));
});
