// Solmar Nights — the city. A procedural sun-soaked coastal grid: 7x7 roads,
// pastel towers downtown, palms and a beach on the south edge, a pier, and
// billboards. Everything is seeded, so the same seed rebuilds the same city.
// Returns the colliders (building AABBs) and the named places other systems
// need: safehouse, police station, hospital, Pay 'n Spray, package spots.

import * as THREE from 'three';
import { Rng } from './rng.js';
import {
  ROAD_LINES, ROAD_SPACING, ROAD_WIDTH, BLOCK_SIZE, CITY_HALF,
  GROUND_SIZE, BEACH_Z, OCEAN_Z, PALETTE,
} from './config.js';

// A canvas texture of lit windows, tinted per building colour. Generated at
// runtime, so no image files ship with the game.
const facadeCache = new Map();
function facadeTexture(baseColor) {
  if (facadeCache.has(baseColor)) return facadeCache.get(baseColor);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#' + baseColor.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 128, 256);
  const rng = new Rng(baseColor);
  for (let y = 10; y < 246; y += 22) {
    for (let x = 8; x < 120; x += 18) {
      const lit = rng.chance(0.35);
      ctx.fillStyle = lit ? '#ffe9a8' : '#5f7d92';
      ctx.fillRect(x, y, 12, 14);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  facadeCache.set(baseColor, tex);
  return tex;
}

function billboardTexture(text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = fg;
  ctx.font = 'bold 34px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 54);
  ctx.font = '16px Arial, sans-serif';
  ctx.fillText('SOLMAR BAY', 128, 96);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, seed = 1337) {
  const rng = new Rng(seed);
  const colliders = [];
  const addCollider = (x, z, hw, hd) => {
    colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  };

  // --- Lights and sky ------------------------------------------------------
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 260, 700);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320;
  sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320;
  sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 800;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // --- Ground, beach, ocean --------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, OCEAN_Z - BEACH_Z + 6),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.05, (BEACH_Z + OCEAN_Z) / 2);
  sand.receiveShadow = true;
  scene.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_SIZE, 260),
    new THREE.MeshLambertMaterial({ color: PALETTE.ocean }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.02, OCEAN_Z + 130);
  scene.add(ocean);

  // --- Roads -----------------------------------------------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8d44d });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f0 });
  for (const line of ROAD_LINES) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(CITY_HALF * 2 + ROAD_WIDTH, ROAD_WIDTH),
        roadMat,
      );
      road.rotation.x = -Math.PI / 2;
      if (!horizontal) road.rotation.z = Math.PI / 2;
      road.position.set(horizontal ? 0 : line, 0.1, horizontal ? line : 0);
      road.receiveShadow = true;
      scene.add(road);
      // Dashed centre line.
      for (let d = -CITY_HALF; d < CITY_HALF; d += 12) {
        // Skip the dashes inside intersections.
        if (ROAD_LINES.some((l) => Math.abs(d - l) < ROAD_WIDTH)) continue;
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), lineMat);
        dash.rotation.x = -Math.PI / 2;
        if (!horizontal) dash.rotation.z = Math.PI / 2;
        dash.position.set(
          horizontal ? d : line,
          0.12,
          horizontal ? line : d,
        );
        scene.add(dash);
      }
    }
    // Crosswalks at every intersection on this line.
    for (const other of ROAD_LINES) {
      for (let s = -4; s <= 4; s += 2) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 5), crossMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(line + s, 0.12, other - ROAD_WIDTH / 2 - 2.5);
        scene.add(stripe);
      }
    }
  }

  // --- Blocks: sidewalks + buildings ----------------------------------------
  const blockCentres = [];
  for (let ix = 0; ix < ROAD_LINES.length - 1; ix++) {
    for (let iz = 0; iz < ROAD_LINES.length - 1; iz++) {
      blockCentres.push({
        x: (ROAD_LINES[ix] + ROAD_LINES[ix + 1]) / 2,
        z: (ROAD_LINES[iz] + ROAD_LINES[iz + 1]) / 2,
      });
    }
  }
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6f75 });

  for (const block of blockCentres) {
    const walk = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_SIZE, 0.3, BLOCK_SIZE), sidewalkMat);
    walk.position.set(block.x, 0.15, block.z);
    walk.receiveShadow = true;
    scene.add(walk);

    const distDowntown = Math.hypot(block.x, block.z) / CITY_HALF; // 0 centre .. 1 edge
    const isPark = rng.chance(0.12) && distDowntown > 0.35;
    if (isPark) {
      // A pocket park: grass, palms, benches.
      const grass = new THREE.Mesh(
        new THREE.BoxGeometry(BLOCK_SIZE - 8, 0.4, BLOCK_SIZE - 8),
        new THREE.MeshLambertMaterial({ color: 0x6fae5f }),
      );
      grass.position.set(block.x, 0.35, block.z);
      grass.receiveShadow = true;
      scene.add(grass);
      for (let i = 0; i < 6; i++) {
        addPalm(scene, block.x + rng.range(-28, 28), block.z + rng.range(-28, 28), rng);
      }
      continue;
    }
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i++) {
      const w = rng.range(16, 30);
      const d = rng.range(16, 30);
      const tall = distDowntown < 0.4 ? rng.range(28, 68) : rng.range(10, 30);
      const bx = block.x + rng.range(-(BLOCK_SIZE / 2 - w / 2 - 2), BLOCK_SIZE / 2 - w / 2 - 2);
      const bz = block.z + rng.range(-(BLOCK_SIZE / 2 - d / 2 - 2), BLOCK_SIZE / 2 - d / 2 - 2);
      const color = rng.pick(PALETTE.building);
      const tex = facadeTexture(color);
      const side = new THREE.MeshLambertMaterial({ map: tex });
      const building = new THREE.Mesh(
        new THREE.BoxGeometry(w, tall, d),
        [side, side, roofMat, roofMat, side, side],
      );
      building.position.set(bx, tall / 2 + 0.3, bz);
      building.castShadow = true;
      building.receiveShadow = true;
      scene.add(building);
      addCollider(bx, bz, w / 2, d / 2);
      // Rooftop AC unit, for silhouette.
      if (rng.chance(0.6)) {
        const ac = new THREE.Mesh(
          new THREE.BoxGeometry(3, 1.6, 2.4),
          new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }),
        );
        ac.position.set(bx + rng.range(-4, 4), tall + 1.1, bz + rng.range(-4, 4));
        ac.castShadow = true;
        scene.add(ac);
      }
    }
    // A palm or two on the block corners.
    if (rng.chance(0.5)) addPalm(scene, block.x + 30, block.z + 30, rng);
  }

  // --- Landmark: Solmar Tower, the tallest building, dead centre ------------
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(34, 120, 34),
    new THREE.MeshLambertMaterial({ color: 0x2e4a6b, emissive: 0x0a1626 }),
  );
  tower.position.set(0, 60, 0);
  tower.castShadow = true;
  scene.add(tower);
  addCollider(0, 0, 17, 17);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4444 }),
  );
  beacon.position.set(0, 122, 0);
  scene.add(beacon);

  // --- Streetlights ----------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const line of ROAD_LINES) {
    for (let d = -CITY_HALF; d <= CITY_HALF; d += 45) {
      // No poles inside intersections: they would stand in the crossing road.
      if (ROAD_LINES.some((l) => Math.abs(d - l) < ROAD_WIDTH)) continue;
      for (const horizontal of [true, false]) {
        const x = horizontal ? d : line + ROAD_WIDTH / 2 + 1.5;
        const z = horizontal ? line + ROAD_WIDTH / 2 + 1.5 : d;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), poleMat);
        pole.position.set(x, 3.5, z);
        pole.castShadow = true;
        scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampMat);
        lamp.position.set(x, 7.2, z);
        scene.add(lamp);
      }
    }
  }

  // --- Beach: palms, umbrellas, pier ----------------------------------------
  for (let x = -380; x <= 380; x += 26) {
    addPalm(scene, x + rng.range(-6, 6), BEACH_Z + rng.range(4, 22), rng, 1.2);
  }
  const umbrellaColors = [0xff5a5a, 0x4db2ff, 0xffd94d, 0x7be0a3];
  for (let i = 0; i < 10; i++) {
    const x = rng.range(-320, 320);
    const z = BEACH_Z + rng.range(10, 30);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), poleMat);
    pole.position.set(x, 1.3, z);
    scene.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.2, 1, 8),
      new THREE.MeshLambertMaterial({ color: rng.pick(umbrellaColors) }),
    );
    top.position.set(x, 2.9, z);
    top.castShadow = true;
    scene.add(top);
  }
  // The pier: planks out into the ocean.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1, 90),
    new THREE.MeshLambertMaterial({ color: 0x9a7a52 }),
  );
  pier.position.set(-120, 0.8, OCEAN_Z + 40);
  pier.castShadow = true;
  scene.add(pier);

  // --- Billboards -------------------------------------------------------------
  addBillboard(scene, -180, -180, 'SOLMAR', '#123a5c', '#ffd94d');
  addBillboard(scene, 180, 180, 'PALM SHORES', '#5c1230', '#ffffff');
  addBillboard(scene, 0, -270 + 40, 'NIGHTS', '#1c5c2e', '#ffe9a8');

  // --- Named places ------------------------------------------------------------
  const places = {
    safehouse: { x: -135, z: -225, label: 'Safehouse' },
    police: { x: 135, z: 45, label: 'Police Station' },
    hospital: { x: 225, z: -135, label: 'Hospital' },
    paynspray: { x: -225, z: 135, label: "Pay 'n Spray" },
    pier: { x: -120, z: OCEAN_Z + 30, label: 'Solmar Pier' },
    tower: { x: 0, z: 0, label: 'Solmar Tower' },
  };
  // A small safehouse with a garage door.
  const house = new THREE.Mesh(
    new THREE.BoxGeometry(16, 7, 12),
    new THREE.MeshLambertMaterial({ color: 0xf5e6c8 }),
  );
  house.position.set(places.safehouse.x, 3.5, places.safehouse.z);
  house.castShadow = true;
  scene.add(house);
  addCollider(places.safehouse.x, places.safehouse.z, 8, 6);
  const garageDoor = new THREE.Mesh(
    new THREE.BoxGeometry(6, 4, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x7a8899 }),
  );
  garageDoor.position.set(places.safehouse.x, 2, places.safehouse.z + 6.1);
  scene.add(garageDoor);

  // Pay 'n Spray: a low garage with a bright sign.
  const spray = new THREE.Mesh(
    new THREE.BoxGeometry(20, 6, 14),
    new THREE.MeshLambertMaterial({ color: 0x3b6fc2 }),
  );
  spray.position.set(places.paynspray.x, 3, places.paynspray.z);
  spray.castShadow = true;
  scene.add(spray);
  addCollider(places.paynspray.x, places.paynspray.z, 10, 7);

  // Hidden packages: 10 golden orbs at spread-out sidewalk spots.
  const packageSpots = [
    { x: -225, z: -225 }, { x: -45, z: -225 }, { x: 135, z: -225 },
    { x: -225, z: -45 }, { x: 45, z: -135 }, { x: 225, z: -45 },
    { x: -135, z: 45 }, { x: 45, z: 135 }, { x: 225, z: 225 },
    { x: -120, z: OCEAN_Z + 55 },
  ];

  return { colliders, places, packageSpots, ocean };
}

