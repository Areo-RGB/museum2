/**
 * Circle-vs-rectangle collision in the XZ plane. Much cheaper and more
 * predictable than raycasting against meshes.
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}[]} rects
 */
export function createCollisionChecker(rects, radius) {
  const r2 = radius * radius;
  return (position) => rects.some((r) => {
    const dx = position.x - Math.max(r.minX, Math.min(position.x, r.maxX));
    const dz = position.z - Math.max(r.minZ, Math.min(position.z, r.maxZ));
    return dx * dx + dz * dz < r2;
  });
}
