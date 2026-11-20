// Solmar Nights — pedestrians. They stroll the sidewalks between random
// block corners, pause, chat, and run for cover when shots ring out or a
// car bears down on them. Getting hit knocks one down (and the law notices).

import * as THREE from 'three';
import { Rng } from './rng.js';
import { ROAD_LINES, ROAD_WIDTH, CITY_HALF, PEDESTRIAN_COUNT } from './config.js';
import { makePersonMesh, animateWalk, SKIN_TONES, SHIRTS, PANTS } from './characters.js';
import { collideCircleWithBuildings } from './city.js';

const STATES = { WALK: 'walk', IDLE: 'idle', FLEE: 'flee', DOWN: 'down' };

export class PedestrianSystem {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.peds = [];
    for (let i = 0; i < PEDESTRIAN_COUNT; i++) this.spawn();
  }

  randomSidewalkPoint() {
    // A point just off a road: on a sidewalk beside a random road.
    const line = this.rng.pick(ROAD_LINES);
    const along = this.rng.range(-CITY_HALF, CITY_HALF);
    const side = ROAD_WIDTH / 2 + this.rng.range(1, 4);
    const dir = this.rng.chance(0.5) ? 1 : -1;
    return this.rng.chance(0.5)
      ? { x: along, z: line + side * dir }
      : { x: line + side * dir, z: along };
  }

  spawn() {
    const p = this.randomSidewalkPoint();
    const person = makePersonMesh({
      skin: this.rng.pick(SKIN_TONES),
      shirt: this.rng.pick(SHIRTS),
      pants: this.rng.pick(PANTS),
    });
    person.group.position.set(p.x, 0, p.z);
    this.scene.add(person.group);
    const ped = {
      person,
      pos: person.group.position,
      heading: this.rng.range(0, Math.PI * 2),
      target: this.randomSidewalkPoint(),
      state: STATES.WALK,
      speed: this.rng.range(1.2, 2.2),
      phase: this.rng.range(0, Math.PI * 2),
      timer: this.rng.range(2, 8),
      downTimer: 0,
    };
    this.peds.push(ped);
    return ped;
  }

  // Everyone within radius of (x, z) runs away from it.
  scare(x, z, radius) {
    for (const ped of this.peds) {
      if (ped.state === STATES.DOWN) continue;
      const d = Math.hypot(ped.pos.x - x, ped.pos.z - z);
      if (d < radius) {
        ped.state = STATES.FLEE;
        const away = Math.atan2(ped.pos.x - x, ped.pos.z - z);
        ped.target = {
          x: ped.pos.x + Math.sin(away) * this.rng.range(25, 45),
          z: ped.pos.z + Math.cos(away) * this.rng.range(25, 45),
        };
        ped.timer = this.rng.range(3, 6);
      }
    }
  }

  knockDown(ped) {
    if (ped.state === STATES.DOWN) return;
    ped.state = STATES.DOWN;
    ped.downTimer = 6;
    ped.person.group.rotation.x = -Math.PI / 2;
    ped.person.group.position.y = 0.3;
  }

  update(dt, playerPos, playerSpeed) {
    for (const ped of this.peds) {
      if (ped.state === STATES.DOWN) {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) {
          // They get up, brush off, and walk away.
          ped.state = STATES.WALK;
          ped.person.group.rotation.x = 0;
          ped.person.group.position.y = 0;
          ped.target = this.randomSidewalkPoint();
        }
        continue;
      }
      ped.timer -= dt;
      if (ped.state === STATES.IDLE) {
        animateWalk(ped.person, ped.phase, 0);
        if (ped.timer <= 0) {
          ped.state = STATES.WALK;
          ped.target = this.randomSidewalkPoint();
          ped.timer = this.rng.range(6, 14);
        }
        continue;
      }
      // Walk or flee toward the target.
      const dx = ped.target.x - ped.pos.x;
      const dz = ped.target.z - ped.pos.z;
      const dist = Math.hypot(dx, dz);
      const fleeing = ped.state === STATES.FLEE;
      const speed = fleeing ? ped.speed * 3 : ped.speed;
      if (dist < 1.5 || ped.timer <= 0) {
        ped.state = fleeing ? STATES.WALK : (this.rng.chance(0.3) ? STATES.IDLE : STATES.WALK);
        ped.target = this.randomSidewalkPoint();
        ped.timer = fleeing ? this.rng.range(6, 14) : this.rng.range(2, 5);
        continue;
      }
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - ped.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      ped.heading += dh * Math.min(1, dt * 6);
      ped.pos.x += Math.sin(ped.heading) * speed * dt;
      ped.pos.z += Math.cos(ped.heading) * speed * dt;
      collideCircleWithBuildings(ped.pos, 0.6, this.colliders);
      ped.person.group.rotation.y = ped.heading;
      ped.phase += dt * speed * 3.2;
      animateWalk(ped.person, ped.phase, Math.min(1, speed / 3));

      // A fast car nearby spooks them.
      if (!fleeing && playerSpeed > 14) {
        const pd = Math.hypot(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z);
        if (pd < 10) this.scare(playerPos.x, playerPos.z, 12);
      }
      // Recycle peds that wandered far from the player.
      if (Math.hypot(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z) > 280) {
        const p = this.randomSidewalkPoint();
        ped.pos.set(p.x, 0, p.z);
        ped.target = this.randomSidewalkPoint();
      }
    }
  }
}
