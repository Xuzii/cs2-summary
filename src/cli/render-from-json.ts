/**
 * Render a PNG from an already-parsed analyzer JSON folder, without posting
 * to Discord. Useful for iterating on the renderer against real parser output.
 *
 * Usage:
 *   npx tsx src/cli/render-from-json.ts <folder-or-json-path> [output-png-path] [--player=<steamId64>]
 *
 * When `--player=<steamId64>` is supplied, only the per-player performance
 * card for that SteamID is rendered (one PNG, no deep card). Useful for
 * iterating on the player-card layout without re-parsing a demo.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { statSync } from 'node:fs';
import { loadMatchFromJsonFolder } from '../analyzer/load-match.ts';
import { computeMatchSummary } from '../scoreboard/compute.ts';
import { renderScoreboardPng, renderPlayerCardPng, closeRenderer } from '../scoreboard/render-html.ts';
import { computePlayerCard } from '../scoreboard/compute/player-card.ts';
import { loadRadarAsset } from '../scoreboard/load-radar.ts';

async function main() {
  const positional: string[] = [];
  let playerSteamId: string | null = null;
  for (const arg of process.argv.slice(2)) {
    const m = /^--player=(\d{17})$/.exec(arg);
    if (m) {
      playerSteamId = m[1]!;
    } else {
      positional.push(arg);
    }
  }

  const arg = positional[0];
  if (!arg) {
    console.error(
      'Usage: npx tsx src/cli/render-from-json.ts <folder-or-json-path> [output-png] [--player=<steamId64>]',
    );
    process.exit(2);
  }
  const input = path.resolve(arg);
  const folder = statSync(input).isDirectory() ? input : path.dirname(input);
  const outPath = path.resolve(positional[1] ?? 'data/real-scoreboard.png');
  const debugHtmlPath = outPath.replace(/\.png$/i, '.html');

  console.log(`Loading match from ${folder}`);
  const match = await loadMatchFromJsonFolder(folder);

  console.log(
    `Match: ${match.mapName} · ${match.teamA.name} ${match.teamA.score} - ${match.teamB.score} ${match.teamB.name}`,
  );
  console.log(`Rounds: ${match.rounds?.length ?? 0}, kills: ${match.kills?.length ?? 0}`);
  console.log(
    `Clutches: ${match.clutches?.length ?? 0}, grenades: ${match.grenades?.length ?? 0}, ` +
      `blinds: ${match.playerBlinds?.length ?? 0}`,
  );

  if (playerSteamId) {
    const card = computePlayerCard(match, playerSteamId);
    if (!card) {
      console.error(`SteamID ${playerSteamId} not found in this match's players.`);
      process.exit(1);
    }
    const radar = await loadRadarAsset(match.mapName).catch(() => null);
    const png = await renderPlayerCardPng(card, radar ?? null, { debugHtmlPath });
    const playerOut = outPath.replace(/\.png$/i, `-player-${playerSteamId}.png`);
    await writeFile(playerOut, png);
    console.log(`\nWrote ${png.byteLength}B → ${playerOut}`);
    console.log(`Debug HTML: ${debugHtmlPath}`);
    await closeRenderer();
    return;
  }

  const summary = computeMatchSummary(match);
  console.log(`Highlights: ${summary.highlights.length}`);
  console.log(`Round flow entries: ${summary.roundFlow.length}`);
  console.log(`Opening duel rows: ${summary.openingDuels.length}`);
  console.log(`Utility rows: ${summary.utility.length} (empty=${summary.utilityEmpty})`);
  console.log(
    `Economy hasBuyData: ${summary.economy.hasBuyData}, ` +
      `A: ${JSON.stringify(summary.economy.teamA.breakdown)}, ` +
      `B: ${JSON.stringify(summary.economy.teamB.breakdown)}`,
  );
  console.log(`Duel matrix: ${summary.duelMatrix.players.length}x${summary.duelMatrix.players.length}`);
  console.log(`Heatmap points: ${summary.heatmap.length}, hasPositions: ${summary.hasPositions}`);

  const { primary, deep } = await renderScoreboardPng(summary, { debugHtmlPath });
  await writeFile(outPath, primary);
  const deepPath = outPath.replace(/\.png$/i, '-deep.png');
  await writeFile(deepPath, deep);
  console.log(`\nWrote ${primary.byteLength}B → ${outPath}`);
  console.log(`Wrote ${deep.byteLength}B → ${deepPath}`);
  console.log(`Debug HTML: ${debugHtmlPath}`);
  await closeRenderer();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
