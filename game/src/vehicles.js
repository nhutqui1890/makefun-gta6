// Solmar Nights — vehicles. Box-built cars in five body styles, a traffic
// system that drives them along the road grid (right-hand lanes, turns at
// intersections, stops for the car ahead), and parked cars to steal.

import * as THREE from 'three';
import { Rng } from './rng.js';
import { ROAD_LINES, ROAD_WIDTH, CITY_HALF, PALETTE, TRAFFIC_COUNT, PARKED_COUNT, CAR_MAX_SPEED } from './config.js';
import { collideCircleWithBuildings } from './city.js';

export const CAR_TYPES = {
  sedan: { length: 4.4, width: 1.9, height: 0.75, speed: 1.0, accel: 1.0 },
  taxi: { length: 4.4, width: 1.9, height: 0.75, speed: 0.95, accel: 1.0 },
  sports: { length: 4.2, width: 2.0, height: 0.6, speed: 1.25, accel: 1.35 },
  van: { length: 5.2, width: 2.1, height: 1.1, speed: 0.8, accel: 0.8 },
  police: { length: 4.5, width: 1.95, height: 0.75, speed: 1.15, accel: 1.2 },
  truck: { length: 6.4, width: 2.2, height: 1.2, speed: 0.7, accel: 0.7 },
};

// Build a car mesh. Returns { group, wheels, lightBar } — wheels spin and
// the front pair steers; lightBar flashes on police cars.
export function makeCarMesh(type = 'sedan', color = 0xc23b3b) {
  const spec = CAR_TYPES[type];
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e20 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height, spec.length), paint);
  body.position.y = 0.55 + spec.height / 2;
  body.castShadow = true;
  group.add(body);

  if (type === 'van' || type === 'truck') {
    const cargo = new THREE.Mesh(
      new THREE.BoxGeometry(spec.width - 0.1, spec.height + 0.7, spec.length * 0.55),
      paint,
    );
    cargo.position.set(0, 0.55 + spec.height / 2 + 0.35, -spec.length * 0.18);
    cargo.castShadow = true;
    group.add(cargo);
  }
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(spec.width - 0.35, 0.62, spec.length * 0.5),
    type === 'truck' ? paint : glass,
  );
  cabin.position.set(0, 0.55 + spec.height + 0.28, -spec.length * 0.05);
  cabin.castShadow = true;
  group.add(cabin);

  // Headlights and taillights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff8c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.1), headMat);
    head.position.set(side * (spec.width / 2 - 0.3), 0.72, spec.length / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.1), tailMat);
    tail.position.set(side * (spec.width / 2 - 0.3), 0.72, -spec.length / 2 - 0.02);
    group.add(tail);
  }

  // Wheels: cylinders rotated to face sideways.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [
    [-spec.width / 2, spec.length / 2 - 0.8],
    [spec.width / 2, spec.length / 2 - 0.8],
    [-spec.width / 2, -spec.length / 2 + 0.8],
    [spec.width / 2, -spec.length / 2 + 0.8],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  let lightBar = null;
  if (type === 'police') {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.3;
    lightBar.add(red, blue);
    lightBar.position.set(0, 0.55 + spec.height + 0.62 + 0.12, -spec.length * 0.05);
    lightBar.userData.red = red;
    lightBar.userData.blue = blue;
    group.add(lightBar);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.22, 0.3),
      new THREE.MeshBasicMaterial({ color: 0xffe600 }),
    );
    sign.position.set(0, 0.55 + spec.height + 0.62 + 0.12, -spec.length * 0.05);
    group.add(sign);
  }

  return { group, wheels, lightBar, spec };
}

// One car in the world: mesh + driving state. heading is radians, 0 = +Z.
export class Car {
  constructor(type, color, x, z, heading = 0) {
    const built = makeCarMesh(type, color);
    this.type = type;
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.lightBar = built.lightBar;
    this.spec = built.spec;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.driver = null; // 'player' | 'traffic' | 'police' | null (parked)
    this.stolen = false;
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    const spin = (this.speed / 0.36) * 0.016;
    for (const w of this.wheels) w.rotation.x += spin;
    if (this.wheels.length >= 2) {
      this.wheels[0].rotation.y = this.steer * 0.45;
      this.wheels[1].rotation.y = this.steer * 0.45;
    }
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }
}

