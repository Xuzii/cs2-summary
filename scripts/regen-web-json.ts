/**
 * Regenerate the web-consumed MatchDocument JSON from an already-parsed
 * analyzer JSON folder, without re-running csda.exe.
 *
 * Usage:
 *   npx tsx scripts/regen-web-json.ts <analyzer-json-folder> [--out=<dir>]
 *
 * Typical invocation — regenerate the sample match so the new playback
 * schema (sampleHz, trajectories, effects) lands in the file the dev
 * server reads:
 *
 *   npx tsx scripts/regen-web-json.ts data/smoke-new-export --out=web/public/matches
 *
 * When the source analyzer JSON lacks `playerPositions` (i.e. was parsed
 * WITHOUT `-positions`), the new trajectory/effect arrays will be empty —
 * the web UI degrades gracefully to the old waypoint-only viewer. To get
 * actual 8Hz arcs, re-parse the .dem with `INCLUDE_POSITIONS=true` via the
 * normal pipeline.
 */
import path from 'node:path';
import { statSync } from 'node:fs';
import { loadMatchFromJsonFolder } from '../src/analyzer/load-match.ts';
import { computeMatchSummary } from '../src/scoreboard/compute.ts';
import { computePlayerCard } from '../src/scoreboard/compute/player-card.ts';
import { loadRadarAsset } from '../src/scoreboard/load-radar.ts';
import { exportMatchJson } from '../src/scoreboard/export-match-json.ts';

async function main() {
  const positional: string[] = [];
  let outDir = 'web/public/matches';
  for (const arg of process.argv.slice(2)) {
    const m = /^--out=(.+)$/.exec(arg);
    if (m) {
      outDir = m[1]!;
    } else {
      positional.push(arg);
    }
  }
  const src = positional[0];
  if (!src) {
    console.error('Usage: npx tsx scripts/regen-web-json.ts <analyzer-json-folder> [--out=<dir>]');
    process.exit(2);
  }

  const inputPath = path.resolve(src);
  const folder = statSync(inputPath).isDirectory() ? inputPath : path.dirname(inputPath);
  const writeDir = path.resolve(outDir);

  console.log(`[regen] Loading match JSON from ${folder}`);
  const match = await loadMatchFromJsonFolder(folder);
  console.log(
    `[regen] Match: ${match.mapName} · ${match.teamA.name} ${match.teamA.score} - ${match.teamB.score} ${match.teamB.name}`,
  );
  console.log(
    `[regen] playerPositions: ${match.playerPositions?.length ?? 0}, ` +
      `grenadePositions: ${match.grenadePositions?.length ?? 0}, ` +
      `infernoPositions: ${match.infernoPositions?.length ?? 0}`,
  );
  if ((match.playerPositions?.length ?? 0) === 0) {
    console.log('[regen] No per-tick positions in source JSON — trajectories/effects will be empty.');
    console.log('[regen] To populate them, re-parse the .dem with INCLUDE_POSITIONS=true.');
  }

  const summary = computeMatchSummary(match);
  const radar = (await loadRadarAsset(match.mapName).catch(() => null)) ?? null;

  // Build player cards for all tracked steam IDs we can infer (env + every
  // player in the match). The helper silently drops non-players.
  const envTracked = (process.env.TRACKED_PLAYERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const meTracked = process.env.STEAM_ID64 ? [process.env.STEAM_ID64] : [];
  const allIds = [...meTracked, ...envTracked, ...match.players.map((p) => p.steamId)];
  const uniqIds = [...new Set(allIds)];
  const playerCards = uniqIds
    .map((id) => computePlayerCard(match, id))
    .filter((c): c is NonNullable<typeof c> => c !== null);

  console.log(`[regen] Player cards generated: ${playerCards.length}`);

  const result = await exportMatchJson(summary, playerCards, radar, writeDir);
  console.log(`[regen] Wrote ${result.jsonPath} (${(result.bytes / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
