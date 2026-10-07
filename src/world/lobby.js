import * as THREE from 'three';
import { LOBBY, elevatorPoint, elevatorLocalPoint } from './layout.js';
import { canvasPanel } from './signage.js';

const { elevator: E, directory: D } = LOBBY;

/** Shared elevator cabin and directory. The hall changes behind closed doors. */
export class Lobby {
  constructor(floors) {
    this.floors = floors;
    this.current = 0;
    this.group = new THREE.Group();
    this.group.name = 'lobby';
    this.elevatorGroup = new THREE.Group();
    this.elevatorGroup.position.fromArray(E.placement.position);
    this.elevatorGroup.rotation.y = E.placement.rotationY;
    this.group.add(this.elevatorGroup);
    this.doorOpen = 0;
    this.targetOpen = 0;
    this.travel = null;
    this.buildElevator();
    this.buildDirectory();
  }

  get cabinPosition() {
    const [x, z] = elevatorPoint(E.x, E.frontZ + E.depth / 2);
    return [x, 1.65, z];
  }
  get cabinYaw() { return E.placement.rotationY; }

  setCurrent(index) {
    this.current = index;
    this.directory.repaint();
    this.display.userData.repaint();
  }

  openDoors() { if (!this.travel) this.targetOpen = 1; }

  /** Called by the composition root; callbacks keep floor loading out of the cabin. */
  travelTo(index, onArrive, onFinished) {
    if (this.travel || !this.floors[index]) return;
    this.targetOpen = 0;
    this.travel = { index, elapsed: 0, arrived: false, onArrive, onFinished };
  }

  blocksDoor(position, radius) {
    const local = elevatorLocalPoint(position);
    return this.doorOpen < 0.95 && Math.abs(local.x - E.x) < E.opening / 2 + radius
      && Math.abs(local.z - E.frontZ) < radius + 0.08;
  }

  registerInteractions(interactions, onActivate) {
    interactions.addOccluders(this.walls);
    interactions.add([...this.doors, this.callButton, this.display], {
      caption: () => ({ title: 'Elevator', subtitle: 'Click to choose a time period' }),
      activate: onActivate,
    });
    interactions.add([this.directory.mesh, this.directory.base], {
      caption: () => ({ title: 'Floor directory', subtitle: `${this.floors.length} floors · click to choose` }),
      activate: onActivate,
    });
  }

  update(dt) {
    const step = dt * 1.8;
    this.doorOpen += Math.sign(this.targetOpen - this.doorOpen) * Math.min(step, Math.abs(this.targetOpen - this.doorOpen));
    this.doors.forEach((door, i) => {
      const side = i === 0 ? -1 : 1;
      door.position.x = E.x + side * (E.opening / 4 + this.doorOpen * E.opening / 2);
    });
    const ride = this.travel;
    if (!ride) return;
    ride.elapsed += dt;
    if (!ride.arrived && ride.elapsed >= 1) {
      ride.arrived = true;
      this.setCurrent(ride.index);
      ride.onArrive();
    }
    if (ride.elapsed >= 1.5) this.targetOpen = 1;
    if (ride.arrived && this.doorOpen === 1) {
      this.travel = null;
      ride.onFinished();
    }
  }

