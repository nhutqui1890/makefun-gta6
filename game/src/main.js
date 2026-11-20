// Solmar Nights — bootstrap and game loop. Builds the renderer, the city
// and every system, wires their events together (crime -> wanted stars,
// missions -> money, death -> hospital), and runs the frame loop plus the
// menu / pause / busted / wasted state machine.

import * as THREE from 'three';
import { Rng, clamp } from './rng.js';
import {
  GAME_TITLE, START_MONEY, BUST_FINE, PAYNSPRAY_COST,
  PLAYER_HEALTH_MAX, ENTER_CAR_RANGE,
} from './config.js';
import { buildCity } from './city.js';
import { TrafficSystem, Car } from './vehicles.js';
import { PedestrianSystem } from './pedestrians.js';
import { Player } from './player.js';
import { Driving } from './driving.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { MissionSystem } from './missions.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { stageShot, markShotReady, SHOT_NAMES } from './shots.js';

const SEED = 1337;
const SAVE_EVERY_SECONDS = 30;

class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | busted | wasted
    this.money = START_MONEY;
    this.clockMinutes = 16 * 60 + 30; // golden hour
    this.packages = new Set();
    this.saveTimer = 0;
    this.shotMode = null;
    this.shotFrames = 0;
    this.lastHealth = PLAYER_HEALTH_MAX;
    this.muted = false;
    this.playerCar = null; // the car the player owns (for shots.js)
    this.frame = 0;

    // --- Renderer ------------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(0, 95, 170);

    // --- Systems ---------------------------------------------------------------
    const rng = new Rng(SEED);
    this.rng = rng;
    const city = buildCity(this.scene, SEED);
    this.city = city;
    this.colliders = city.colliders;
    this.places = city.places;
    this.audio = new AudioEngine();
    this.input = new Input(this.renderer.domElement);
    this.player = new Player(this.scene, city.places.safehouse.x + 14, city.places.safehouse.z + 10);
    this.traffic = new TrafficSystem(this.scene, rng, this.colliders);
    this.peds = new PedestrianSystem(this.scene, rng, this.colliders);
    this.police = new Police(this.scene, rng, this.colliders, this.audio, (t, d) => this.onPoliceEvent(t, d));
    this.driving = new Driving(this.player, this.traffic, this.audio, (t, d) => this.onDrivingEvent(t, d));
    this.combat = new Combat(this.scene, rng, this.colliders, this.audio, (t, d) => this.onCombatEvent(t, d));
    this.missions = new MissionSystem(this.scene, (t, d) => this.onMissionEvent(t, d));
    this.missions.buildPackages(this.scene, city.packageSpots, this.packages);
    this.hud = new Hud();

    this.bindMenus();
    this.bindKeys();
    window.addEventListener('resize', () => this.onResize());
    window.__solmar = this; // for play-testing from the console
    window.__solmarShotReady = false;

    // --- Screenshot staging ------------------------------------------------------
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (shot && SHOT_NAMES.includes(shot)) {
      this.shotMode = shot;
      this.audio.muted = true; // captures run silent
      const desc = stageShot(shot, this);
      console.log('[solmar] staged shot:', desc);
      this.showOnly(this.state === 'menu' ? 'menu-screen' : null);
      if (this.state === 'playing') this.showHud(true);
    } else {
      this.showOnly('menu-screen');
      this.updateContinueButton();
    }

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frameLoop());
  }

  // --- Menus -------------------------------------------------------------------
  $(id) {
    return document.getElementById(id);
  }

  showOnly(screenId) {
    for (const id of ['menu-screen', 'pause-screen', 'busted-screen', 'wasted-screen', 'help-screen']) {
      this.$(id).classList.toggle('hidden', id !== screenId);
    }
    this.showHud(screenId === null && this.state === 'playing');
  }

  showHud(show) {
    this.$('hud').classList.toggle('hidden', !show);
  }

  updateContinueButton() {
    this.$('continue-btn').classList.toggle('hidden', !hasSave());
  }

  bindMenus() {
    this.$('new-game-btn').addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      clearSave();
      this.startFresh();
    });
    this.$('continue-btn').addEventListener('click', () => {
      this.audio.ensure();
      this.audio.click();
      this.startFromSave();
    });
    this.$('help-btn').addEventListener('click', () => {
      this.audio.click();
      this.showOnly('help-screen');
    });
    this.$('help-back-btn').addEventListener('click', () => {
      this.audio.click();
      this.showOnly(this.state === 'paused' ? 'pause-screen' : 'menu-screen');
    });
    this.$('resume-btn').addEventListener('click', () => {
      this.audio.click();
      this.resume();
    });
    this.$('restart-mission-btn').addEventListener('click', () => {
      this.audio.click();
      this.missions.failMission('Restarted');
      this.resume();
    });
    this.$('quit-btn').addEventListener('click', () => {
      this.audio.click();
      this.autosave();
      this.state = 'menu';
      this.updateContinueButton();
      this.showOnly('menu-screen');
      document.exitPointerLock?.();
    });
    this.$('mute-btn').addEventListener('click', () => this.toggleMute());
    this.$('busted-btn').addEventListener('click', () => {
      this.audio.click();
      this.afterBusted();
    });
    this.$('wasted-btn').addEventListener('click', () => {
      this.audio.click();
      this.afterWasted();
    });
    // Any click on the canvas starts audio and locks the mouse while playing.
    this.renderer.domElement.addEventListener('click', () => {
      this.audio.ensure();
      if (this.state === 'playing' && !this.input.locked) this.lockPointer();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && !this.shotMode) {
        this.pause();
      }
    });
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.toggleMute();
      if (e.code === 'Escape' && this.state === 'paused') this.resume();
      if (e.code === 'KeyP') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
    });
  }

  // Pointer lock is best-effort: headless runs and synthetic clicks refuse
  // it, and the game plays fine with drag-look instead.
  lockPointer() {
    try {
      const p = this.renderer.domElement.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* pointer lock unavailable; drag-look still works */ }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.audio.setMuted(this.muted);
    this.$('mute-btn').textContent = this.muted ? 'Unmute (M)' : 'Mute (M)';
  }

  startFresh() {
    this.money = START_MONEY;
    this.packages = new Set();
    this.missions.completed = 0;
    this.missions.active = null;
    this.clockMinutes = 16 * 60 + 30;
    this.police.clearWanted();
    this.combat.clearEnemies();
    this.player.respawn(this.places.safehouse.x + 14, this.places.safehouse.z + 10);
    this.beginPlay();
  }

  startFromSave() {
    const data = loadGame();
    if (!data) return this.startFresh();
    this.money = data.money;
    this.packages = new Set(data.packages || []);
    this.missions.completed = data.missionsCompleted || 0;
    this.missions.active = null;
    this.clockMinutes = data.clockMinutes || 990;
    this.missions.buildPackages(this.scene, this.city.packageSpots, this.packages);
    this.player.respawn(data.playerX, data.playerZ);
    this.beginPlay();
    this.hud.toast('Welcome back to Solmar Bay');
  }

  beginPlay() {
    this.state = 'playing';
    this.showOnly(null);
    this.lockPointer();
    this.hud.setMoney(this.money);
    this.hud.setStars(0);
    this.hud.toast(this.missions.completed === 0
      ? 'Welcome to Solmar Bay — head to the gold marker to start your first job'
      : 'Back on the streets — the gold marker is your next job');
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.setEngine(0, false);
    this.audio.setSiren(false);
    this.showOnly('pause-screen');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.showOnly(null);
    this.lockPointer();
  }

  afterBusted() {
    this.money = Math.max(0, this.money - BUST_FINE);
    this.police.clearWanted();
    this.combat.clearEnemies();
    this.missions.failMission('Busted by the police');
    this.player.respawn(this.places.police.x, this.places.police.z + 14);
    this.state = 'playing';
    this.showOnly(null);
    this.hud.toast(`You paid a $${BUST_FINE} fine. Stay out of trouble, Rico.`);
    this.autosave();
  }

  afterWasted() {
    this.money = Math.max(0, this.money - 100);
    this.police.setStars(0);
    this.police.despawnAll();
    this.combat.clearEnemies();
    this.missions.failMission('Wasted');
    this.player.respawn(this.places.hospital.x, this.places.hospital.z + 14);
    this.state = 'playing';
    this.showOnly(null);
    this.hud.toast('You woke up at Solmar General. Hospital bill: $100.');
    this.autosave();
  }

  autosave() {
    saveGame({
      money: this.money,
      missionsCompleted: this.missions.completed,
      packages: this.packages,
      playerX: this.player.pos.x,
      playerZ: this.player.pos.z,
      clockMinutes: this.clockMinutes,
    });
  }

  // --- Events --------------------------------------------------------------------
  policeNearby(radius) {
    const near = (list) => list.some((c) => Math.hypot(c.pos.x - this.player.pos.x, c.pos.z - this.player.pos.z) < radius);
    return near(this.police.cars) || near(this.police.patrol) || near(this.police.cops);
  }

  onDrivingEvent(type, data) {
    if (type === 'carStolen') {
      if (this.policeNearby(70)) {
        this.police.addStars(1, 'stole a car in view of the police');
        this.hud.toast('The cops saw you steal that car!');
      } else {
        this.hud.toast('Nice wheels. Nobody saw a thing.');
      }
      if (data.car.type === 'taxi' && !this.missions.taxi) {
        this.missions.startTaxiFare(this.rng);
      }
    } else if (type === 'carExited') {
      if (data.car.type === 'taxi') this.missions.cancelTaxi();
    }
  }

  onPoliceEvent(type, data) {
    if (type === 'busted') {
      this.state = 'busted';
      document.exitPointerLock?.();
      this.$('busted-text').textContent = `The Solmar Bay police took you in. Fine: $${data.fine}.`;
      this.showOnly('busted-screen');
    } else if (type === 'wantedChanged') {
      this.hud.setStars(data.stars);
      if (data.stars > 0 && data.reason && data.reason !== 'clear') {
        this.hud.toast(`Wanted level: ${'★'.repeat(data.stars)}`);
      }
      if (data.stars === 0 && data.reason === 'escaped') {
        this.hud.toast('You lost them. Lay low for now.');
      }
    }
  }

  onCombatEvent(type, data) {
    if (type === 'shotFired') {
      this.peds.scare(this.player.pos.x, this.player.pos.z, 40);
      if (this.policeNearby(80)) this.police.addStars(1, 'fired a weapon near police');
    } else if (type === 'enemyKilled') {
      this.money += 50;
      this.hud.toast('Redcap down — +$50');
      this.missions.onEnemyKilled();
    } else if (type === 'pedShot') {
      this.police.addStars(1, 'shot a pedestrian');
    } else if (type === 'copShot') {
      this.police.addStars(2, 'shot an officer');
    }
  }

  onMissionEvent(type, data) {
    if (type === 'missionStarted') {
      this.hud.toast(`${data.mission.name} — ${data.mission.giver}: ${data.mission.brief}`, 6000);
      this.audio.pickup();
    } else if (type === 'missionComplete') {
      this.money += data.reward;
      this.audio.missionComplete();
      this.hud.toast(`${data.mission.name} complete! +$${data.reward}`, 5000);
      this.autosave();
    } else if (type === 'missionFailed') {
      this.audio.missionFailed();
      this.hud.toast(`Mission failed: ${data.reason}. Head back to the safehouse to retry.`, 5000);
      this.combat.clearEnemies();
    } else if (type === 'spawnEnemies') {
      this.combat.spawnEnemies(data.x, data.z, data.count);
    } else if (type === 'gainWanted') {
      this.police.addStars(data.stars, 'mission heat');
    } else if (type === 'stepChanged') {
      this.hud.toast(data.step.text, 4000);
    } else if (type === 'taxiStarted') {
      this.hud.toast(`Taxi job: pick up the fare ($${data.fare})`);
    } else if (type === 'taxiPickup') {
      this.hud.toast('Fare on board — drive them to the gold marker');
    } else if (type === 'taxiComplete') {
      this.money += data.fare;
      this.audio.pickup();
      this.hud.toast(`Fare complete! +$${data.fare}`);
      if (this.player.inCar && this.player.car.type === 'taxi') {
        this.missions.startTaxiFare(this.rng);
      }
    } else if (type === 'packageCollected') {
      this.money += data.reward;
      this.audio.pickup();
      this.hud.toast(`Hidden package found! +$${data.reward} (${this.missions.packagesCollected}/10)`);
    }
  }

  // --- Frame loop ------------------------------------------------------------------
  frameLoop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.frame++;
    const input = this.input;

    if (this.state === 'menu') {
      this.player.updateCamera(dt, this.camera, 'menu');
      this.traffic.update(dt, this.player.pos, this.traffic.allCars());
      this.peds.update(dt, this.player.pos, 0);
      this.renderer.render(this.scene, this.camera);
      this.checkShotReady();
      input.endFrame();
      return;
    }
    if (this.state !== 'playing') {
      // Paused / busted / wasted: render a frozen frame.
      this.renderer.render(this.scene, this.camera);
      input.endFrame();
      return;
    }

    // --- Playing -------------------------------------------------------------------
    this.clockMinutes += dt * 0.7; // a game hour every ~85 real seconds
    this.saveTimer += dt;
    if (this.saveTimer > SAVE_EVERY_SECONDS) {
      this.saveTimer = 0;
      this.autosave();
    }

    // Mouse look.
    if (input.locked || input.dragging) {
      this.player.applyMouseLook(input.mouseDX, input.mouseDY);
    }
    this.player.aiming = (input.rightDown || this.shotAiming) && !this.player.inCar;

    // Enter / exit cars.
    if (input.wasPressed('KeyE')) {
      if (this.player.inCar) this.driving.exitCar();
      else this.driving.tryEnterCar();
    }
    if (input.wasPressed('KeyR')) this.combat.reload();

    const obstacles = [...this.traffic.allCars(), ...this.police.cars, ...this.police.patrol];
    if (this.player.car) obstacles.push(this.player.car);

    if (this.player.inCar) {
      this.driving.update(dt, input, this.colliders, obstacles);
      this.checkRunOver();
      // Pay 'n Spray.
      const spray = this.police.tryPaynSpray(this.player, this.places, this.money);
      if (spray.done) {
        this.money -= spray.cost;
        this.audio.pickup();
        this.hud.toast(`Fresh paint, clean record. -$${spray.cost}`);
      } else if (spray.poor) {
        this.hud.toast(`Pay 'n Spray costs $${PAYNSPRAY_COST} — you're short`);
      }
      this.audio.setEngine(clamp(Math.abs(this.player.car.speed) / 42, 0, 1), true);
    } else {
      this.player.updateOnFoot(dt, input, this.colliders);
      this.audio.setEngine(0, false);
      // Shooting.
      if (input.mouseClicked || (input.mouseDown && this.combat.cooldown <= 0)) {
        const targets = this.shootTargets();
        this.combat.playerShoot(this.camera, this.player, targets);
      }
    }

    this.traffic.update(dt, this.player.pos, obstacles);
    this.peds.update(dt, this.player.pos, this.player.speed);
    this.police.update(dt, this.player, obstacles);
    this.combat.update(dt, this.player);
    this.missions.update(dt, this.player, this.police);
    this.missions.updateTaxi(dt, this.player);
    this.missions.updatePackages(dt, this.player, this.packages);

    // Health regen out of combat; damage flash; death.
    if (this.player.health < PLAYER_HEALTH_MAX && this.police.stars === 0) {
      this.player.heal(dt * 2);
    }
    if (this.player.health < this.lastHealth) this.hud.flashDamage();
    this.lastHealth = this.player.health;
    if (this.player.dead && this.state === 'playing') {
      this.state = 'wasted';
      document.exitPointerLock?.();
      this.showOnly('wasted-screen');
    }

    // Ocean shimmer.
    this.city.ocean.position.y = 0.02 + Math.sin(performance.now() / 900) * 0.05;

    this.player.updateCamera(dt, this.camera, 'play');
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
    this.checkShotReady();
    input.endFrame();
  }

  checkRunOver() {
    const car = this.player.car;
    if (!car || Math.abs(car.speed) < 8) return;
    for (const ped of this.peds.peds) {
      if (ped.state === 'down') continue;
      const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
      if (d < 2.6) {
        this.peds.knockDown(ped);
        this.peds.scare(car.pos.x, car.pos.z, 30);
        if (this.policeNearby(90)) {
          this.police.addStars(1, 'ran over a pedestrian');
        }
        this.hud.toast('You ran someone over!');
      }
    }
  }

  shootTargets() {
    const targets = [];
    for (const e of this.combat.enemies) {
      targets.push({ kind: 'enemy', pos: e.pos, ref: e, alive: e.alive });
    }
    for (const ped of this.peds.peds) {
      if (ped.state === 'down') continue;
      targets.push({ kind: 'ped', pos: ped.pos, ped, system: this.peds });
    }
    for (const cop of this.police.cops) {
      targets.push({ kind: 'cop', pos: cop.pos, cop });
    }
    return targets;
  }

  updateHud() {
    this.hud.setMoney(this.money);
    this.hud.setHealth(this.player.health);
    this.hud.setClock(this.clockMinutes);
    this.hud.setSpeed(this.player.inCar ? Math.abs(this.player.car.speed) * 3.6 : 0, this.player.inCar);
    this.hud.setAmmo(this.combat.ammo, this.combat.reloading > 0);
    if (this.player.inCar) this.hud.el.ammo.textContent = '';
    this.hud.setAiming(this.player.aiming);
    const mission = this.missions.currentMission;
    let timeLeft = null;
    const step = this.missions.currentStep;
    if (this.missions.active && step && step.time !== undefined) {
      timeLeft = step.time - this.missions.active.timer;
    }
    this.hud.setObjective(mission ? mission.name : null, this.missions.objectiveText, timeLeft);
    // Context hint.
    let hint = '';
    if (!this.player.inCar) {
      const car = this.traffic.nearestCar(this.player.pos.x, this.player.pos.z, ENTER_CAR_RANGE);
      if (car) hint = 'E — Get in the car';
      else if (this.player.aiming) hint = 'Click — Shoot · R — Reload';
      else hint = 'WASD — Move · Shift — Run · Right mouse — Aim · E — Enter car';
    } else {
      hint = 'W/S — Drive · A/D — Steer · Space — Handbrake · E — Exit';
    }
    this.hud.setHint(hint);
    this.hud.drawMinimap({
      player: this.player,
      police: this.police,
      traffic: this.traffic,
      target: this.missions.targetPoint,
    });
  }

  checkShotReady() {
    if (!this.shotMode || window.__solmarShotReady) return;
    this.shotFrames++;
    // Let the camera settle and the world run a little before capturing.
    // (The camera lerps settle within ~30 frames even at low frame rates.)
    if (this.shotFrames > 35) {
      markShotReady();
      console.log('[solmar] shot ready:', this.shotMode);
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

document.title = GAME_TITLE + ' — an open-world crime game';
new Game();
