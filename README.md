# Solmar Nights — makefun-gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/nhutqui1890/makefun-gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/nhutqui1890/makefun-gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Nights** is a complete open-world crime game set in the sun-soaked
fictional city of Solmar Bay, built for make.fun's "Make GTA 6" bounty. You
play Rico Vega, a wheelman working his way up from stolen sedans to the big
score — driving, shooting, outrunning the Solmar Bay PD, and running the
city's streets. Everything is original: the city, characters, vehicles,
story, art and music are made for this game, with nothing from any
commercial game.

## What's in the world

- **A city to explore on foot and by car** — a procedural 7×7 grid of
  pastel towers, parks, palm-lined beaches, a pier and billboards, all
  generated from a seed, with a golden-hour sun and real-time shadows.
- **Traffic and pedestrians** — cars drive the road grid in right-hand
  lanes, turn at intersections and stop for the car ahead; pedestrians
  stroll the sidewalks and run for cover when shots ring out.
- **Cars to steal and drive** — sedans, sports cars, vans, trucks and
  taxis, with arcade handling, handbrake slides and crash physics.
  Steal one in view of the police and you'll earn stars for it.
- **A wanted system and police** — 5 stars, patrol cars that witness
  crime, pursuit cars that ram, foot cops that grab you, roadblocks at
  4 stars, and a Pay 'n Spray garage that clears your record.
- **Missions and a story** — 5 story missions from Mama Rosa and Eddie
  Voss (steal a getaway car, race a delivery, lose the heat, clear out
  the Redcaps, pull the big score), plus taxi fares and 10 hidden
  packages to find.
- **Combat** — a hitscan pistol with magazine and reload, muzzle flash,
  tracers, and gang members who shoot back.
- **HUD with a minimap** — health, money, wanted stars, speedometer,
  mission objective, clock, and a scrolling minimap with police blips
  and the gold mission marker.
- **Start screen, pause, save** — title screen over the city, pause
  menu, busted/wasted flow, and autosave to localStorage.
- **Procedural sound** — synthesised engine, sirens, gunshots and a
  synthwave music loop, all generated with WebAudio. No audio files.

## Run it

The game is static files under `game/` and plays offline in desktop
Chrome with no network request. Serve it with any static file server:

```sh
cd game && python3 -m http.server 8080
```

Then open http://localhost:8080. (Any static server works — the game
only needs `game/index.html` and the files beside it.)

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look around (click to lock) |
| Shift | Run |
| Space | Jump · handbrake while driving |
| E | Enter / exit car |
| Right mouse | Aim |
| Left mouse | Shoot |
| R | Reload |
| P / Esc | Pause |
| M | Mute |

## Layout

- `main.ts` — the entry program (Node 22, stdlib only): copies `game/`
  and `screenshots/` to the output and writes `dossier.json`.
- `game/index.html` — the page: HUD, menus, import map for three.js.
- `game/src/` — the game's own source, one system per file:
  `main.js` (loop + state machine), `city.js` (procedural city),
  `vehicles.js` (cars + traffic), `pedestrians.js`, `player.js`,
  `driving.js`, `police.js` (wanted system), `combat.js`,
  `missions.js`, `hud.js` (HUD + minimap), `audio.js` (synth sound),
  `save.js`, `input.js`, `characters.js`, `shots.js` (screenshot
  staging), `config.js`, `rng.js`.
- `game/vendor/three.module.min.js` — vendored three.js r160 (MIT).
- `screenshots/` — real renders of the game, taken in headless Chrome.

## Screenshots

The cover is a 3-star police chase during the final mission; the rest
show the city on foot, the warehouse firefight, and the title screen.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
