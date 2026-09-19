// Replays a talk through Jev a few words at a time, as live speech-to-text would, and prints when each
// talking point gets checked off. Uses TYPESAFE_API_KEY or OPENROUTER_API_KEY from .env or the shell.
//
//   node replay.js                                     # examples/show-opening-*.txt
//   node replay.js --every=10 --threshold=1.5
//   node replay.js --transcript=talk.txt --points=points.txt
import { readFileSync } from 'node:fs';
import { makeJev, scorePoints, parsePoints, PROVIDERS } from './prompter.js';

try {
  for (const line of readFileSync(new URL('.env', import.meta.url), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
const provider = process.env.TYPESAFE_API_KEY ? 'typesafe' : process.env.OPENROUTER_API_KEY ? 'openrouter' : null;
if (!provider) {
  console.error('Set TYPESAFE_API_KEY or OPENROUTER_API_KEY in .env (see .env.example) or in your shell.');
  process.exit(1);
}
const jev = makeJev({ provider, key: process.env[provider === 'typesafe' ? 'TYPESAFE_API_KEY' : 'OPENROUTER_API_KEY'] });

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const every = Number(arg('every', 15));
const threshold = Number(arg('threshold', 1));
const read = (path) => readFileSync(new URL(path, `file://${process.cwd()}/`), 'utf8');
const transcript = arg('transcript') ? read(arg('transcript')) : readFileSync(new URL('examples/show-opening-talk.txt', import.meta.url), 'utf8');
const points = parsePoints(arg('points') ? read(arg('points')) : readFileSync(new URL('examples/show-opening-points.txt', import.meta.url), 'utf8'));

const words = transcript.split(/\s+/).filter(Boolean);
const best = Object.fromEntries(points.map((p) => [p.id, 0]));
const doneAt = {};
let cost = 0, calls = 0, ms = 0;

console.log(`${PROVIDERS[provider].name}: ${words.length} words, ${points.length} points, a Jev call every ${every} words, check-off at score >= ${threshold}\n`);
for (let n = Math.min(every, words.length); ; n = Math.min(n + every, words.length)) {
  const open = points.filter((p) => !(p.id in doneAt));
  if (!open.length) break;
  const t0 = performance.now();
  const r = await scorePoints(jev, words.slice(0, n).join(' '), open);
  ms += performance.now() - t0; calls++; cost = r.cost == null ? null : cost + r.cost;
  for (const p of open) {
    const s = r.scores[p.id];
    if (!s) continue;
    best[p.id] = Math.max(best[p.id], s.score);
    if (s.score >= threshold) {
      doneAt[p.id] = n;
      console.log(`✓ word ${String(n).padStart(4)}  score ${s.score.toFixed(2)}  ${p.text}\n      …${words.slice(Math.max(0, n - 14), n).join(' ')}`);
    }
  }
  if (n === words.length) break;
}

console.log('\nFinal:');
for (const p of points) console.log(`${p.id in doneAt ? '✓' : '·'} best ${best[p.id].toFixed(2)}  ${p.text}`);
console.log(`\n${calls} Jev calls, ${cost == null ? 'cost billed by TypeSafe' : `$${cost.toFixed(5)} total`}, ${Math.round(ms / calls)} ms average per call`);
