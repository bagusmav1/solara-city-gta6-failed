// Hand in Solara City: Portside Run with its playable files and cover images.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const base = fileURLToPath(new URL('.', import.meta.url));
const destination = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const pictures = join(base, 'screenshots');
const submittedPictures = join(destination, 'screenshots');

mkdirSync(destination, { recursive: true });
cpSync(join(base, 'game'), join(destination, 'game'), { recursive: true });
mkdirSync(submittedPictures, { recursive: true });
if (existsSync(pictures)) {
  cpSync(pictures, submittedPictures, { recursive: true });
}

const dossier = buildDossier(destination, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(destination, 'dossier.json'), dossier);
