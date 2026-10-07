import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeTree } from '../src/world/environment.js';

test('switching floors releases instanced buffers as well as geometry', () => {
  const group = new THREE.Group();
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2);
  group.add(mesh);
  let released = false;
  mesh.addEventListener('dispose', () => { released = true; });
  disposeTree(group);
  assert.equal(released, true);
});
