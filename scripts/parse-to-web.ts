/**
 * One-shot: parse a .dem file and write the MatchDocument JSON directly into
 * web/matches/. Skips Discord + gh-pages so it's safe for local
 * iteration / previewing.
 *
 *   npx tsx scripts/parse-to-web.ts "<path-to-demo.dem>"
 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig } from '../src/config.ts';
import { parseDemoToJson } from '../src/analyzer/run-analyzer.ts';
import { loadMatchFromJsonFolder } from '../src/analyzer/load-match.ts';
import { computeMatchSummary } from '../src/scoreboard/compute.ts';
import { computePlayerCard } from '../src/scoreboard/compute/player-card.ts';
import { loadRadarAsset } from '../src/scoreboard/load-radar.ts';
import { exportMatchJson } from '../src/scoreboard/export-match-json.ts';
import { upsertMatchIndex } from '../src/web/index-writer.ts';

async function main() {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const demoPath = positional[0];
  if (!demoPath) {
    console.error('Usage: npx tsx scripts/parse-to-web.ts <demo.dem>');
    process.exit(2);
  }
  const abs = path.resolve(demoPath);
  if (!existsSync(abs)) {
    console.error(`Demo not found: ${abs}`);
    process.exit(2);
  }

  const config = loadConfig();
  const writeDir = path.resolve('web/matches');

  console.log(`[parse] Parsing ${abs}`);
  const { outputFolder } = await parseDemoToJson({
    demoPath: abs,
    outputRoot: config.dataDir,
    includePositions: config.includePositions,
    onStderr: (line) => process.stderr.write(`[csda] ${line}`),
  });

  console.log(`[parse] Loading parser output from ${outputFolder}`);
  const match = await loadMatchFromJsonFolder(outputFolder);
  console.log(
    `[parse] Match: ${match.mapName} · ${match.teamA.name} ${match.teamA.score} - ${match.teamB.score} ${match.teamB.name}`,
  );

  const summary = computeMatchSummary(match);
  const radar = (await loadRadarAsset(match.mapName).catch(() => null)) ?? null;

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

  const exportResult = await exportMatchJson(summary, playerCards, radar, writeDir);
  console.log(`[parse] Wrote ${exportResult.jsonPath} (${(exportResult.bytes / 1024).toFixed(1)} KB)`);

  await upsertMatchIndex(summary, exportResult.id, writeDir);
  console.log(`[parse] Updated ${path.join(writeDir, 'index.json')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
