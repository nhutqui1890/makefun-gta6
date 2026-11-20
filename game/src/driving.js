// Solmar Nights — driving. Arcade car physics for the player's car:
// acceleration, braking and reverse, speed-sensitive steering, handbrake
// slides, building and car collisions, and getting in and out with E.

import * as THREE from 'three';
import { clamp, angleDelta } from './rng.js';
import {
  CAR_ACCEL, CAR_BRAKE, CAR_MAX_SPEED, CAR_REVERSE_MAX,
  CAR_TURN_RATE, CAR_DRAG, CAR_RADIUS, ENTER_CAR_RANGE,
} from './config.js';
import { collideCircleWithBuildings } from './city.js';

export class Driving {
  constructor(player, traffic, audio, onEvent) {
    this.player = player;
    this.traffic = traffic;
    this.audio = audio;
    this.onEvent = onEvent; // (type, data) -> game: 'carStolen', 'crash', ...
    this.crashCooldown = 0;
    this.autoDrive = false; // screenshot staging holds the throttle down
  }

  // Try to enter the nearest car. Returns the car, or null.
  tryEnterCar() {
    const p = this.player.pos;
    const car = this.traffic.nearestCar(p.x, p.z, ENTER_CAR_RANGE);
    if (!car) return null;
    this.traffic.claim(car);
    this.player.car = car;
    this.player.person.group.visible = false;
    car.stolen = true;
    this.onEvent('carStolen', { car });
    return car;
  }

  exitCar() {
    const car = this.player.car;
    if (!car) return;
    car.speed = 0;
    this.traffic.release(car);
    // Step out on the driver's side.
    const side = { x: -Math.cos(car.heading), z: Math.sin(car.heading) };
    this.player.pos.set(car.pos.x + side.x * 2.6, 0, car.pos.z + side.z * 2.6);
    this.player.heading = car.heading;
    this.player.camYaw = car.heading + Math.PI;
    this.player.car = null;
    this.player.person.group.visible = true;
    this.onEvent('carExited', { car });
  }

  update(dt, input, colliders, obstacles) {
    const car = this.player.car;
    if (!car) return;
    this.crashCooldown -= dt;

    const axes = this.autoDrive
      ? { forward: car.speed < 24 ? 1 : 0, strafe: 0 } // staged chases hold ~85 km/h
      : input.moveAxes();
    const handbrake = input.down('Space');
    const spec = car.spec;
    const maxSpeed = CAR_MAX_SPEED * spec.speed;
    const maxReverse = CAR_REVERSE_MAX;

    if (axes.forward > 0) {
      car.speed += CAR_ACCEL * spec.accel * dt * (car.speed < 0 ? 2.2 : 1);
    } else if (axes.forward < 0) {
      if (car.speed > 0.5) car.speed -= CAR_BRAKE * dt;
      else car.speed -= CAR_ACCEL * 0.55 * dt;
    } else {
      // Coast down.
      car.speed -= car.speed * CAR_DRAG * dt;
      if (Math.abs(car.speed) < 0.15) car.speed = 0;
    }
    if (handbrake) car.speed -= car.speed * 2.2 * dt;
    car.speed = clamp(car.speed, -maxReverse, maxSpeed);

    // Steering: full lock at low speed, gentler as speed rises; the handbrake
    // loosens the rear so the car slides.
    const speed01 = clamp(Math.abs(car.speed) / maxSpeed, 0, 1);
    const steerAuthority = 1 - speed01 * 0.55;
    const steerTarget = -axes.strafe * steerAuthority * (car.speed < 0 ? -1 : 1);
    const steerRate = handbrake ? 6 : 4;
    car.steer += (steerTarget - car.steer) * Math.min(1, dt * steerRate);
    car.heading += car.steer * CAR_TURN_RATE * dt * clamp(Math.abs(car.speed) / 8, 0, 1) * (handbrake ? 1.5 : 1);

    // Move, then resolve collisions.
    const fwd = car.forward();
    const prevX = car.pos.x;
    const prevZ = car.pos.z;
    car.pos.x += fwd.x * car.speed * dt;
    car.pos.z += fwd.z * car.speed * dt;
    const hitBuilding = collideCircleWithBuildings(car.pos, CAR_RADIUS, colliders);

    // Car-to-car: push apart, trade speed, spark a crash event.
    let hitCar = false;
    for (const other of obstacles) {
      if (other === car) continue;
      const dx = car.pos.x - other.pos.x;
      const dz = car.pos.z - other.pos.z;
      const d = Math.hypot(dx, dz);
      const minD = CAR_RADIUS + 2.2;
      if (d < minD && d > 0.01) {
        hitCar = true;
        const push = (minD - d) / 2;
        car.pos.x += (dx / d) * push;
        car.pos.z += (dz / d) * push;
        other.pos.x -= (dx / d) * push;
        other.pos.z -= (dz / d) * push;
        const impact = Math.abs(car.speed - (other.speed || 0));
        if (impact > 6) {
          other.speed = (other.speed || 0) * 0.4;
          if (other.driver === 'traffic') other.targetSpeed = 2;
        }
        car.speed *= 0.55;
      }
    }
    if ((hitBuilding || hitCar) && Math.abs(car.speed) > 4 && this.crashCooldown <= 0) {
      this.crashCooldown = 0.5;
      this.audio.crash();
      this.onEvent('crash', { speed: Math.abs(car.speed) });
      car.speed *= 0.4;
      car.health = Math.max(0, car.health - 8);
    }
    // Keep the car inside the world.
    car.pos.x = clamp(car.pos.x, -430, 430);
    car.pos.z = clamp(car.pos.z, -430, 420);
    car.syncMesh();
    // The player's position IS the car's while driving: police, missions,
    // the minimap and the Pay 'n Spray all read player.pos.
    this.player.pos.set(car.pos.x, 0, car.pos.z);
    this.player.heading = car.heading;
    this.audio.setEngine(speed01, true);

    // Running a pedestrian over is a crime the law notices.
    return { prevX, prevZ };
  }
}
