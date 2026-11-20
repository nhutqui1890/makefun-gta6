// Solmar Nights — screenshot staging. ?shot=<name> starts the game in a
// fixed, deterministic scene built with the game's own systems (no mock
// rendering: these are real frames of the real game), so the entry's
// screenshots show the open world at its best. Used only for captures;
// normal play never passes ?shot=.

import * as THREE from 'three';
import { Car } from './vehicles.js';

export const SHOT_NAMES = ['chase', 'foot', 'mission', 'start'];

// Stage one scene. game is the object main.js builds (player, police,
// traffic, missions, combat, city places, hud, ...). Returns a short
// description for the capture log.
export function stageShot(name, game) {
  const { player, police, traffic, missions, combat, places } = game;
  switch (name) {
    case 'chase': {
      // Cover shot: Rico fleeing down a clear avenue in a sports car,
      // 3 stars, two cop cars between the camera and his car, a mission
      // objective live. The avenue x=-180 runs the full city with no
      // landmark in the way.
      const car = new Car('sports', 0xc23b3b, -180, -120, 0);
      car.driver = 'player';
      car.speed = 26;
      game.scene.add(car.mesh);
      game.playerCar = car;
      player.car = car;
      player.person.group.visible = false;
      player.pos.set(-180, 0, -120);
      player.camYaw = Math.PI;
      player.camPitch = 0.3;
      player.camBack = 14;
      player.camHeight = 5.5;
      game.driving.autoDrive = true;
      police.setStars(3);
      police.spawnCopCarNear(player.pos);
      police.spawnCopCarNear(player.pos);
      // Cops visibly in pursuit, between the camera and the player car.
      police.cars.forEach((cop, i) => {
        cop.pos.set(-180 + (i === 0 ? -4.5 : 4.5), 0, -120 - 7 - i * 4);
        cop.heading = 0;
        cop.speed = 25;
        cop.syncMesh();
      });
      missions.completed = 4;
      missions.startMission(4);
      // Skip to the escape step so the objective reads as a chase.
      missions.active.stepIndex = 2;
      missions.enterStep();
      game.money = 2450;
      game.hud.toast('The Big Score — escape to the safehouse', 6000);
      game.state = 'playing';
      return 'chase: sports car, 3 stars, police pursuit, mission live';
    }
    case 'foot': {
      // On foot at a downtown crossing: pedestrians, traffic, the tower
      // ahead, minimap and HUD up, mission marker ahead. The crossing at
      // (0, -90) looks straight down the avenue at Solmar Tower.
      player.pos.set(0, 0, -90);
      player.heading = 0;
      player.camYaw = Math.PI;
      player.camPitch = 0.3;
      player.health = 100;
      game.money = 1250;
      missions.completed = 0;
      // A few pedestrians strolling the crossing so the street feels alive.
      const spots = [
        { x: -8, z: -78 }, { x: 9, z: -82 }, { x: -12, z: -100 }, { x: 7, z: -105 },
      ];
      for (const s of spots) {
        const ped = game.peds.spawn();
        ped.pos.set(s.x, 0, s.z);
        ped.target = { x: s.x + 20, z: s.z + 30 };
      }
      game.state = 'playing';
      return 'foot: downtown crossing on foot, peds and traffic';
    }
    case 'mission': {
      // Mission 4: Rico aiming at the Redcaps in the warehouse yard.
      player.pos.set(205, 0, -120);
      player.heading = Math.PI * 0.5;
      player.camYaw = Math.PI * 1.5;
      player.camPitch = 0.22;
      player.aiming = true;
      game.shotAiming = true;
      game.money = 1800;
      missions.completed = 3;
      missions.startMission(3);
      missions.active.stepIndex = 1;
      missions.enterStep();
      game.state = 'playing';
      return 'mission: Rooftop Deal firefight, aiming at gang members';
    }
    case 'start': {
      // Title screen over the city at golden hour.
      game.state = 'menu';
      return 'start: title screen over Solmar Bay';
    }
    default:
      return 'unknown shot: ' + name;
  }
}

// After staging, let the world settle a few frames, then signal the
// capture harness that the frame is ready.
export function markShotReady() {
  window.__solmarShotReady = true;
  document.body.classList.add('shot-ready');
}
