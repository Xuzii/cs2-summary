#!/usr/bin/env node
/**
 * One-off helper: extract the `window.MATCH = {...}` payload from the existing
 * sample scoreboard HTML and write it to web/public/matches/sample.json in the
 * MatchDocument shape the React app expects.
 *
 * Rewrites `heroMapImage` and `heatmap.radarFileUrl` from local file:// URLs
 * to bare map names so the React app resolves them via /static/radars/<name>.png.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const IN = path.join(ROOT, 'data', 'sample-scoreboard.html');
const OUT = path.join(ROOT, 'web', 'public', 'matches', 'sample.json');

const html = await readFile(IN, 'utf8');
const m = html.match(/window\.MATCH\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
if (!m) {
  console.error('Could not find window.MATCH payload in', IN);
  process.exit(1);
}
const match = JSON.parse(m[1]);

// Rewrite file:// radar URLs → bare map name.
function bareMapName(url) {
  if (!url) return null;
  const base = url.split('/').pop() || '';
  return base.replace(/\.png$/i, '');
}
if (match.heroMapImage) match.heroMapImage = bareMapName(match.heroMapImage);
if (match.heatmap?.radarFileUrl) match.heatmap.radarFileUrl = bareMapName(match.heatmap.radarFileUrl);

const doc = {
  id: 'sample',
  version: 1,
  match,
  players: [],
};
await writeFile(OUT, JSON.stringify(doc, null, 2), 'utf8');
console.log('wrote', OUT, `(${JSON.stringify(doc).length} bytes)`);
