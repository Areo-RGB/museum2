import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { screenCutoutMaterial, screenPose, viewingPosition } from '../src/cinema/screen.js';

test('screen cutout reveals the iframe while preserving scene occlusion', () => {
  const material = screenCutoutMaterial();
  assert.equal(material.opacity, 0);
  assert.equal(material.blending, THREE.NoBlending);
  assert.equal(material.depthTest, true);
  assert.equal(material.depthWrite, true);
  assert.equal(material.transparent, false);
  material.dispose();
});

test('CSS player uses the exact world pose and aspect ratio of the cinema surface', () => {
  const group = new THREE.Group();
  group.position.set(7, 0, 7.2);
  group.rotation.y = Math.PI / 2;
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  surface.position.set(0, 3, 15.84);
  surface.rotation.y = Math.PI;
  surface.scale.set(6.4, 3.6, 1);
  group.add(surface);
  const pose = screenPose(surface);
  assert.ok(pose.position.distanceTo(new THREE.Vector3(22.84, 3, 7.2)) < 1e-8);
  assert.equal(pose.scale.x * 1280, 6.4);
  assert.equal(pose.scale.y * 720, 3.6);
  assert.ok(pose.quaternion.angleTo(surface.getWorldQuaternion(new THREE.Quaternion())) < 1e-8);
  surface.geometry.dispose(); surface.material.dispose();
});

test('phone viewing position backs up to fit the whole screen', () => {
  const desktop = viewingPosition(65, 16 / 9);
  const phone = viewingPosition(65, 390 / 844);
  assert.ok(phone.z < desktop.z);
  assert.ok(phone.z >= 0.8 && desktop.z < 14);
  assert.equal(phone.x, 0, 'centre aisle stays clear of seats');
});
