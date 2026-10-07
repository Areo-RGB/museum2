import test from 'node:test';
import assert from 'node:assert/strict';
import { HALL_OF_FAME_FLOOR, HALL_OF_FAME_ITEMS } from '../src/fame/programme.js';
import { CINEMA_FLOOR } from '../src/cinema/programme.js';
import { MediaLibrary } from '../src/media/library.js';
import { createLayout } from '../src/world/layout.js';
import { floorName } from '../src/world/lobby.js';

test('hall of fame hangs each of its works in a large frame, plus the featured piece', () => {
  const layout = createLayout(HALL_OF_FAME_FLOOR);
  assert.equal(layout.theme, 'fame');
  const ordinary = layout.slots.filter(s => !s.hero);
  assert.deepEqual(ordinary.map(s => s.itemId), HALL_OF_FAME_ITEMS.map(i => i.id));
  assert.ok(ordinary.every(s => s.maxWidth > 4));
  assert.ok(HALL_OF_FAME_ITEMS.some(i => i.id === layout.slots.find(s => s.hero).itemId));
});

test('curated works resolve by id without creating a seasonal floor', () => {
  const library = new MediaLibrary([{ id: 'a', kind: 'image', source: 'collection', date: new Date(2023, 3, 1), title: '', subtitle: '' }]);
  library.byId('a');
  library.add(HALL_OF_FAME_ITEMS);
  assert.equal(library.byId(HALL_OF_FAME_ITEMS[1].id), HALL_OF_FAME_ITEMS[1]);
  assert.equal(library.floors().length, 1);
});

test('entrance floor is G and seasons keep numbering from 1', () => {
  const floors = [HALL_OF_FAME_FLOOR, { key: '2023-1' }, { key: '2023-2' }, { key: 'undated' }, CINEMA_FLOOR];
  assert.deepEqual(floors.map((_, i) => floorName(i, floors)), ['G', '1', '2', 'B', 'C']);
});
