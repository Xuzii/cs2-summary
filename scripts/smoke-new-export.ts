/**
 * Smoke test for the new MatchDocument shape.
 *
 * Builds a minimal `Match` object, pushes it through `computeMatchSummary` +
 * `exportMatchJson`, then prints the top-level keys and shape stats so a
 * human can verify the new fields land in the output.
 *
 * Usage: npx tsx scripts/smoke-new-export.ts
 */
import { mkdir, rm, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Match } from '../src/analyzer/types.ts';
import { computeMatchSummary } from '../src/scoreboard/compute.ts';
import { exportMatchJson } from '../src/scoreboard/export-match-json.ts';

const match: Match = {
  mapName: 'de_inferno',
  game: 'CS2',
  source: 'valve',
  tickrate: 64,
  duration: 30 * 60,
  date: '2026-04-21T22:08:00Z',
  serverName: 'SMOKE SERVER',
  shareCode: 'CSGO-smoke-smoke-smoke-smoke-smoke',
  maxRounds: 24,
  winnerName: 'Team B',
  winnerSide: 3,
  teamA: { name: 'Team A', letter: 'A', score: 11, currentSide: 2, scoreFirstHalf: 4, scoreSecondHalf: 7 },
  teamB: { name: 'Team B', letter: 'B', score: 13, currentSide: 3, scoreFirstHalf: 8, scoreSecondHalf: 5 },
  players: [
    {
      steamId: '76561198000000001',
      name: 'MaZ',
      teamName: 'Team A',
      killCount: 26,
      deathCount: 16,
      assistCount: 8,
      averageDamagePerRound: 101,
      headshotPercentage: 30,
      mvpCount: 4,
      firstKillCount: 3,
      hltvRating2: 1.55,
      kast: 75,
    },
    {
      steamId: '76561198000000002',
      name: 'fish',
      teamName: 'Team A',
      killCount: 16,
      deathCount: 16,
      assistCount: 8,
      averageDamagePerRound: 77.5,
      headshotPercentage: 62,
      mvpCount: 2,
      firstKillCount: 1,
      hltvRating2: 1.22,
      kast: 71,
    },
    {
      steamId: '76561198000000003',
      name: 'eternal',
      teamName: 'Team B',
      killCount: 24,
      deathCount: 17,
      assistCount: 3,
      averageDamagePerRound: 93.3,
      headshotPercentage: 54,
      mvpCount: 3,
      firstKillCount: 4,
      hltvRating2: 1.48,
      kast: 75,
    },
    {
      steamId: '76561198000000004',
      name: 'Hugo',
      teamName: 'Team B',
      killCount: 9,
      deathCount: 20,
      assistCount: 4,
      averageDamagePerRound: 43.9,
      headshotPercentage: 55,
      mvpCount: 0,
      firstKillCount: 0,
      hltvRating2: 0.66,
      kast: 46,
    },
  ],
  rounds: Array.from({ length: 24 }, (_, i) => ({
    number: i + 1,
    startTick: i * 8000,
    endTick: i * 8000 + 7000,
    duration: 80 + Math.random() * 30,
    teamASide: i < 12 ? 2 : 3,
    teamBSide: i < 12 ? 3 : 2,
    winnerSide: Math.random() < 0.5 ? 2 : 3,
    teamAEquipmentValue: 15000 + Math.floor(Math.random() * 10000),
    teamBEquipmentValue: 15000 + Math.floor(Math.random() * 10000),
    teamAEconomyType: ['full', 'eco', 'force', 'pistol'][i % 4]!,
    teamBEconomyType: ['full', 'force', 'eco', 'pistol'][i % 4]!,
    teamAStartMoney: 16000,
    teamBStartMoney: 16000,
    endReason: ['t_eliminated', 'ct_eliminated', 'bomb_exploded', 'bomb_defused', 'time_ran_out'][i % 5]!,
  })),
  kills: Array.from({ length: 80 }, (_, i) => {
    const round = Math.floor(i / 4) + 1;
    const names = ['MaZ', 'fish', 'eternal', 'Hugo'];
    const sides: (2 | 3)[] = [2, 2, 3, 3];
    const killerIdx = i % 4;
    const victimIdx = (i + 2) % 4;
    return {
      killerSteamId: `7656119800000000${killerIdx + 1}`,
      killerName: names[killerIdx]!,
      killerSide: sides[killerIdx]!,
      victimSteamId: `7656119800000000${victimIdx + 1}`,
      victimName: names[victimIdx]!,
      victimSide: sides[victimIdx]!,
      weaponName: ['weapon_ak47', 'weapon_m4a1', 'weapon_awp', 'weapon_deagle'][i % 4]!,
      isHeadshot: i % 3 === 0,
      isWallbang: i % 17 === 0,
      isFirstKill: i % 4 === 0,
      tick: round * 8000 + (i % 4) * 1200,
      roundNumber: round,
      killerPosition: { x: -500 + Math.random() * 2000, y: 1500 + Math.random() * 1500, z: 0 },
      victimPosition: { x: -500 + Math.random() * 2000, y: 1500 + Math.random() * 1500, z: 0 },
    };
  }),
  damages: Array.from({ length: 500 }, (_, i) => ({
    attackerSteamId: `7656119800000000${(i % 4) + 1}`,
    victimSteamId: `7656119800000000${((i + 1) % 4) + 1}`,
    weaponName: 'weapon_ak47',
    hitgroup: (i % 7) + 1,
    healthDamage: Math.floor(Math.random() * 30) + 10,
    armorDamage: Math.floor(Math.random() * 10),
    tick: 8000 + i * 100,
    roundNumber: (i % 24) + 1,
  })),
  shots: Array.from({ length: 1500 }, (_, i) => ({
    playerSteamId: `7656119800000000${(i % 4) + 1}`,
    weaponName: 'weapon_ak47',
    tick: 8000 + i * 40,
    roundNumber: (i % 24) + 1,
  })),
  grenades: Array.from({ length: 60 }, (_, i) => ({
    type: ['smokegrenade', 'flashbang', 'hegrenade', 'molotov'][i % 4]!,
    throwerSteamId: `7656119800000000${(i % 4) + 1}`,
    throwerName: ['MaZ', 'fish', 'eternal', 'Hugo'][i % 4]!,
    throwerSide: i % 2 === 0 ? 2 : 3,
    tick: 8000 + i * 300,
    roundNumber: (i % 24) + 1,
    position: { x: Math.random() * 1500, y: Math.random() * 1500, z: 0 },
  })),
  playerBlinds: Array.from({ length: 30 }, (_, i) => ({
    flasherSteamId: `7656119800000000${(i % 4) + 1}`,
    flashedSteamId: `7656119800000000${((i + 1) % 4) + 1}`,
    flasherSide: i % 2 === 0 ? 2 : 3,
    flashedSide: i % 2 === 0 ? 3 : 2,
    duration: 1.2 + Math.random() * 2,
    tick: 8000 + i * 500,
    roundNumber: (i % 24) + 1,
  })),
  bombsPlanted: Array.from({ length: 10 }, (_, i) => ({
    playerSteamId: `7656119800000000${(i % 4) + 1}`,
    playerName: ['MaZ', 'fish', 'eternal', 'Hugo'][i % 4]!,
    site: i % 2 === 0 ? 'A' : 'B',
    tick: 8000 + (i + 1) * 800,
    roundNumber: i * 2 + 1,
  })),
  bombsDefused: Array.from({ length: 3 }, (_, i) => ({
    playerSteamId: `7656119800000000${(i % 4) + 3}`,
    playerName: ['eternal', 'Hugo'][i % 2]!,
    tick: 8000 + (i + 1) * 1000,
    roundNumber: i * 6 + 3,
  })),
  clutches: [
    { clutcherSteamId: '76561198000000003', opponentsCount: 3, won: true, roundNumber: 16, tick: 128000 },
  ],
};