  buildElevator() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x9ba4ae, roughness: 0.38, metalness: 0.72 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x173a60, roughness: 0.7 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xbba471, roughness: 0.3, metalness: 0.8 });
    const box = (w, h, d, x, y, z, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      this.elevatorGroup.add(mesh);
      return mesh;
    };
    const height = E.height;
    const sideWidth = (E.width - E.opening) / 2;
    this.walls = [
      box(0.12, height, E.depth, E.x - E.width / 2, height / 2, E.frontZ + E.depth / 2, dark),
      box(0.12, height, E.depth, E.x + E.width / 2, height / 2, E.frontZ + E.depth / 2, dark),
      box(E.width, height, 0.12, E.x, height / 2, E.frontZ + E.depth, dark),
    ];
    for (const side of [-1, 1]) {
      this.walls.push(box(sideWidth, height, 0.16, E.x + side * (E.opening / 2 + sideWidth / 2), height / 2, E.frontZ, steel));
      box(0.045, 2.55, 0.05, E.x + side * (E.opening / 2 + 0.025), 1.275, E.frontZ - 0.1, brass);
      box(0.05, 0.05, E.depth - 0.3, E.x + side * (E.width / 2 - 0.15), 1.05, E.frontZ + E.depth / 2, brass);
    }
    box(E.width, height - 2.55, 0.16, E.x, (height + 2.55) / 2, E.frontZ, steel);
    box(E.width, 0.08, E.depth, E.x, 0.04, E.frontZ + E.depth / 2, steel);
    box(E.width, 0.12, E.depth, E.x, height, E.frontZ + E.depth / 2, dark);
    box(E.width - 0.4, 0.015, E.depth - 0.4, E.x, height - 0.07, E.frontZ + E.depth / 2,
      new THREE.MeshBasicMaterial({ color: 0xfff2d7 }));
    const light = new THREE.PointLight(0xfff1dc, 4, 4, 2);
    light.position.set(E.x, height - 0.3, E.frontZ + E.depth / 2);
    this.elevatorGroup.add(light);
    this.doors = [-1, 1].map(side => box(E.opening / 2, 2.5, 0.06,
      E.x + side * E.opening / 4, 1.29, E.frontZ + 0.015, steel));
    this.callButton = box(0.16, 0.28, 0.045, E.x + E.opening / 2 + 0.25, 1.35, E.frontZ - 0.11, brass);
    box(0.055, 0.055, 0.025, this.callButton.position.x, 1.35, E.frontZ - 0.145,
      new THREE.MeshBasicMaterial({ color: 0xb9dbff }));
    this.display = canvasPanel(1.6, 0.38, (ctx, w, h) => {
      ctx.fillStyle = '#0c1928'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e5d5ac'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `500 ${h * 0.34}px Inter, sans-serif`;
      ctx.fillText(`${floorName(this.current, this.floors)} · ${this.floors[this.current]?.label ?? 'Elevator'}`, w / 2, h / 2);
    }, { lit: false, resolution: 768 });
    this.display.position.set(E.x, 2.9, E.frontZ - 0.095);
    this.display.rotation.y = Math.PI;
    this.elevatorGroup.add(this.display);
  }

  buildDirectory() {
    const directoryGroup = new THREE.Group();
    directoryGroup.position.fromArray(D.position);
    directoryGroup.rotation.y = D.rotationY;
    this.group.add(directoryGroup);
    const base = new THREE.Mesh(new THREE.BoxGeometry(D.width + 0.1, D.height + 0.1, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x1b1a17, roughness: 0.5, metalness: 0.3 }));

    const draw = (ctx, w, h) => {
      ctx.fillStyle = '#1b1a17';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c9a873';
      ctx.font = `500 ${w * 0.05}px Inter, sans-serif`;
      ctx.letterSpacing = '0.25em';
      ctx.fillText('FLOOR DIRECTORY', w * 0.08, h * 0.07);
      ctx.letterSpacing = '0em';
      ctx.fillStyle = '#f1e8d8';
      ctx.font = `600 ${w * 0.13}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText('Floors', w * 0.08, h * 0.15);
      const rowH = Math.min(h * 0.08, (h * 0.78) / this.floors.length);
      this.floors.forEach((floor, i) => {
        const y = h * 0.2 + i * rowH;
        if (i === this.current) {
          ctx.fillStyle = 'rgba(201,168,115,0.22)';
          ctx.fillRect(w * 0.04, y, w * 0.92, rowH * 0.9);
          ctx.fillStyle = '#c9a873';
          ctx.fillRect(w * 0.04, y, w * 0.012, rowH * 0.9);
        }
        ctx.fillStyle = i === this.current ? '#f1e8d8' : 'rgba(241,232,216,0.7)';
        ctx.font = `600 ${rowH * 0.42}px Inter, sans-serif`;
        ctx.fillText(floorName(i, this.floors), w * 0.08, y + rowH * 0.55);
        ctx.font = `600 ${rowH * 0.5}px "Cormorant Garamond", Georgia, serif`;
        ctx.fillText(floor.label, w * 0.26, y + rowH * 0.58);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(241,232,216,0.5)';
        ctx.font = `500 ${rowH * 0.34}px Inter, sans-serif`;
        ctx.fillText(String(floor.count), w * 0.92, y + rowH * 0.55);
        ctx.textAlign = 'left';
      });
    };
    const mesh = canvasPanel(D.width, D.height, draw, { lit: false, resolution: 768 });
    mesh.position.z = 0.065;
    this.directory = { mesh, base, repaint: () => mesh.userData.repaint() };
    directoryGroup.add(base, mesh);
  }
}

/** "1", "2", … for dated floors; the undated archive is the basement. */
export function floorName(index, floors) {
  return floors[index]?.key === 'undated' ? 'B' : String(index + 1);
}
