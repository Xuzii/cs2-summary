/**
 * Inspect a parser JSON output file to see what fields are actually emitted.
 * Usage:
 *   npx tsx src/cli/inspect.ts <path-to-parser-output.json>
 *
 * Prints top-level keys, sample kill, sample round, sample player, and whether
 * clutches / grenades / playerBlinds arrays are present — the exact info we
 * need to debug missing data in the Discord summary PNG.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function firstJsonFile(dir: string): string | undefined {
  for (const name of readdirSync(dir)) {
    if (name.toLowerCase().endsWith('.json')) return path.join(dir, name);
  }
  return undefined;
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: npx tsx src/cli/inspect.ts <path-to-json-or-folder>');
    process.exit(2);
  }

  let jsonPath = path.resolve(arg);
  const s = statSync(jsonPath);
  if (s.isDirectory()) {
    const found = firstJsonFile(jsonPath);
    if (!found) {
      console.error(`No .json file found in ${jsonPath}`);
      process.exit(2);
    }
    jsonPath = found;
  }

  console.log(`Inspecting ${jsonPath}\n`);
  const raw: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const root = unwrap(raw);
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    console.log('Root is not an object.');
    return;
  }

  const obj = root as Record<string, unknown>;
  console.log('Top-level keys:');
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    console.log(`  ${k}: ${describe(v)}`);
  }
  console.log('');

  const kills = firstArray(obj, ['kills']);
  if (kills && kills.length > 0) {
    console.log(`Sample kill (out of ${kills.length}):`);
    console.log(indent(JSON.stringify(kills[0], null, 2), 2));
    console.log('');
  } else {
    console.log('No `kills` array present (or empty).');
  }

  const rounds = firstArray(obj, ['rounds']);
  if (rounds && rounds.length > 0) {
    console.log(`Sample round (out of ${rounds.length}):`);
    console.log(indent(JSON.stringify(rounds[0], null, 2), 2));
    console.log('');
  } else {
    console.log('No `rounds` array present (or empty).');
  }

  const players = obj['players'];
  if (typeof players === 'object' && players !== null) {
    const entries = Array.isArray(players)
      ? players
      : Object.values(players as Record<string, unknown>);
    if (entries.length > 0) {
      console.log(`Sample player (out of ${entries.length}):`);
      console.log(indent(JSON.stringify(entries[0], null, 2), 2));
      console.log('');
    }
  }

  for (const key of [
    'clutches',
    'grenades',
    'grenadeThrows',
    'playerBlinds',
    'blinds',
    'smokeStarted',
    'heGrenadeExploded',
  ]) {
    const arr = obj[key];
    if (Array.isArray(arr)) {
      console.log(`${key}: array of ${arr.length}`);
      if (arr.length > 0) console.log(indent(JSON.stringify(arr[0], null, 2), 2));
      console.log('');
    }
  }
}

function unwrap(v: unknown): unknown {
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    const obj = v as Record<string, unknown>;
    if ('match' in obj && typeof obj['match'] === 'object' && obj['match'] !== null) {
      return obj['match'];
    }
  }
  return v;
}

function firstArray(obj: Record<string, unknown>, keys: string[]): unknown[] | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
  }
  return undefined;
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array(${v.length})`;
  if (typeof v === 'object') return `object{${Object.keys(v as object).length}}`;
  return `${typeof v}: ${truncate(String(v), 40)}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function indent(s: string, n: number): string {
  const pad = ' '.repeat(n);
  return s
    .split('\n')
    .map((l) => pad + l)
    .join('\n');
}

main();