async function main() {
  const outDir = path.resolve('data/smoke-new-export');
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  console.log('[smoke] Running computeMatchSummary');
  const summary = computeMatchSummary(match);
  console.log('[smoke] MatchSummary keys:', Object.keys(summary).sort().join(', '));
  console.log('[smoke] roundDetails.length:', summary.roundDetails.length);
  console.log('[smoke] playback.rounds.length:', summary.playback.rounds.length);
  console.log('[smoke] bodyAccuracy players:', Object.keys(summary.bodyAccuracy).length);
  console.log('[smoke] flashMatrix players:', Object.keys(summary.flashMatrix).length);
  console.log('[smoke] eqTimeline entries:', summary.eqTimeline.length);
  console.log('[smoke] playerImpact players:', Object.keys(summary.playerImpact).length);

  console.log('[smoke] Running exportMatchJson');
  const result = await exportMatchJson(summary, [], null, outDir);
  console.log('[smoke] Wrote', result.jsonPath, `${result.bytes} bytes`);

  // Reload + verify shape
  const body = await readFile(result.jsonPath, 'utf8');
  const doc = JSON.parse(body) as { id: string; version: number; match: Record<string, unknown>; players: unknown[] };
  const matchKeys = Object.keys(doc.match).sort();
  console.log('[smoke] Top-level match fields:', matchKeys.join(', '));

  // Check new fields
  const expected = [
    'roundDetails',
    'bodyAccuracy',
    'eqTimeline',
    'flashMatrix',
    'damagePerRound',
    'roundInventory',
    'openingsSpatial',
    'playback',
    'grenadesAgg',
    'playerImpact',
    'weaponTops',
    'endReasonCounts',
  ];
  const missing = expected.filter((k) => !matchKeys.includes(k));
  if (missing.length > 0) {
    console.error('[smoke] MISSING FIELDS:', missing.join(', '));
    process.exit(1);
  }
  console.log('[smoke] ✓ All expected new fields present');

  // Size check
  const st = await stat(result.jsonPath);
  console.log('[smoke] File size:', `${(st.size / 1024).toFixed(1)} KB`);

  // Index check
  const indexPath = path.join(outDir, 'index.json');
  const indexBody = await readFile(indexPath, 'utf8');
  const index = JSON.parse(indexBody) as unknown[];
  console.log('[smoke] index.json entries:', index.length);
  if (index.length !== 1) {
    console.error('[smoke] expected 1 index entry, got', index.length);
    process.exit(1);
  }
  console.log('[smoke] ✓ Index written');

  console.log('[smoke] PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