function addPalm(scene, x, z, rng, scale = 1) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.34, 6, 6),
    new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk }),
  );
  trunk.position.y = 3;
  trunk.rotation.z = rng.range(-0.12, 0.12);
  trunk.castShadow = true;
  group.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4.4, 4), leafMat);
    leaf.position.y = 6.2;
    leaf.rotation.z = Math.PI / 2.4;
    leaf.rotation.y = (i / 6) * Math.PI * 2;
    leaf.translateY(1.6);
    leaf.castShadow = true;
    group.add(leaf);
  }
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  scene.add(group);
}

function addBillboard(scene, x, z, text, bg, fg) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.6, 14, 8),
    new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
  );
  pole.position.set(x, 7, z);
  pole.castShadow = true;
  scene.add(pole);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 9),
    new THREE.MeshLambertMaterial({ map: billboardTexture(text, bg, fg) }),
  );
  board.position.set(x, 17, z);
  board.rotation.y = Math.PI / 4;
  scene.add(board);
}

// Push a circle (x, z, radius) out of every AABB it overlaps. Mutates pos.
// Returns true when a push happened (a hit for crash effects).
export function collideCircleWithBuildings(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      hit = true;
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const pushL = pos.x - c.minX + radius;
        const pushR = c.maxX - pos.x + radius;
        const pushU = pos.z - c.minZ + radius;
        const pushD = c.maxZ - pos.z + radius;
        const min = Math.min(pushL, pushR, pushU, pushD);
        if (min === pushL) pos.x = c.minX - radius;
        else if (min === pushR) pos.x = c.maxX + radius;
        else if (min === pushU) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return hit;
}

// Is this point on a road (within the asphalt)?
export function isOnRoad(x, z) {
  const onLine = (v) => ROAD_LINES.some((l) => Math.abs(v - l) <= ROAD_WIDTH / 2);
  return onLine(x) || onLine(z);
}
