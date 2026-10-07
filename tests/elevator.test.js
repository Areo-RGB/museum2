import test from 'node:test';
import assert from 'node:assert/strict';
import { Lobby } from '../src/world/lobby.js';
import { createLayout, LOBBY } from '../src/world/layout.js';
import { createCollisionChecker } from '../src/controls/collision.js';
import * as THREE from 'three';
import { Interactions } from '../src/controls/interactions.js';

function withLobby(run) {
  const previous = globalThis.document;
  const context = new Proxy({}, { get: () => () => {} });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  try {
    run(new Lobby([{ key: '2023-0', label: 'Winter 2023', count: 2 }, { key: '2023-1', label: 'Spring 2023', count: 2 }]));
  } finally { globalThis.document = previous; }
}

test('elevator changes floors behind closed doors and finishes with doors open', () => withLobby(lobby => {
  const events = [];
  lobby.travelTo(1, () => events.push({ phase: 'arrived', open: lobby.doorOpen }), () => events.push({ phase: 'finished', open: lobby.doorOpen }));
  for (let i = 0; i < 100; i++) lobby.update(0.05);
  assert.deepEqual(events, [{ phase: 'arrived', open: 0 }, { phase: 'finished', open: 1 }]);
  assert.equal(lobby.current, 1);
}));

test('elevator cabin is accessible through its entrance but has solid sides and back', () => {
  assert.ok(LOBBY.elevator);
  const e = LOBBY.elevator;
  const collides = createCollisionChecker(createLayout(null).colliders, 0.4);
  assert.equal(collides({ x: e.x, z: e.frontZ + 0.9 }), false);
  assert.equal(collides({ x: e.x, z: e.frontZ + e.depth }), true);
  assert.equal(collides({ x: e.x + e.width / 2, z: e.frontZ + 0.9 }), true);
});

test('closed elevator doors block entry and open doors permit exit', () => withLobby(lobby => {
  const doorway = { x: LOBBY.elevator.x, z: LOBBY.elevator.frontZ };
  assert.equal(lobby.blocksDoor(doorway, 0.4), true);
  lobby.openDoors();
  for (let i = 0; i < 20; i++) lobby.update(0.05);
  assert.equal(lobby.blocksDoor(doorway, 0.4), false);
}));

test('clicking the seam between closed doors opens the elevator controls', () => withLobby(lobby => {
  const e = LOBBY.elevator;
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(e.x, 1.65, e.frontZ - 2);
  camera.lookAt(e.x, 1.65, e.frontZ);
  camera.updateMatrixWorld(true);
  lobby.group.updateMatrixWorld(true);
  const interactions = new Interactions(camera);
  let activated = false;
  lobby.registerInteractions(interactions, () => { activated = true; });
  interactions.pick()?.target.activate();
  assert.equal(activated, true);
}));
