import test from 'node:test';
import assert from 'node:assert/strict';
import { floorFolder, publicUrl, targetKey } from '../scripts/bucket-layout.js';

test('collection media is filed under its museum floor', () => {
  assert.equal(targetKey('2014/IMG_20230415_101500.jpg', 'image/jpeg'), 'floors/2023-1-spring/IMG_20230415_101500.jpg');
  assert.equal(targetKey('2014/VID_20231209_164640.mp4', 'video/mp4'), 'floors/2024-0-winter/VID_20231209_164640.mp4');
  assert.equal(targetKey('WhatsApp Image 2026-10-02 at 18.44.58.jpeg', 'image/jpeg'), 'floors/2026-3-autumn/WhatsApp Image 2026-10-02 at 18.44.58.jpeg');
  assert.equal(floorFolder('2014/scan.jpg'), 'undated');
});

test('curated video, music and manifests have their own places', () => {
  assert.equal(targetKey('Timeline 1_prob4.mp4', 'video/mp4'), 'hall-of-fame/Timeline 1_prob4.mp4');
  assert.equal(targetKey('Twelve_White_Walls.mp3', 'audio/mpeg'), 'music/Twelve_White_Walls.mp3');
  assert.equal(targetKey('manifest.json', 'application/json'), 'manifest.json');
  assert.equal(targetKey('2014/manifest.json', 'application/json'), null);
});

test('filed keys stay put', () => {
  for (const key of ['floors/2023-1-spring/IMG_20230415_101500.jpg', 'hall-of-fame/Timeline 1_prob4.mp4', 'music/Twelve_White_Walls.mp3']) {
    assert.equal(targetKey(key, key.endsWith('.mp3') ? 'audio/mpeg' : key.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg'), key);
  }
});

test('public URLs encode each segment but keep folders', () => {
  assert.equal(publicUrl('https://r2.test', 'hall-of-fame/Timeline 1_prob4.mp4'), 'https://r2.test/hall-of-fame/Timeline%201_prob4.mp4');
});
