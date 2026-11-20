// Solmar Nights — the law. A 5-star wanted ladder: crimes add stars, cops
// chase in cars and on foot, roadblocks go up at 4 stars, and staying out of
// sight sheds a star. Get caught on foot and you are busted.

import * as THREE from 'three';
import { Rng, clamp, angleDelta } from './rng.js';
import {
  ROAD_LINES, CITY_HALF, WANTED_LADDER, WANTED_DECAY_SECONDS,
  BUST_GRAB_SECONDS, BUST_FINE, PAYNSPRAY_COST,
} from './config.js';
import { Car } from './vehicles.js';
import { makePersonMesh, animateWalk } from './characters.js';
import { collideCircleWithBuildings } from './city.js';

export class Police {
  constructor(scene, rng, colliders, audio, onEvent) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.audio = audio;
    this.onEvent = onEvent; // ('busted' | 'wantedChanged', data)
    this.stars = 0;
    this.unseenTimer = 0;
    this.cars = [];
    this.cops = []; // on-foot officers
    this.patrol = []; // police cars always on the streets, witnessing crime
    this.roadblock = null;
    this.bustTimer = 0;
    this.flashTimer = 0;
    this.spawnPatrolCar();
    this.spawnPatrolCar();
  }

  // White doors mark a car as Solmar Bay PD.
  addPoliceDoors(car) {
    const doors = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.6, 2.2),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
    );
    doors.position.y = 0.95;
    car.mesh.add(doors);
  }

  // A patrol car cruises a random route forever; unlike pursuit cars it is
  // never despawned, so the streets always have witnesses.
  spawnPatrolCar() {
    const line = this.rng.pick(ROAD_LINES);
    const horizontal = this.rng.chance(0.5);
    const along = this.rng.range(-CITY_HALF, CITY_HALF);
    const car = new Car('police', 0x1a1d21,
      horizontal ? along : line, horizontal ? line : along,
      this.rng.range(0, Math.PI * 2));
    car.driver = 'police';
    car.speed = 11;
    this.addPoliceDoors(car);
    car.patrolTarget = this.randomRoadPoint();
    this.scene.add(car.mesh);
    this.patrol.push(car);
    return car;
  }

  randomRoadPoint() {
    const line = this.rng.pick(ROAD_LINES);
    const along = this.rng.range(-CITY_HALF, CITY_HALF);
    return this.rng.chance(0.5) ? { x: along, z: line } : { x: line, z: along };
  }

  addStars(n, reason) {
    const before = this.stars;
    this.stars = clamp(this.stars + n, 0, 5);
    if (this.stars !== before) {
      this.unseenTimer = 0;
      this.onEvent('wantedChanged', { stars: this.stars, reason });
    }
  }

  setStars(n) {
    const before = this.stars;
    this.stars = clamp(n, 0, 5);
    this.unseenTimer = 0;
    if (this.stars !== before) {
      this.onEvent('wantedChanged', { stars: this.stars, reason: 'set' });
    }
  }

  clearWanted() {
    this.stars = 0;
    this.unseenTimer = 0;
    this.despawnAll();
    this.onEvent('wantedChanged', { stars: 0, reason: 'clear' });
  }

  get wanted() {
    return this.stars > 0;
  }

  despawnAll() {
    for (const car of this.cars) this.scene.remove(car.mesh);
    for (const cop of this.cops) this.scene.remove(cop.person.group);
    if (this.roadblock) {
      for (const car of this.roadblock) this.scene.remove(car.mesh);
      this.roadblock = null;
    }
    this.cars = [];
    this.cops = [];
    this.audio.setSiren(false);
  }

  spawnCopCarNear(playerPos) {
    // On a road, 60-110 units from the player, roughly ahead of them.
    for (let tries = 0; tries < 12; tries++) {
      const line = this.rng.pick(ROAD_LINES);
      const horizontal = this.rng.chance(0.5);
      const along = this.rng.range(-CITY_HALF, CITY_HALF);
      const x = horizontal ? along : line;
      const z = horizontal ? line : along;
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d > 55 && d < 120) {
        const car = new Car('police', 0x1a1d21, x, z, this.rng.range(0, Math.PI * 2));
        car.driver = 'police';
        car.speed = 10;
        this.addPoliceDoors(car);
        this.scene.add(car.mesh);
        this.cars.push(car);
        return car;
      }
    }
    return null;
  }

  spawnFootCopNear(playerPos) {
    const angle = this.rng.range(0, Math.PI * 2);
    const dist = this.rng.range(14, 26);
    const x = playerPos.x + Math.sin(angle) * dist;
    const z = playerPos.z + Math.cos(angle) * dist;
    const person = makePersonMesh({ skin: 0xd9a066, shirt: 0x1f3a93, pants: 0x1a1d21, hair: 0x111111 });
    person.group.position.set(x, 0, z);
    // Police cap.
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.14, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x1f3a93 }),
    );
    cap.position.y = 2.0;
    person.group.add(cap);
    this.scene.add(person.group);
    const cop = { person, pos: person.group.position, heading: 0, phase: 0, grabTimer: 0 };
    this.cops.push(cop);
    return cop;
  }

  spawnRoadblock(playerPos, playerHeading) {
    if (this.roadblock) return;
    // Two cop cars parked across the road ahead of the player.
    const ahead = 55;
    const cx = playerPos.x + Math.sin(playerHeading) * ahead;
    const cz = playerPos.z + Math.cos(playerHeading) * ahead;
    const cars = [];
    for (const side of [-1, 1]) {
      const car = new Car('police', 0x1a1d21, cx + Math.cos(playerHeading) * side * 4, cz - Math.sin(playerHeading) * side * 4, playerHeading + Math.PI / 2);
      car.driver = 'police';
      car.speed = 0;
      this.scene.add(car.mesh);
      cars.push(car);
    }
    this.roadblock = cars;
  }

  update(dt, player, obstacles) {
    this.flashTimer += dt;
    const flash = Math.sin(this.flashTimer * 14) > 0;
    for (const car of this.cars) {
      if (!car.lightBar) continue;
      car.lightBar.userData.red.material.color.setHex(flash ? 0xff2222 : 0x550000);
      car.lightBar.userData.blue.material.color.setHex(flash ? 0x1133aa : 0x2266ff);
    }

    const ladder = WANTED_LADDER[this.stars];
    // Keep the pursuit at the ladder's strength.
    while (this.cars.length < ladder.cars) {
      if (!this.spawnCopCarNear(player.pos)) break;
    }
    while (this.cars.length > ladder.cars) {
      const car = this.cars.pop();
      this.scene.remove(car.mesh);
    }
    if (!player.inCar) {
      while (this.cops.length < ladder.foot) this.spawnFootCopNear(player.pos);
    }
    while (this.cops.length > ladder.foot) {
      const cop = this.cops.pop();
      this.scene.remove(cop.person.group);
    }
    if (ladder.roadblock && player.inCar && !this.roadblock) {
      this.spawnRoadblock(player.pos, player.car.heading);
    }
    if (!ladder.roadblock && this.roadblock) {
      for (const car of this.roadblock) this.scene.remove(car.mesh);
      this.roadblock = null;
    }
    if (this.roadblock) {
      const d = Math.hypot(this.roadblock[0].pos.x - player.pos.x, this.roadblock[0].pos.z - player.pos.z);
      if (d > 90) {
        for (const car of this.roadblock) this.scene.remove(car.mesh);
        this.roadblock = null;
      }
    }
    this.audio.setSiren(this.stars > 0);

    // Patrol cars cruise their routes whatever the wanted level.
    for (const car of this.patrol) {
      const t = car.patrolTarget;
      const dx = t.x - car.pos.x;
      const dz = t.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 9) {
        car.patrolTarget = this.randomRoadPoint();
      } else {
        const want = Math.atan2(dx, dz);
        car.heading += angleDelta(car.heading, want) * Math.min(1, dt * 2.2);
      }
      car.speed += (11 - car.speed) * Math.min(1, dt * 1.2);
      const fwd = car.forward();
      car.pos.x += fwd.x * car.speed * dt;
      car.pos.z += fwd.z * car.speed * dt;
      if (collideCircleWithBuildings(car.pos, 2.2, this.colliders)) car.speed *= 0.5;
      car.syncMesh();
    }

    if (this.stars === 0) return;

    // --- Cop cars pursue ------------------------------------------------------
    let anySeesPlayer = false;
    for (const car of [...this.cars]) {
      const dx = player.pos.x - car.pos.x;
      const dz = player.pos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 130) anySeesPlayer = true;
      // Aim slightly ahead of a moving player.
      const lead = player.inCar ? clamp(player.car.speed * 0.4, 0, 14) : 0;
      const tx = player.pos.x + (player.inCar ? Math.sin(player.car.heading) * lead : 0);
      const tz = player.pos.z + (player.inCar ? Math.cos(player.car.heading) * lead : 0);
      const want = Math.atan2(tx - car.pos.x, tz - car.pos.z);
      car.heading += angleDelta(car.heading, want) * Math.min(1, dt * 2.4);
      const targetSpeed = dist > 8 ? 34 : 12;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.4);
      const fwd = car.forward();
      car.pos.x += fwd.x * car.speed * dt;
      car.pos.z += fwd.z * car.speed * dt;
      const hit = collideCircleWithBuildings(car.pos, 2.2, this.colliders);
      if (hit) car.speed *= 0.5;
      // Ram the player's car.
      if (player.inCar) {
        const pd = Math.hypot(car.pos.x - player.car.pos.x, car.pos.z - player.car.pos.z);
        if (pd < 4.4) {
          const push = (4.4 - pd) / 2;
          const nx = (player.car.pos.x - car.pos.x) / (pd || 1);
          const nz = (player.car.pos.z - car.pos.z) / (pd || 1);
          player.car.pos.x += nx * push;
          player.car.pos.z += nz * push;
          car.pos.x -= nx * push;
          car.pos.z -= nz * push;
          player.car.speed *= 0.85;
        }
      }
      car.syncMesh();
      // A cop car that fell far behind respawns closer.
      if (dist > 220) {
        this.scene.remove(car.mesh);
        this.cars = this.cars.filter((c) => c !== car);
        this.spawnCopCarNear(player.pos);
      }
    }

    // --- Foot cops chase the player on foot -----------------------------------
    for (const cop of this.cops) {
      const dx = player.pos.x - cop.pos.x;
      const dz = player.pos.z - cop.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 120) anySeesPlayer = true;
      if (player.inCar) {
        // Stand and watch a driving player; they cannot catch a car.
        animateWalk(cop.person, cop.phase, 0);
        continue;
      }
      const want = Math.atan2(dx, dz);
      cop.heading += angleDelta(cop.heading, want) * Math.min(1, dt * 8);
      const speed = dist > 3 ? 8.5 : 0;
      cop.pos.x += Math.sin(cop.heading) * speed * dt;
      cop.pos.z += Math.cos(cop.heading) * speed * dt;
      collideCircleWithBuildings(cop.pos, 0.6, this.colliders);
      cop.person.group.rotation.y = cop.heading;
      cop.phase += dt * speed * 2.4;
      animateWalk(cop.person, cop.phase, speed > 0 ? 1 : 0);
      // Grab: close and slow for long enough means busted.
      if (dist < 2.4 && player.speed < 3) {
        cop.grabTimer += dt;
        if (cop.grabTimer > BUST_GRAB_SECONDS) {
          this.onEvent('busted', { fine: BUST_FINE });
          return;
        }
      } else {
        cop.grabTimer = 0;
      }
      if (dist > 200) {
        this.scene.remove(cop.person.group);
        this.cops = this.cops.filter((c) => c !== cop);
        this.spawnFootCopNear(player.pos);
      }
    }

    // --- Losing the heat --------------------------------------------------------
    if (!anySeesPlayer) {
      this.unseenTimer += dt;
      if (this.unseenTimer > WANTED_DECAY_SECONDS) {
        this.unseenTimer = 0;
        this.addStars(-1, 'escaped');
      }
    } else {
      this.unseenTimer = 0;
    }
  }

  // Pay 'n Spray: drive into the garage with a wanted level to clear it.
  tryPaynSpray(player, places, money) {
    if (!player.inCar || this.stars === 0) return { done: false };
    const d = Math.hypot(player.pos.x - places.paynspray.x, player.pos.z - places.paynspray.z);
    if (d > 12) return { done: false };
    if (money < PAYNSPRAY_COST) return { done: false, poor: true };
    this.clearWanted();
    if (player.car) player.car.health = 100;
    return { done: true, cost: PAYNSPRAY_COST };
  }
}
