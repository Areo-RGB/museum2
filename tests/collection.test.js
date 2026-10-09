import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaLibrary } from '../src/media/library.js';
import { Curator } from '../src/media/curator.js';
import { createLayout } from '../src/world/layout.js';

const items = Array.from({ length: 9 }, (_, i) => ({
  id: `work-${i}`, kind: i < 8 ? 'video' : 'image', source: 'collection',
  date: new Date(2023, 3, i + 1), period: '2023-1', title: `Work ${i}`, subtitle: '',
}));
const library = new MediaLibrary(items);
function curatorFor() {
  const frames = createLayout(library.floors()[0]).slots.map(slot => ({
    slot, item: null, assign(item) { this.item = item; },
  }));
  return new Curator(frames, library, { media: { maxVideos: 1, loadConcurrency: 2 } });
}

test('every work, including videos beyond the playback budget, has its assigned frame', () => {
  const curator = curatorFor();
  for (const frame of curator.frames) frame.assign(curator.drawFor(frame));
  assert.deepEqual(curator.frames.filter(f => !f.slot.hero).map(f => f.item.id), items.map(i => i.id));
});

test('rehanging a complete floor preserves every collection work', () => {
  const curator = curatorFor();
  for (const frame of curator.frames) frame.assign(library.byId(frame.slot.itemId));
  curator.shuffleAll();
  assert.deepEqual(curator.frames.filter(f => !f.slot.hero).map(f => f.item.id).sort(), items.map(i => i.id).sort());
});

test('seasonal floors give every manifest item exactly one ordinary slot', () => {
  const mixed = new MediaLibrary([...items, { ...items[0], id: 'undated', date: null, period: 'undated' }]);
  const ids = mixed.floors().flatMap(f => createLayout(f).slots.filter(s => !s.hero).map(s => s.itemId));
  assert.equal(new Set(ids).size, 10);
  assert.equal(ids.length, 10);
});

test('direct editor loads respect a zero video budget', async () => {
  const curator = curatorFor();
  curator.options.maxVideos = 0;
  const frame = curator.frames[1];
  frame.item = items[0];
  frame.beginLoad = () => { throw new Error('Video must not start outside its budget'); };
  await curator.load(frame);
});

test('hidden file names are left out of the collection, whatever folder they sit in', async () => {
  const previous = globalThis.fetch;
  const assets = ['floors/2024-0-winter/IMG_20231209_1.jpg', 'floors/2024-0-winter/VID_20231209_164640.mp4'].map(key => ({
    key, url: `https://example.test/${key}`, contentType: key.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg',
  }));
  globalThis.fetch = async () => new Response(JSON.stringify({ assets }));
  try {
    const library = await MediaLibrary.load('/manifest.json', { hidden: ['VID_20231209_164640.mp4'] });
    assert.deepEqual(library.items.map(i => i.id), ['floors/2024-0-winter/IMG_20231209_1.jpg']);
  } finally { globalThis.fetch = previous; }
});