// --- Traffic -----------------------------------------------------------------
export class TrafficSystem {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.cars = [];
    this.parked = [];
    for (let i = 0; i < TRAFFIC_COUNT; i++) this.spawnTrafficCar(true);
    for (let i = 0; i < PARKED_COUNT; i++) this.spawnParkedCar();
  }

  randomRoadPoint() {
    const line = this.rng.pick(ROAD_LINES);
    const along = this.rng.range(-CITY_HALF, CITY_HALF);
    const horizontal = this.rng.chance(0.5);
    return horizontal
      ? { x: along, z: line, horizontal }
      : { x: line, z: along, horizontal };
  }

  spawnTrafficCar(anywhere = false) {
    const p = this.randomRoadPoint();
    const types = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'sports', 'truck'];
    const type = this.rng.pick(types);
    const color = type === 'taxi' ? 0xf5c518 : this.rng.pick(PALETTE.carPaint);
    const heading = p.horizontal
      ? (this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
      : (this.rng.chance(0.5) ? 0 : Math.PI);
    const car = new Car(type, color, p.x, p.z, heading);
    car.driver = 'traffic';
    car.speed = this.rng.range(8, 13);
    // Right-hand lane: 3.5 from the centreline, on the driver's right.
    // Facing (sin h, cos h), the right side is (-cos h, sin h).
    const lane = 3.5;
    car.pos.x += -Math.cos(heading) * lane;
    car.pos.z += Math.sin(heading) * lane;
    car.targetSpeed = car.speed;
    this.scene.add(car.mesh);
    this.cars.push(car);
    return car;
  }

  spawnParkedCar() {
    const p = this.randomRoadPoint();
    const type = this.rng.pick(['sedan', 'sedan', 'sports', 'van', 'taxi']);
    const color = type === 'taxi' ? 0xf5c518 : this.rng.pick(PALETTE.carPaint);
    const car = new Car(type, color, p.x, p.z, p.horizontal ? 0 : Math.PI / 2);
    car.driver = null;
    const edge = ROAD_WIDTH / 2 - 1.6;
    if (p.horizontal) car.pos.z += this.rng.chance(0.5) ? edge : -edge;
    else car.pos.x += this.rng.chance(0.5) ? edge : -edge;
    this.scene.add(car.mesh);
    this.parked.push(car);
    return car;
  }

  // Every drivable car: traffic + parked + (police handled elsewhere).
  allCars() {
    return [...this.cars, ...this.parked];
  }

  nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.allCars()) {
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  // Remove a car from traffic/parked lists when the player takes it.
  claim(car) {
    this.cars = this.cars.filter((c) => c !== car);
    this.parked = this.parked.filter((c) => c !== car);
    car.driver = 'player';
  }

  // Release a car back to the world (parked) when the player leaves it.
  release(car) {
    car.driver = null;
    car.speed = 0;
    this.parked.push(car);
  }

  update(dt, playerPos, allObstacles) {
    for (const car of [...this.cars]) {
      const fwd = car.forward();
      // Car ahead? Slow down or stop.
      let blocked = false;
      for (const other of allObstacles) {
        if (other === car) continue;
        const dx = other.pos.x - car.pos.x;
        const dz = other.pos.z - car.pos.z;
        const ahead = dx * fwd.x + dz * fwd.z;
        const side = Math.abs(-dx * fwd.z + dz * fwd.x);
        if (ahead > 0 && ahead < 9 && side < 2.2) {
          blocked = true;
          break;
        }
      }
      const target = blocked ? 0 : (car.targetSpeed ?? 10);
      car.speed += (target - car.speed) * Math.min(1, dt * 2);

      // At an intersection, sometimes turn onto the crossing road.
      const nearX = ROAD_LINES.find((l) => Math.abs(car.pos.x - l) < 4);
      const nearZ = ROAD_LINES.find((l) => Math.abs(car.pos.z - l) < 4);
      if ((nearX !== undefined || nearZ !== undefined) && this.rng.chance(dt * 0.5)) {
        car.heading += this.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2;
      }
      // Turn around at the city edge.
      if (Math.abs(car.pos.x) > CITY_HALF + 6 || Math.abs(car.pos.z) > CITY_HALF + 6) {
        car.heading += Math.PI;
        car.pos.x = Math.max(-CITY_HALF, Math.min(CITY_HALF, car.pos.x));
        car.pos.z = Math.max(-CITY_HALF, Math.min(CITY_HALF, car.pos.z));
      }
      car.pos.x += fwd.x * car.speed * dt;
      car.pos.z += fwd.z * car.speed * dt;
      collideCircleWithBuildings(car.pos, 2.2, this.colliders);
      car.syncMesh();

      // Recycle cars that drifted far from the player.
      if (Math.hypot(car.pos.x - playerPos.x, car.pos.z - playerPos.z) > 260) {
        this.scene.remove(car.mesh);
        this.cars = this.cars.filter((c) => c !== car);
        this.spawnTrafficCar();
      }
    }
  }
}
