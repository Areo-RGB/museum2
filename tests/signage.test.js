import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasPanel } from '../src/world/signage.js';

test('directory signs can repaint after the selected period changes', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ clearRect() {} }) }) };
  let current = 'Winter';
  const painted = [];
  try {
    const mesh = canvasPanel(1, 2, () => painted.push(current));
    current = 'Spring';
    assert.equal(typeof mesh.userData.repaint, 'function');
    mesh.userData.repaint();
    assert.deepEqual(painted, ['Winter', 'Spring']);
    mesh.geometry.dispose();
    mesh.material.map.dispose();
    mesh.material.dispose();
  } finally { globalThis.document = previous; }
});
