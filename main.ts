// Solmar Nights — the entry program for make.fun's gta6-01 (Node 22,
// standard library only). It hands the game in: copies game/ (the playable
// open world, static files) and screenshots/ (real renders of the game)
// from beside this file into the output directory, then writes
// /output/dossier.json with the kit's vendored buildDossier library, which
// the sealed scorer re-derives byte for byte. Deterministic: the same
// repository always produces the same bytes.
//
// Local check: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The sealed gate's caps (reference/gate.json): game/ at most 993 entries
// and 48 MiB, 3-4 screenshots at most 256 KiB each, dossier text 160 KiB.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
