import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const assetTypes = {
  'index.html': 'text/html; charset=utf-8',
  'exclusive.js': 'text/javascript; charset=utf-8',
  'exclusive-schedule.js': 'text/javascript; charset=utf-8',
  'dj-big-mix.webp': 'image/webp',
  'dj-big-mix.mp4': 'video/mp4',
  'dj-90s-throwback.mp4': 'video/mp4',
  'dj-90s-throwback.webp': 'image/webp',
  'dj-old-school.mp3': 'audio/mpeg',
  'dj-bay-funk.mp3': 'audio/mpeg',
  'dj-late-night.mp3': 'audio/mpeg',
  'club.js': 'text/javascript; charset=utf-8',
  'stage.js': 'text/javascript; charset=utf-8',
  'karaoke.js': 'text/javascript; charset=utf-8',
  'party-segmentation-worker.js': 'text/javascript; charset=utf-8',
  'party-background.js': 'text/javascript; charset=utf-8',
  'party.js': 'text/javascript; charset=utf-8',
  'club.css': 'text/css; charset=utf-8',
  'karaoke-city-lights.mp3': 'audio/mpeg',
  'karaoke-after-hours.mp3': 'audio/mpeg',
  'hero.webp': 'image/webp'
};
for (const scene of ['neon', 'vip', 'rooftop', 'velvet', 'warehouse', 'disco', 'tropical', 'arcade', 'vinyl', 'tunnel']) {
  assetTypes['club-' + scene + '.webp'] = 'image/webp';
}
const root = new URL('../', import.meta.url);
const assets = {};
for (const [name, type] of Object.entries(assetTypes)) {
  const file = await readFile(new URL('dist/' + name, root));
  assets[name] = [type, /\.(webp|gz|mp3|mp4)$/.test(name) ? file.toString('base64') : file.toString('utf8')];
}

// Serve the selfie model and its runtimes from the same origin as the video room.
const modelFiles = {
  'tf.min.js': ['node_modules/@tensorflow/tfjs/dist/tf.min.js', 'text/javascript'],
  'tf-backend-wasm.min.js': ['node_modules/@tensorflow/tfjs-backend-wasm/dist/tf-backend-wasm.min.js', 'text/javascript'],
  'selfie.json': ['server/models/selfie.json', 'application/json'],
  'selfie.bin': ['server/models/selfie.bin', 'application/octet-stream']
};
for (const suffix of ['', '-simd', '-threaded-simd']) {
  const name = 'tfjs-backend-wasm' + suffix + '.wasm';
  modelFiles[name] = ['node_modules/@tensorflow/tfjs-backend-wasm/dist/' + name, 'application/wasm'];
}
for (const [name, [source, type]] of Object.entries(modelFiles)) {
  const file = await readFile(new URL(source, root));
  assets['party-model/' + name] = [type, gzipSync(file).toString('base64'), 'gzip'];
}

const output = new URL('dist/server/', root);
await mkdir(output, {recursive: true});
const worker = await readFile(new URL('worker.mjs', import.meta.url), 'utf8');
const schedule = await readFile(new URL('dist/exclusive-schedule.js', root), 'utf8');
await writeFile(new URL('index.js', output),
  'const assets = ' + JSON.stringify(assets) + ';\n' + schedule.replace('export function', 'function') + '\n' + worker);
