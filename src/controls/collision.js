import * as THREE from 'three';

export function createCollisionChecker(meshes, radius = 0.45) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = radius;
  const rayCount = 12;
  const dirs = Array.from({ length: rayCount }, (_, i) => {
    const a = (i / rayCount) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
  });

  return (position) => {
    const testPos = position.clone();
    // Test at torso height
    testPos.y = 1.4;
    return dirs.some((d) => {
      raycaster.set(testPos, d);
      return raycaster.intersectObjects(meshes, true).length > 0;
    });
  };
}
