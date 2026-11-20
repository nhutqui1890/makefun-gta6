// Solmar Nights — missions and side work. Five story missions, told in
// steps (drive somewhere, steal a car, lose the cops, clear the shooters,
// escape to the safehouse), plus taxi fares and ten hidden packages.
// Each step points the player at a beacon in the world and a blip on the
// minimap; finishing a mission pays out and unlocks the next.

import * as THREE from 'three';
import { MISSION_NAMES, PACKAGE_REWARD, TAXI_BASE_FARE } from './config.js';

// Mission scripts. Coordinates are city positions (see city.js places).
// step kinds: goto | stealCar | loseWanted | kill | wait
const MISSIONS = [
  {
    name: MISSION_NAMES[0],
    giver: 'Mama Rosa',
    brief: 'Rico, you need wheels before anything else. Take any car on the street — nobody will miss it — and bring it to my garage.',
    reward: 300,
    steps: [
      { kind: 'stealCar', text: 'Steal a car — walk up to one and press E' },
      { kind: 'goto', x: -135, z: -225, radius: 10, text: 'Drive it to Mama Rosa\'s garage' },
    ],
  },
  {
    name: MISSION_NAMES[1],
    giver: 'Eddie Voss',
    brief: 'A package is waiting at the pier. Pick it up and get it to the tower before the clock runs out. Drive like you mean it.',
    reward: 500,
    steps: [
      { kind: 'goto', x: -120, z: 330, radius: 9, text: 'Pick up the package at Solmar Pier' },
      { kind: 'goto', x: 45, z: 45, radius: 10, text: 'Deliver it to Solmar Tower', time: 75 },
    ],
  },
  {
    name: MISSION_NAMES[2],
    giver: 'Eddie Voss',
    brief: 'The cops are onto the crew. Draw some heat — get their attention — then shake them off and lay low until it blows over.',
    reward: 600,
    steps: [
      { kind: 'gainWanted', stars: 2, text: 'Get the police after you (2 stars)' },
      { kind: 'loseWanted', text: 'Lose the cops — stay out of sight' },
      { kind: 'goto', x: -135, z: -225, radius: 10, text: 'Lay low at the safehouse' },
    ],
  },
  {
    name: MISSION_NAMES[3],
    giver: 'Mama Rosa',
    brief: 'The Redcaps are moving on my block by the old warehouse. Go on foot, clear them out, and bring me what they were guarding.',
    reward: 900,
    steps: [
      { kind: 'goto', x: 225, z: -135, radius: 12, text: 'Reach the warehouse yard' },
      { kind: 'kill', x: 225, z: -135, count: 3, text: 'Clear out the Redcaps (3 left)' },
      { kind: 'goto', x: -135, z: -225, radius: 10, text: 'Bring the stash back to Mama Rosa' },
    ],
  },
  {
    name: MISSION_NAMES[4],
    giver: 'Eddie Voss',
    brief: 'The big one. Grab the crew at the tower, then run — the whole city will be on you. Make it to the safehouse and we are rich.',
    reward: 1500,
    steps: [
      { kind: 'goto', x: 45, z: 45, radius: 10, text: 'Pick up the crew at Solmar Tower' },
      { kind: 'gainWanted', stars: 3, text: 'The heat is on — 3 stars and climbing' },
      { kind: 'goto', x: -135, z: -225, radius: 10, text: 'Escape to the safehouse' },
    ],
  },
];

export class MissionSystem {
  constructor(scene, onEvent) {
    this.scene = scene;
    this.onEvent = onEvent; // ('missionStarted' | 'missionComplete' | 'missionFailed' | 'stepChanged', data)
    this.completed = 0; // missions finished, in order
    this.active = null; // { mission, stepIndex, timer }
    this.beacon = this.makeBeacon();
    this.scene.add(this.beacon);
    this.beacon.visible = false;
    // Taxi side job state.
    this.taxi = null; // { phase: 'pickup'|'dropoff', x, z, fare, t0 }
    this.packagesCollected = 0;
    this.packageMeshes = [];
  }

