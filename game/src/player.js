// Solmar Nights — the player on foot: Rico Vega. WASD movement relative to
// the camera, sprint, jump, and the third-person camera that follows him
// (orbit with the mouse, chase cam when he drives).

import * as THREE from 'three';
import { makePersonMesh, animateWalk, animateAim } from './characters.js';
import { clamp, lerp, angleDelta } from './rng.js';
import {
  PLAYER_WALK_SPEED, PLAYER_RUN_SPEED, PLAYER_JUMP_SPEED,
  PLAYER_HEALTH_MAX, PLAYER_RADIUS,
} from './config.js';
import { collideCircleWithBuildings } from './city.js';

export class Player {
  constructor(scene, startX, startZ) {
    this.person = makePersonMesh({ skin: 0xd9a066, shirt: 0x2ecc71, pants: 0x2c3e50, hair: 0x1a1a1a });
    this.person.group.position.set(startX, 0, startZ);
    scene.add(this.person.group);
    this.pos = this.person.group.position;
    this.heading = Math.PI;
    this.velY = 0;
    this.grounded = true;
    this.health = PLAYER_HEALTH_MAX;
    this.phase = 0;
    this.car = null; // the Car being driven, or null on foot
    this.aiming = false;
    this.dead = false;
    // Camera orbit state.
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camPos = new THREE.Vector3(startX, 4, startZ + 8);
    this.camLook = new THREE.Vector3(startX, 1.5, startZ);
    this.menuOrbit = 0;
  }

  get inCar() {
    return this.car !== null;
  }

  get speed() {
    return this.car ? Math.abs(this.car.speed) : this._footSpeed || 0;
  }

  // --- On foot ---------------------------------------------------------------
  updateOnFoot(dt, input, colliders) {
    const axes = input.moveAxes();
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
    // Movement is relative to the camera yaw.
    const sin = Math.sin(this.camYaw);
    const cos = Math.cos(this.camYaw);
    let mx = 0;
    let mz = 0;
    if (axes.forward !== 0 || axes.strafe !== 0) {
      mx = sin * axes.forward + cos * axes.strafe;
      mz = cos * axes.forward - sin * axes.strafe;
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
    }
    const moving = axes.forward !== 0 || axes.strafe !== 0;
    this._footSpeed = moving ? speed : 0;
    this.pos.x += mx * speed * dt;
    this.pos.z += mz * speed * dt;
    collideCircleWithBuildings(this.pos, PLAYER_RADIUS, colliders);
    // Face the movement direction (or the camera when aiming).
    if (this.aiming) {
      this.heading = this.camYaw;
    } else if (moving) {
      const want = Math.atan2(mx, mz);
      this.heading += angleDelta(this.heading, want) * Math.min(1, dt * 12);
    }
    this.person.group.rotation.y = this.heading;
    this.phase += dt * (moving ? speed * 1.4 : 0);
    animateWalk(this.person, this.phase, moving ? (sprint ? 1 : 0.6) : 0);
    animateAim(this.person, this.aiming);

    // Jump + gravity.
    if (input.wasPressed('Space') && this.grounded) {
      this.velY = PLAYER_JUMP_SPEED;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.velY -= 22 * dt;
      this.pos.y += this.velY * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.velY = 0;
        this.grounded = true;
      }
    }
  }

  // --- Camera ------------------------------------------------------------------
  updateCamera(dt, camera, mode) {
    if (mode === 'menu') {
      // Slow orbit over the city for the title screen.
      this.menuOrbit += dt * 0.05;
      const cx = Math.sin(this.menuOrbit) * 170;
      const cz = Math.cos(this.menuOrbit) * 170;
      this.camPos.lerp(new THREE.Vector3(cx, 95, cz), Math.min(1, dt * 2));
      this.camLook.lerp(new THREE.Vector3(0, 8, 0), Math.min(1, dt * 2));
    } else if (this.car) {
      // Chase cam: behind the car, height and distance grow with speed.
      const car = this.car;
      const speed01 = clamp(Math.abs(car.speed) / 42, 0, 1);
      const back = (this.camBack ?? 9.5) + speed01 * 2.5;
      const height = (this.camHeight ?? 4.2) + speed01 * 0.8;
      const wantYaw = car.heading + Math.PI;
      // Blend the camera yaw toward behind-the-car, unless the player is
      // looking around with the mouse.
      this.camYaw += angleDelta(this.camYaw, wantYaw) * Math.min(1, dt * 2.2);
      const tx = car.pos.x + Math.sin(this.camYaw) * back;
      const tz = car.pos.z + Math.cos(this.camYaw) * back;
      this.camPos.x = lerp(this.camPos.x, tx, Math.min(1, dt * 5));
      this.camPos.y = lerp(this.camPos.y, height, Math.min(1, dt * 4));
      this.camPos.z = lerp(this.camPos.z, tz, Math.min(1, dt * 5));
      this.camLook.lerp(new THREE.Vector3(car.pos.x, 1.6, car.pos.z), Math.min(1, dt * 8));
      camera.fov = lerp(camera.fov, 62 + speed01 * 12, Math.min(1, dt * 3));
      camera.updateProjectionMatrix();
    } else {
      // On foot: orbit at the mouse yaw/pitch, 7.5 out, 3 up.
      const dist = this.aiming ? 4.5 : 7.5;
      const pitch = this.camPitch;
      const tx = this.pos.x + Math.sin(this.camYaw) * Math.cos(pitch) * dist;
      const tz = this.pos.z + Math.cos(this.camYaw) * Math.cos(pitch) * dist;
      const ty = this.pos.y + 1.8 + Math.sin(pitch) * dist;
      this.camPos.x = lerp(this.camPos.x, tx, Math.min(1, dt * 10));
      this.camPos.y = lerp(this.camPos.y, Math.max(1.2, ty), Math.min(1, dt * 10));
      this.camPos.z = lerp(this.camPos.z, tz, Math.min(1, dt * 10));
      this.camLook.lerp(new THREE.Vector3(this.pos.x, this.pos.y + 1.6, this.pos.z), Math.min(1, dt * 12));
      camera.fov = lerp(camera.fov, this.aiming ? 50 : 62, Math.min(1, dt * 6));
      camera.updateProjectionMatrix();
    }
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
  }

  // Mouse look: yaw wraps, pitch clamps so the camera never goes under the ground.
  applyMouseLook(dx, dy) {
    this.camYaw -= dx * 0.0026;
    this.camPitch = clamp(this.camPitch + dy * 0.0022, -0.15, 1.1);
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.dead = true;
  }

  heal(amount) {
    this.health = Math.min(PLAYER_HEALTH_MAX, this.health + amount);
  }

  respawn(x, z) {
    this.health = PLAYER_HEALTH_MAX;
    this.dead = false;
    this.pos.set(x, 0, z);
    this.velY = 0;
    if (this.car) {
      this.car.driver = null;
      this.car = null;
    }
    this.person.group.visible = true;
  }
}
