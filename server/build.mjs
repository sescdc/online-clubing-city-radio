import { mkdir, readFile, writeFile } from 'node:fs/promises';

const assetTypes = {
  'index.html': 'text/html; charset=utf-8',
  'club.js': 'text/javascript; charset=utf-8',
  'stage.js': 'text/javascript; charset=utf-8',
  'karaoke.js': 'text/javascript; charset=utf-8',
  'party.js': 'text/javascript; charset=utf-8',
  'club.css': 'text/css; charset=utf-8',
  'karaoke-city-lights.mp3': 'audio/mpeg',
  'karaoke-after-hours.mp3': 'audio/mpeg',
  'hero.webp': 'image/webp'
};
const root = new URL('../', import.meta.url);
const assets = {};
for (const [name, type] of Object.entries(assetTypes)) {
  const file = await readFile(new URL('dist/' + name, root));
  assets[name] = [type, /\.(webp|gz|mp3)$/.test(name) ? file.toString('base64') : file.toString('utf8')];
}

const output = new URL('dist/server/', root);
await mkdir(output, {recursive: true});
const worker = await readFile(new URL('worker.mjs', import.meta.url), 'utf8');
await writeFile(new URL('index.js', output), 'const assets = ' + JSON.stringify(assets) + ';\n' + worker);