  makeBeacon() {
    const group = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 60, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    pillar.position.y = 30;
    group.add(pillar);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    group.add(ring);
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4),
      new THREE.MeshBasicMaterial({ color: 0xffd94d }),
    );
    diamond.position.y = 7;
    group.add(diamond);
    group.userData.diamond = diamond;
    return group;
  }

  // The next mission's start marker: the safehouse until all five are done.
  get startPoint() {
    return this.completed < MISSIONS.length ? { x: -135, z: -225 } : null;
  }

  get currentMission() {
    return this.active ? this.active.mission : null;
  }

  get currentStep() {
    return this.active ? this.active.mission.steps[this.active.stepIndex] : null;
  }

  get objectiveText() {
    if (this.taxi) {
      return this.taxi.phase === 'pickup'
        ? 'Taxi: pick up your fare'
        : `Taxi: drop your fare off ($${this.taxi.fare})`;
    }
    if (!this.active) {
      return this.completed >= MISSIONS.length
        ? 'All missions complete — Solmar is yours. Free roam!'
        : `New mission: ${MISSIONS[this.completed].name} — go to the safehouse`;
    }
    const step = this.currentStep;
    if (step.kind === 'kill' && step.remaining !== undefined) {
      return `Clear out the Redcaps (${step.remaining} left)`;
    }
    return step.text;
  }

  // The world position the beacon and minimap should point at, or null.
  get targetPoint() {
    if (this.taxi) return { x: this.taxi.x, z: this.taxi.z };
    if (this.active) {
      const step = this.currentStep;
      if (step.x !== undefined) return { x: step.x, z: step.z };
      return null;
    }
    return this.startPoint;
  }

  startMission(index) {
    const mission = MISSIONS[index];
    this.active = { mission, stepIndex: 0, timer: 0 };
    this.onEvent('missionStarted', { mission });
    this.enterStep();
  }

  enterStep() {
    const step = this.currentStep;
    if (!step) return;
    if (step.kind === 'kill') {
      step.remaining = step.count;
      this.onEvent('spawnEnemies', { x: step.x, z: step.z, count: step.count });
    }
    if (step.kind === 'gainWanted' && step.stars) {
      this.onEvent('gainWanted', { stars: step.stars });
    }
    this.onEvent('stepChanged', { step });
  }

  advanceStep() {
    this.active.stepIndex++;
    if (this.active.stepIndex >= this.active.mission.steps.length) {
      const mission = this.active.mission;
      this.completed++;
      this.active = null;
      this.onEvent('missionComplete', { mission, reward: mission.reward });
    } else {
      this.enterStep();
    }
  }

  failMission(reason) {
    if (!this.active) return;
    const mission = this.active.mission;
    this.active = null;
    this.onEvent('missionFailed', { mission, reason });
  }

  onEnemyKilled() {
    const step = this.currentStep;
    if (!step || step.kind !== 'kill') return;
    step.remaining--;
    if (step.remaining <= 0) this.advanceStep();
  }

  update(dt, player, police) {
    // Beacon follows the current target.
    const target = this.targetPoint;
    if (target) {
      this.beacon.visible = true;
      this.beacon.position.set(target.x, 0, target.z);
      this.beacon.userData.diamond.rotation.y += dt * 2;
      this.beacon.userData.diamond.position.y = 7 + Math.sin(performance.now() / 300) * 0.6;
    } else {
      this.beacon.visible = false;
    }

    // Start the next mission by reaching the safehouse marker on foot or by car.
    if (!this.active && this.startPoint) {
      const d = Math.hypot(player.pos.x - this.startPoint.x, player.pos.z - this.startPoint.z);
      if (d < 12) this.startMission(this.completed);
    }
    if (!this.active) return;

    const step = this.currentStep;
    if (step.time !== undefined) {
      this.active.timer += dt;
      if (this.active.timer > step.time) {
        this.failMission('Out of time');
        return;
      }
    }
    switch (step.kind) {
      case 'goto': {
        const d = Math.hypot(player.pos.x - step.x, player.pos.z - step.z);
        if (d < step.radius) this.advanceStep();
        break;
      }
      case 'stealCar':
        if (player.inCar) this.advanceStep();
        break;
      case 'gainWanted':
        if (police.stars >= step.stars) this.advanceStep();
        break;
      case 'loseWanted':
        if (police.stars === 0) this.advanceStep();
        break;
      case 'kill':
        break; // advances on kills
      default:
        break;
    }
  }

  // --- Taxi fares ---------------------------------------------------------------
  startTaxiFare(rng) {
    if (this.taxi) return;
    const spots = [
      { x: 45, z: -135 }, { x: -135, z: 45 }, { x: 135, z: 135 },
      { x: -45, z: 225 }, { x: 225, z: -45 }, { x: -225, z: -135 },
    ];
    const pickup = rng.pick(spots);
    this.taxi = { phase: 'pickup', x: pickup.x, z: pickup.z, fare: TAXI_BASE_FARE, t0: 0 };
    this.onEvent('taxiStarted', { fare: this.taxi.fare });
  }

  updateTaxi(dt, player) {
    if (!this.taxi) return;
    this.taxi.t0 += dt;
    const d = Math.hypot(player.pos.x - this.taxi.x, player.pos.z - this.taxi.z);
    if (d > 10) return;
    if (this.taxi.phase === 'pickup') {
      const dests = [
        { x: -135, z: -225 }, { x: 45, z: 45 }, { x: -120, z: 330 },
        { x: 225, z: 225 }, { x: 0, z: 0 },
      ];
      const dest = dests[Math.floor(Math.random() * dests.length)];
      this.taxi.phase = 'dropoff';
      this.taxi.x = dest.x;
      this.taxi.z = dest.z;
      this.taxi.t0 = 0;
      this.onEvent('taxiPickup', {});
    } else {
      const tip = this.taxi.t0 < 45 ? 40 : 0;
      const total = this.taxi.fare + tip;
      this.taxi = null;
      this.onEvent('taxiComplete', { fare: total });
    }
  }

  cancelTaxi() {
    this.taxi = null;
  }

  // --- Hidden packages ------------------------------------------------------------
  buildPackages(scene, spots, collectedSet) {
    const geo = new THREE.OctahedronGeometry(0.9);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd94d });
    spots.forEach((spot, i) => {
      if (collectedSet.has(i)) return;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(spot.x, 1.6, spot.z);
      scene.add(mesh);
      this.packageMeshes.push({ mesh, index: i, x: spot.x, z: spot.z });
    });
  }

  updatePackages(dt, player, collectedSet) {
    for (const p of [...this.packageMeshes]) {
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = 1.6 + Math.sin(performance.now() / 250 + p.index) * 0.3;
      const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      if (d < 3) {
        collectedSet.add(p.index);
        this.packageMeshes = this.packageMeshes.filter((x) => x !== p);
        this.scene.remove(p.mesh);
        this.packagesCollected++;
        this.onEvent('packageCollected', { reward: PACKAGE_REWARD, index: p.index });
      }
    }
  }
}

export { MISSIONS };
