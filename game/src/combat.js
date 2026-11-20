// Solmar Nights — combat. A hitscan pistol with a magazine and reload,
/// muzzle flash and tracers, and the rival gang members missions spawn:
// they take cover in place, shoot back with poor aim, and drop cash.

import * as THREE from 'three';
import { Rng, clamp } from './rng.js';
import { makePersonMesh, animateWalk, animateAim } from './characters.js';
import { collideCircleWithBuildings } from './city.js';

const MAG_SIZE = 12;
const RELOAD_SECONDS = 1.4;
const SHOT_RANGE = 90;
const PLAYER_DAMAGE = 34; // three hits to drop a gang member
const ENEMY_DAMAGE = 7;

export class Combat {
  constructor(scene, rng, colliders, audio, onEvent) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.audio = audio;
    this.onEvent = onEvent; // ('enemyKilled' | 'shotFired', data)
    this.ammo = MAG_SIZE;
    this.reloading = 0;
    this.cooldown = 0;
    this.enemies = [];
    this.tracers = [];
    this.flash = new THREE.PointLight(0xffcc66, 0, 18);
    this.scene.add(this.flash);
    this.flashTimer = 0;
  }

  // Spawn gang members around (x, z) for a mission. Returns the enemy list.
  spawnEnemies(x, z, count) {
    const made = [];
    for (let i = 0; i < count; i++) {
      const person = makePersonMesh({
        skin: 0xa06a3b, shirt: 0xb03a2e, pants: 0x1c1e20, hair: 0x0d0d0d,
      });
      const ex = x + this.rng.range(-9, 9);
      const ez = z + this.rng.range(-9, 9);
      person.group.position.set(ex, 0, ez);
      animateAim(person, true);
      this.scene.add(person.group);
      const enemy = {
        person,
        pos: person.group.position,
        heading: this.rng.range(0, Math.PI * 2),
        health: 100,
        shootTimer: this.rng.range(0.5, 2),
        phase: 0,
        alive: true,
      };
      this.enemies.push(enemy);
      made.push(enemy);
    }
    return made;
  }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.person.group);
    this.enemies = [];
  }

  get aliveCount() {
    return this.enemies.filter((e) => e.alive).length;
  }

  // The player fires from the camera toward the crosshair. origin/direction
  // come from the camera; the world tests enemies, peds and cops.
  playerShoot(camera, player, targets) {
    if (this.cooldown > 0 || this.reloading > 0 || player.dead) return false;
    if (this.ammo <= 0) {
      this.reloading = RELOAD_SECONDS;
      return false;
    }
    this.ammo--;
    this.cooldown = 0.22;
    this.audio.gunshot();
    this.onEvent('shotFired', {});

    const origin = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // Slight spread.
    dir.x += (Math.random() - 0.5) * 0.012;
    dir.y += (Math.random() - 0.5) * 0.012;
    dir.normalize();

    // Muzzle flash at the player's gun.
    this.flash.position.copy(player.pos).add(new THREE.Vector3(0, 1.5, 0));
    this.flash.intensity = 60;
    this.flashTimer = 0.06;

    // Find the closest hit among enemies, peds and cops.
    let best = null;
    let bestD = SHOT_RANGE;
    for (const t of targets) {
      if (t.alive === false) continue;
      const to = new THREE.Vector3(t.pos.x, t.pos.y + 1.1, t.pos.z).sub(origin);
      const along = to.dot(dir);
      if (along < 0 || along > bestD) continue;
      const closest = origin.clone().add(dir.clone().multiplyScalar(along));
      const miss = closest.distanceTo(new THREE.Vector3(t.pos.x, t.pos.y + 1.1, t.pos.z));
      if (miss < 1.1) {
        best = t;
        bestD = along;
      }
    }
    const end = origin.clone().add(dir.clone().multiplyScalar(best ? bestD : SHOT_RANGE));
    this.addTracer(origin.clone().add(dir.clone().multiplyScalar(2)), end);
    if (best) this.hitTarget(best);
    return true;
  }

  hitTarget(target) {
    if (target.kind === 'enemy') {
      target.ref.health -= PLAYER_DAMAGE;
      if (target.ref.health <= 0 && target.ref.alive) {
        target.ref.alive = false;
        target.ref.person.group.rotation.x = -Math.PI / 2;
        target.ref.person.group.position.y = 0.3;
        this.onEvent('enemyKilled', { enemy: target.ref });
      }
    } else if (target.kind === 'ped') {
      target.system.knockDown(target.ped);
      this.onEvent('pedShot', { ped: target.ped });
    } else if (target.kind === 'cop') {
      this.onEvent('copShot', { cop: target.cop });
    }
  }

  addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }),
    );
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08 });
  }

  reload() {
    if (this.ammo < MAG_SIZE && this.reloading <= 0) {
      this.reloading = RELOAD_SECONDS;
    }
  }

  update(dt, player) {
    this.cooldown -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.ammo = MAG_SIZE;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.intensity = 0;
    }
    for (const t of [...this.tracers]) {
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        this.tracers = this.tracers.filter((x) => x !== t);
      }
    }
    // Enemies strafe a little and shoot back when the player is near.
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = player.pos.x - e.pos.x;
      const dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      e.heading = Math.atan2(dx, dz);
      e.person.group.rotation.y = e.heading;
      e.shootTimer -= dt;
      if (dist < 55 && e.shootTimer <= 0 && !player.dead) {
        e.shootTimer = this.rng.range(0.9, 1.9);
        this.audio.gunshot();
        // Poor aim: hits about half the time at close range.
        const hitChance = clamp(0.55 - dist / 120, 0.15, 0.55);
        const from = e.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        const to = player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
        if (Math.random() > hitChance) {
          to.x += this.rng.range(-2, 2);
          to.y += this.rng.range(-0.5, 1.5);
        }
        this.addTracer(from, to);
        if (Math.random() < hitChance) player.takeDamage(ENEMY_DAMAGE);
      }
      // Small sidestep so they don't look frozen.
      e.phase += dt;
      const step = Math.sin(e.phase * 0.7) * 0.4;
      e.pos.x += Math.cos(e.heading) * step * dt;
      e.pos.z += -Math.sin(e.heading) * step * dt;
      collideCircleWithBuildings(e.pos, 0.6, this.colliders);
      animateWalk(e.person, e.phase * 2, 0.2);
    }
  }
}
