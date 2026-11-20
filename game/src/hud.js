// Solmar Nights — the HUD: health and money, wanted stars, the speedometer,
// the objective line, toast messages, and the circular minimap that draws
// the road grid, the player arrow, police, traffic and the mission blip.

import { ROAD_LINES, ROAD_WIDTH, CITY_HALF, PLAYER_HEALTH_MAX } from './config.js';

export class Hud {
  constructor() {
    this.el = {};
    for (const id of [
      'health-fill', 'health-text', 'money', 'stars', 'speed', 'speed-unit',
      'objective', 'mission-title', 'ammo', 'toast', 'clock', 'damage-flash',
      'crosshair', 'hint', 'wanted-label',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCanvas = document.getElementById('minimap');
    this.mapCtx = this.mapCanvas.getContext('2d');
    this.toastTimer = null;
    this.lastMoney = -1;
    this.moneyPop = 0;
  }

  setMoney(amount) {
    if (amount === this.lastMoney) return;
    const gained = amount > this.lastMoney;
    this.lastMoney = amount;
    this.el.money.textContent = '$' + amount.toLocaleString('en-US');
    this.el.money.classList.remove('pop-gain', 'pop-loss');
    // Force a reflow so the pop animation replays.
    void this.el.money.offsetWidth;
    this.el.money.classList.add(gained ? 'pop-gain' : 'pop-loss');
  }

  setHealth(health) {
    const pct = Math.max(0, (health / PLAYER_HEALTH_MAX) * 100);
    this.el['health-fill'].style.width = pct + '%';
    this.el['health-fill'].classList.toggle('low', pct < 30);
    this.el['health-text'].textContent = Math.ceil(health);
  }

  setStars(stars) {
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += `<span class="star ${i < stars ? 'on' : ''}">★</span>`;
    }
    this.el.stars.innerHTML = html;
    this.el['wanted-label'].textContent = stars > 0 ? 'WANTED' : '';
    this.el['wanted-label'].classList.toggle('hot', stars >= 3);
  }

  setSpeed(kmh, driving) {
    this.el.speed.textContent = driving ? String(Math.round(kmh)) : '';
    this.el['speed-unit'].textContent = driving ? 'km/h' : '';
  }

  setAmmo(ammo, reloading) {
    this.el.ammo.textContent = reloading ? 'RELOADING…' : `AMMO ${ammo} / 12`;
  }

  setObjective(missionName, text, timeLeft) {
    this.el['mission-title'].textContent = missionName || 'FREE ROAM';
    let full = text;
    if (timeLeft !== undefined && timeLeft !== null) {
      full += `  —  ${Math.ceil(timeLeft)}s`;
    }
    if (this.el.objective.textContent !== full) this.el.objective.textContent = full;
  }

  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    this.el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setAiming(aiming) {
    this.el.crosshair.style.display = aiming ? 'block' : 'none';
  }

  setHint(text) {
    if (this.el.hint.textContent !== text) this.el.hint.textContent = text;
  }

  toast(text, ms = 3200) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  flashDamage() {
    const el = this.el['damage-flash'];
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => el.classList.remove('hit'), 350);
  }

  // --- Minimap ---------------------------------------------------------------
  // A scrolling top-down view: 260 world units across, north up, the player
  // centred, roads in grey, the mission blip in gold, police flashing.
  drawMinimap(world) {
    const ctx = this.mapCtx;
    const S = this.mapCanvas.width; // 190
    const half = S / 2;
    const view = 260; // world units across the map
    const scale = S / view;
    const { player, police, traffic, target } = world;
    const px = player.pos.x;
    const pz = player.pos.z;

    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.clip();
    // Ground.
    ctx.fillStyle = '#24382a';
    ctx.fillRect(0, 0, S, S);
    const toMap = (x, z) => [half + (x - px) * scale, half + (z - pz) * scale];
    // Roads.
    ctx.strokeStyle = '#5a6068';
    ctx.lineWidth = Math.max(2, ROAD_WIDTH * scale);
    ctx.lineCap = 'square';
    for (const line of ROAD_LINES) {
      const [ax, ay] = toMap(-CITY_HALF, line);
      const [bx, by] = toMap(CITY_HALF, line);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const [cx, cy] = toMap(line, -CITY_HALF);
      const [dx, dy] = toMap(line, CITY_HALF);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(dx, dy);
      ctx.stroke();
    }
    // Ocean at the south edge.
    const [, oceanY] = toMap(0, 330);
    if (oceanY < S) {
      ctx.fillStyle = '#2e7fa8';
      ctx.fillRect(0, oceanY, S, S - oceanY);
    }
    // Traffic dots.
    ctx.fillStyle = '#ffffff';
    for (const car of traffic.allCars()) {
      const [mx, my] = toMap(car.pos.x, car.pos.z);
      if (mx < 0 || mx > S || my < 0 || my > S) continue;
      ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }
    // Police blips, flashing red/blue (pursuit) or steady blue (patrol).
    const flash = Math.sin(performance.now() / 160) > 0;
    ctx.fillStyle = flash ? '#ff4444' : '#4488ff';
    for (const car of police.cars) {
      const [mx, my] = toMap(car.pos.x, car.pos.z);
      if (mx < 0 || mx > S || my < 0 || my > S) continue;
      ctx.beginPath();
      ctx.arc(mx, my, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4488ff';
    for (const car of police.patrol) {
      const [mx, my] = toMap(car.pos.x, car.pos.z);
      if (mx < 0 || mx > S || my < 0 || my > S) continue;
      ctx.beginPath();
      ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const cop of police.cops) {
      const [mx, my] = toMap(cop.pos.x, cop.pos.z);
      if (mx < 0 || mx > S || my < 0 || my > S) continue;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Mission / taxi target: a gold diamond, clamped to the map edge with
    // an arrow when it is off the map.
    if (target) {
      let [mx, my] = toMap(target.x, target.z);
      const dx = mx - half;
      const dy = my - half;
      const dist = Math.hypot(dx, dy);
      const maxR = half - 12;
      if (dist > maxR) {
        mx = half + (dx / dist) * maxR;
        my = half + (dy / dist) * maxR;
      }
      ctx.fillStyle = '#ffd94d';
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    }
    // Player arrow, pointing along the heading.
    const heading = player.inCar ? player.car.heading : player.heading;
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // Rim.
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}
