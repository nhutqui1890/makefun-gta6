// Solmar Nights — shared tuning constants and the city palette.
// One place for every number the other systems agree on: the grid, the
// wanted ladder, money, speeds and colours. Nothing here imports three.js.

export const GAME_TITLE = 'SOLMAR NIGHTS';
export const CITY_NAME = 'Solmar Bay';

// --- City grid -------------------------------------------------------------
export const ROAD_SPACING = 90; // distance between road centrelines
export const ROAD_COUNT = 7; // roads per axis, so the city spans 6 * 90
export const ROAD_WIDTH = 14;
export const BLOCK_SIZE = ROAD_SPACING - ROAD_WIDTH; // 76
export const CITY_HALF = ((ROAD_COUNT - 1) / 2) * ROAD_SPACING; // 270
export const GROUND_SIZE = 900; // ground plane, ocean beyond the south edge
export const BEACH_Z = CITY_HALF + 24; // sand strip starts here
export const OCEAN_Z = CITY_HALF + 60; // water starts here

// Road centrelines: -270, -180, -90, 0, 90, 180, 270.
export const ROAD_LINES = Array.from({ length: ROAD_COUNT }, (_, i) => (i - (ROAD_COUNT - 1) / 2) * ROAD_SPACING);

// --- Player ----------------------------------------------------------------
export const PLAYER_WALK_SPEED = 7;
export const PLAYER_RUN_SPEED = 11;
export const PLAYER_JUMP_SPEED = 7.5;
export const PLAYER_HEALTH_MAX = 100;
export const PLAYER_RADIUS = 0.7;
export const ENTER_CAR_RANGE = 4.2;

// --- Driving ---------------------------------------------------------------
export const CAR_ACCEL = 26;
export const CAR_BRAKE = 42;
export const CAR_MAX_SPEED = 42; // m/s, sports cars multiply this
export const CAR_REVERSE_MAX = 12;
export const CAR_TURN_RATE = 2.1; // rad/s at full lock, scaled by speed
export const CAR_DRAG = 0.35;
export const CAR_RADIUS = 2.4; // collision circle

// --- Wanted ladder ---------------------------------------------------------
// stars -> { cop cars chasing, foot cops chasing, roadblocks }
export const WANTED_LADDER = {
  0: { cars: 0, foot: 0, roadblock: false },
  1: { cars: 1, foot: 0, roadblock: false },
  2: { cars: 2, foot: 0, roadblock: false },
  3: { cars: 3, foot: 2, roadblock: false },
  4: { cars: 4, foot: 3, roadblock: true },
  5: { cars: 5, foot: 4, roadblock: true },
};
export const WANTED_DECAY_SECONDS = 18; // unseen this long -> lose a star
export const BUST_GRAB_SECONDS = 1.6; // a foot cop this close, this long
export const BUST_FINE = 150;
export const PAYNSPRAY_COST = 100;

// --- Money -----------------------------------------------------------------
export const START_MONEY = 200;
export const PACKAGE_REWARD = 250;
export const TAXI_BASE_FARE = 60;

// --- Population ------------------------------------------------------------
export const TRAFFIC_COUNT = 14;
export const PEDESTRIAN_COUNT = 26;
export const PARKED_COUNT = 12;

// --- Colours: a sun-soaked pastel city at golden hour ----------------------
export const PALETTE = {
  sky: 0x87b5d6,
  fog: 0x9fc3dd,
  sun: 0xfff2cf,
  ground: 0x8fae7e,
  sand: 0xe8d49a,
  ocean: 0x2e7fa8,
  asphalt: 0x33363b,
  sidewalk: 0xb9b3a6,
  building: [0xf2e3c9, 0xe8c8b0, 0xd9e2e8, 0xf5d5a0, 0xc9d6c5, 0xe5b8b8, 0xbcd3e0, 0xf0e6d2],
  glass: 0x7fb4cc,
  palmTrunk: 0x8a6a4a,
  palmLeaf: 0x3f9e4d,
  carPaint: [0xc23b3b, 0x3b6fc2, 0xe8e8e8, 0x22262b, 0xd8a13c, 0x4fae62, 0x7a4fb0, 0x38b8b0, 0xd96a2b, 0x9aa5ad],
};

// --- Missions --------------------------------------------------------------
export const MISSION_NAMES = [
  'First Wheels',
  'The Delivery',
  'Heat on the Street',
  'Rooftop Deal',
  'The Big Score',
];
