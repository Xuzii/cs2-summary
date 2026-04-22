/**
 * Smoke test: build a synthetic Match object that hits every panel (highlights,
 * round flow, opening duels, utility, economy, duel matrix, heatmap) and write
 * the rendered PNG to data/smoke-scoreboard.png for visual inspection.
 *
 * No Discord posting, no demo parsing, no external dependencies. Run with:
 *   npx tsx src/cli/smoke.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Clutch, Kill, Match, MatchPlayer, Round } from '../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../analyzer/types.ts';
import { computeMatchSummary } from '../scoreboard/compute.ts';
import { renderScoreboardPng, closeRenderer } from '../scoreboard/render-html.ts';

function makePlayer(
  i: number,
  teamName: string,
  steamIdBase: bigint,
  overrides: Partial<MatchPlayer> = {},
): MatchPlayer {
  const kills = 18 - i * 2;
  const deaths = 12 + i;
  return {
    steamId: String(steamIdBase + BigInt(i)),
    name: `${teamName} Player ${i + 1}`,
    teamName,
    killCount: kills,
    deathCount: deaths,
    assistCount: 5 - (i % 3),
    averageDamagePerRound: 95 - i * 7,
    headshotPercentage: 48 - i * 3,
    mvpCount: Math.max(0, 5 - i),
    firstKillCount: Math.max(0, 4 - i),
    firstDeathCount: 2 + i,
    hltvRating2: 1.3 - i * 0.1,
    kast: 78 - i * 3,
    utilityDamage: 100 - i * 10,
    averageUtilityDamagePerRound: 3.2 - i * 0.3,
    twoKillCount: 3,
    threeKillCount: i === 0 ? 2 : 0,
    fourKillCount: i === 1 ? 1 : 0,
    fiveKillCount: i === 0 ? 1 : 0,
    tradeKillCount: 2,
    tradeDeathCount: 2,
    enemiesFlashedCount: 20 - i * 2,
    flashAssistCount: 4 - (i % 2),
    blindTimeInflicted: 35 - i * 3,
    smokeThrownCount: 8,
    heThrownCount: 6,
    flashThrownCount: 12,
    ...overrides,
  };
}

function makeKill(round: number, tick: number, killerIdx: number, victimIdx: number, players: MatchPlayer[]): Kill {
  const killer = players[killerIdx]!;
  const victim = players[victimIdx]!;
  const killerSide = killerIdx < 5 ? TEAM_SIDE_CT : TEAM_SIDE_T;
  const victimSide = victimIdx < 5 ? TEAM_SIDE_CT : TEAM_SIDE_T;
  return {
    killerSteamId: killer.steamId,
    killerName: killer.name,
    killerSide,
    victimSteamId: victim.steamId,
    victimName: victim.name,
    victimSide,
    weaponName: 'ak47',
    isHeadshot: true,
    tick,
    roundNumber: round,
    // Synthetic positions on de_mirage (rough mid-range).
    killerPosition: { x: -1500 + ((tick * 13) % 2000), y: -500 + ((tick * 17) % 2000), z: -180 },
    victimPosition: { x: -1500 + ((tick * 19) % 2000), y: -500 + ((tick * 23) % 2000), z: -180 },
  };
}

async function main() {
  const teamAName = 'Alpha';
  const teamBName = 'Omega';
  const playersA = [0, 1, 2, 3, 4].map((i) => makePlayer(i, teamAName, 76561198000000000n));
  const playersB = [0, 1, 2, 3, 4].map((i) => makePlayer(i, teamBName, 76561198100000000n));
  const players = [...playersA, ...playersB];

  // 24-round match, team A wins 13-11. Halftime after round 12.
  const rounds: Round[] = [];
  for (let r = 1; r <= 24; r++) {
    const firstHalf = r <= 12;
    const teamASide: 2 | 3 = firstHalf ? TEAM_SIDE_CT : TEAM_SIDE_T;
    const teamBSide: 2 | 3 = firstHalf ? TEAM_SIDE_T : TEAM_SIDE_CT;
    // Alternate wins with team A slightly ahead.
    const aWins = r % 2 === 0 || r === 1 || r === 13;
    const winnerSide = aWins ? teamASide : teamBSide;
    const endReasons = ['bomb_exploded', 'bomb_defused', 'ct_eliminated', 't_eliminated', 'time_ran_out'];
    rounds.push({
      number: r,
      teamASide,
      teamBSide,
      winnerSide,
      endReason: endReasons[r % endReasons.length]!,
      teamAStartMoney: 4000 + (r % 3) * 2000,
      teamBStartMoney: 4000 + ((r + 1) % 3) * 2000,
      teamAEquipmentValue: r === 1 || r === 13 ? 800 : aWins ? 4800 : 1200,
      teamBEquipmentValue: r === 1 || r === 13 ? 800 : !aWins ? 4800 : 1200,
      bombSite: r % 3 === 0 ? 'A' : r % 3 === 1 ? 'B' : undefined,
    });
  }

  // Build some kills — enough that every player has some K/V pairs.
  const kills: Kill[] = [];
  for (let r = 1; r <= 24; r++) {
    for (let k = 0; k < 6; k++) {
      const killerIdx = (r + k) % 10;
      let victimIdx = (killerIdx + 5 + k) % 10;
      if (killerIdx < 5 === victimIdx < 5) {
        victimIdx = (killerIdx + 5) % 10;
      }
      kills.push(makeKill(r, r * 1000 + k * 50, killerIdx, victimIdx, players));
    }
  }

  const clutches: Clutch[] = [
    { clutcherSteamId: playersA[0]!.steamId, opponentsCount: 3, won: true, roundNumber: 7 },
    { clutcherSteamId: playersA[1]!.steamId, opponentsCount: 1, won: true, roundNumber: 14 },
    { clutcherSteamId: playersB[0]!.steamId, opponentsCount: 2, won: true, roundNumber: 18 },
    { clutcherSteamId: playersB[1]!.steamId, opponentsCount: 1, won: false, roundNumber: 3 },
  ];

  const match: Match = {
    mapName: 'de_mirage',
    game: 'CS2',
    source: 'valve',
    type: 'GOTV',
    tickrate: 64,
    duration: 2400,
    date: new Date().toISOString(),
    maxRounds: 24,
    teamA: {
      name: teamAName,
      letter: 'A',
      score: 13,
      currentSide: TEAM_SIDE_T, // second half = T since they started CT
      scoreFirstHalf: 7,
      scoreSecondHalf: 6,
    },
    teamB: {
      name: teamBName,
      letter: 'B',
      score: 11,
      currentSide: TEAM_SIDE_CT,
      scoreFirstHalf: 5,
      scoreSecondHalf: 6,
    },
    players,
    rounds,
    kills,
    clutches,
  };

  const summary = computeMatchSummary(match);
  console.log(`Highlights: ${summary.highlights.length}`);
  console.log(`Round flow entries: ${summary.roundFlow.length}`);
  console.log(`Opening duel rows: ${summary.openingDuels.length}`);
  console.log(`Utility rows: ${summary.utility.length} (empty=${summary.utilityEmpty})`);
  console.log(`Economy hasBuyData: ${summary.economy.hasBuyData}`);
  console.log(`Duel matrix: ${summary.duelMatrix.players.length}x${summary.duelMatrix.players.length}`);
  console.log(`Heatmap points: ${summary.heatmap.length}, hasPositions: ${summary.hasPositions}`);

  const outDir = path.resolve('data');
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'smoke-scoreboard.png');
  const debugHtmlPath = path.join(outDir, 'smoke-scoreboard.html');

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
