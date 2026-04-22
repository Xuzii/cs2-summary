import { writeFile, mkdir } from 'node:fs/promises';
import type { MatchSummary } from '../src/scoreboard/compute.ts';
import { renderScoreboardPng, closeRenderer } from '../src/scoreboard/render-html.ts';

const mkRow = (
  name: string,
  rating: number,
  k: number,
  d: number,
  a: number,
  adr: number,
  hs: number,
  mvps: number,
  fk: number,
  kast: number,
) => ({ name, steamId: `sid-${name}`, kills: k, deaths: d, assists: a, adr, hsPct: hs, rating, mvps, firstKills: fk, kast });

const teamAPlayers = [
  mkRow('BeDonkSlayer1987', 1.67, 22, 14, 7, 117.0, 54.0, 5, 5, 85.0),
  mkRow('turd.exe', 1.21, 14, 13, 8, 83.5, 50.0, 1, 2, 80.0),
  mkRow('fish', 1.18, 15, 14, 10, 66.2, 33.0, 3, 2, 80.0),
  mkRow('Ma2', 0.94, 13, 14, 2, 64.2, 23.0, 3, 3, 65.0),
  mkRow('Septic Tank sub 5 foid', 0.77, 9, 16, 6, 64.9, 11.0, 1, 1, 70.0),
];
const teamBPlayers = [
  mkRow('Dev', 1.47, 21, 14, 2, 87.4, 38.0, 2, 0, 80.0),
  mkRow('Fadee227', 1.18, 15, 14, 6, 83.9, 33.0, 1, 1, 75.0),
  mkRow('LilBeanBoi', 1.09, 14, 16, 5, 76.8, 35.0, 2, 5, 80.0),
  mkRow('joyce', 1.01, 11, 16, 10, 83.5, 72.0, 1, 0, 80.0),
  mkRow('Rexy', 0.55, 7, 15, 6, 49.3, 57.0, 1, 1, 55.0),
];

const summary: MatchSummary = {
  scoreboard: {
    map: 'de_ancient',
    durationSec: 31 * 60 + 49,
    date: new Date('2026-04-20T22:14:00Z'),
    teamA: { name: 'Team A', letter: 'A', side: 'T', score: 13, players: teamAPlayers },
    teamB: { name: 'Team B', letter: 'B', side: 'CT', score: 7, players: teamBPlayers },
    winner: 'A',
    source: 'valve',
    game: 'CS2',
    shareCode: null,
    serverName: null,
  },
  highlights: [
    { label: 'MVP', player: 'BeDonkSlayer1987', detail: '22k · 1.67 rating · 117 ADR' },
    { label: 'Best entry', player: 'BeDonkSlayer1987', detail: '5/5 opening duels (100%)' },
    { label: 'Clutch', player: 'Ma2', detail: '1v3 win · 2× clutch total' },
    { label: 'Utility', player: 'Rexy', detail: '181 utility damage' },
    { label: '4K', player: 'BeDonkSlayer1987', detail: 'clutch 4k' },
  ],
  roundFlow: buildRoundFlow(),
  openingDuels: [
    { name: 'BeDonkSlayer1987', steamId: 'sid-BeDonkSlayer1987', teamLetter: 'A', attempts: 5, wins: 5, losses: 0, successPct: 100, ctAttempts: 2, ctWins: 2, tAttempts: 3, tWins: 3 },
    { name: 'Ma2', steamId: 'sid-Ma2', teamLetter: 'A', attempts: 4, wins: 2, losses: 2, successPct: 50, ctAttempts: 1, ctWins: 0, tAttempts: 3, tWins: 2 },
    { name: 'turd.exe', steamId: 'sid-turd.exe', teamLetter: 'A', attempts: 4, wins: 2, losses: 2, successPct: 50, ctAttempts: 4, ctWins: 2, tAttempts: 0, tWins: 0 },
    { name: 'fish', steamId: 'sid-fish', teamLetter: 'A', attempts: 2, wins: 2, losses: 0, successPct: 100, ctAttempts: 2, ctWins: 2, tAttempts: 0, tWins: 0 },
    { name: 'Septic Tank sub 5 foid', steamId: 'sid-Septic', teamLetter: 'A', attempts: 3, wins: 1, losses: 2, successPct: 33.3, ctAttempts: 1, ctWins: 0, tAttempts: 2, tWins: 1 },
    { name: 'LilBeanBoi', steamId: 'sid-LilBeanBoi', teamLetter: 'B', attempts: 7, wins: 4, losses: 3, successPct: 57.1, ctAttempts: 2, ctWins: 2, tAttempts: 5, tWins: 2 },
    { name: 'joyce', steamId: 'sid-joyce', teamLetter: 'B', attempts: 6, wins: 2, losses: 4, successPct: 33.3, ctAttempts: 0, ctWins: 0, tAttempts: 6, tWins: 2 },
    { name: 'Rexy', steamId: 'sid-Rexy', teamLetter: 'B', attempts: 4, wins: 1, losses: 3, successPct: 25, ctAttempts: 3, ctWins: 0, tAttempts: 1, tWins: 1 },
    { name: 'Fadee227', steamId: 'sid-Fadee227', teamLetter: 'B', attempts: 3, wins: 1, losses: 2, successPct: 33.3, ctAttempts: 1, ctWins: 0, tAttempts: 2, tWins: 1 },
    { name: 'Dev', steamId: 'sid-Dev', teamLetter: 'B', attempts: 2, wins: 0, losses: 2, successPct: 0, ctAttempts: 2, ctWins: 0, tAttempts: 0, tWins: 0 },
  ],
  utility: [
    { name: 'fish', steamId: 'sid-fish', teamLetter: 'A', heDamage: 115, heDamagePerRound: 5.8, flashThrown: 28, enemiesFlashed: 25, blindTime: 69.4, flashAssists: 4, smokes: 20, molotovs: 3 },
    { name: 'BeDonkSlayer1987', steamId: 'sid-BeDonkSlayer1987', teamLetter: 'A', heDamage: 142, heDamagePerRound: 7.1, flashThrown: 14, enemiesFlashed: 8, blindTime: 25.0, flashAssists: 0, smokes: 5, molotovs: 1 },
    { name: 'Ma2', steamId: 'sid-Ma2', teamLetter: 'A', heDamage: 32, heDamagePerRound: 1.6, flashThrown: 14, enemiesFlashed: 15, blindTime: 25.9, flashAssists: 0, smokes: 7, molotovs: 2 },
    { name: 'turd.exe', steamId: 'sid-turd.exe', teamLetter: 'A', heDamage: 71, heDamagePerRound: 3.6, flashThrown: 22, enemiesFlashed: 7, blindTime: 18.1, flashAssists: 1, smokes: 14, molotovs: 0 },
    { name: 'Septic Tank sub 5 foid', steamId: 'sid-Septic', teamLetter: 'A', heDamage: 53, heDamagePerRound: 2.7, flashThrown: 10, enemiesFlashed: 5, blindTime: 11.9, flashAssists: 0, smokes: 7, molotovs: 0 },
    { name: 'Dev', steamId: 'sid-Dev', teamLetter: 'B', heDamage: 47, heDamagePerRound: 2.4, flashThrown: 44, enemiesFlashed: 37, blindTime: 104.9, flashAssists: 2, smokes: 18, molotovs: 0 },
    { name: 'Rexy', steamId: 'sid-Rexy', teamLetter: 'B', heDamage: 181, heDamagePerRound: 9.1, flashThrown: 4, enemiesFlashed: 2, blindTime: 6.4, flashAssists: 1, smokes: 8, molotovs: 1 },
    { name: 'Fadee227', steamId: 'sid-Fadee227', teamLetter: 'B', heDamage: 157, heDamagePerRound: 7.9, flashThrown: 24, enemiesFlashed: 5, blindTime: 13.3, flashAssists: 0, smokes: 9, molotovs: 0 },
    { name: 'joyce', steamId: 'sid-joyce', teamLetter: 'B', heDamage: 57, heDamagePerRound: 2.9, flashThrown: 16, enemiesFlashed: 6, blindTime: 16.2, flashAssists: 0, smokes: 5, molotovs: 0 },
    { name: 'LilBeanBoi', steamId: 'sid-LilBeanBoi', teamLetter: 'B', heDamage: 3, heDamagePerRound: 0.2, flashThrown: 8, enemiesFlashed: 5, blindTime: 14.6, flashAssists: 0, smokes: 0, molotovs: 0 },
  ],
  utilityEmpty: false,
  economy: {
    hasBuyData: true,
    teamA: {
      name: 'Team A',
      breakdown: { pistolWon: 0, ecoWon: 0, forceWon: 5, fullBuyWon: 7 },
      half: { firstHalf: { side: 'CT', score: 6 }, secondHalf: { side: 'T', score: 7 } },
    },
    teamB: {
      name: 'Team B',
      breakdown: { pistolWon: 1, ecoWon: 0, forceWon: 3, fullBuyWon: 3 },
      half: { firstHalf: { side: 'T', score: 6 }, secondHalf: { side: 'CT', score: 1 } },
    },
  },
  duelMatrix: buildDuelMatrix(),
  heatmap: buildHeatmap(),
  hasPositions: true,
  clutchMulti: [],
  clutchMultiEmpty: true,
  entryTrade: [],
  entryTradeEmpty: true,
  records: {
    topWeapons: [],
    fastestRound: null,
    slowestRound: null,
    longestKill: null,
    bestRound: null,
    novelty: { wallbangs: 0, noScopes: 0, throughSmoke: 0, collaterals: 0, blindKills: 0 },
  },
  recordsEmpty: true,
  aim: { rows: [], bestTap: null, bestSpray: null, topShooter: null },
  aimEmpty: true,
  bombPlays: { plantsA: 0, plantsB: 0, plantsTotal: 0, defuses: 0, topPlanter: null, topDefuser: null },
  bombPlaysEmpty: true,
};

function buildRoundFlow() {
  // Rough pattern from the screenshot: first-half 6-6, second-half 7-1.
  const winners: Array<'A' | 'B'> = [
    'A','A','B','B','A','A','A','A','B','A','A','B',
    'A','B','A','A','A','A','A','A',
  ];
  const sidesA: Array<'CT' | 'T'> = [];
  for (let i = 0; i < 20; i++) sidesA.push(i < 12 ? 'CT' : 'T');
  return winners.map((w, idx) => {
    const teamASide = sidesA[idx]!;
    const teamBSide = teamASide === 'CT' ? 'T' : 'CT';
    const winnerSide = w === 'A' ? teamASide : teamBSide;
    return {
      number: idx + 1,
      winner: w,
      winnerSide,
      endReason: 'unknown' as const,
      scoreA: winners.slice(0, idx + 1).filter((x) => x === 'A').length,
      scoreB: winners.slice(0, idx + 1).filter((x) => x === 'B').length,
      isHalftime: idx + 1 === 12,
    };
  });
}

function buildDuelMatrix() {
  const names: Array<{ steamId: string; name: string; teamLetter: 'A' | 'B' }> = [
    { steamId: 'sid-BeDonkSlayer1987', name: 'BeDonkSlayer1987', teamLetter: 'A' },
    { steamId: 'sid-fish', name: 'fish', teamLetter: 'A' },
    { steamId: 'sid-Ma2', name: 'Ma2', teamLetter: 'A' },
    { steamId: 'sid-Septic', name: 'Septic Tank sub 5 foid', teamLetter: 'A' },
    { steamId: 'sid-turd.exe', name: 'turd.exe', teamLetter: 'A' },
    { steamId: 'sid-Dev', name: 'Dev', teamLetter: 'B' },
    { steamId: 'sid-Fadee227', name: 'Fadee227', teamLetter: 'B' },
    { steamId: 'sid-joyce', name: 'joyce', teamLetter: 'B' },
    { steamId: 'sid-LilBeanBoi', name: 'LilBeanBoi', teamLetter: 'B' },
    { steamId: 'sid-Rexy', name: 'Rexy', teamLetter: 'B' },
  ];
  // Rough numbers pulled from the reference screenshot.
  const k = [
    [0,0,0,0,0, 4,4,3,5,6],
    [0,0,0,0,0, 2,0,7,4,2],
    [0,0,0,0,0, 6,2,0,3,2],
    [0,0,1,0,0, 1,3,2,2,2],
    [0,0,0,0,0, 1,4,4,2,3],
    [7,4,2,4,4, 0,0,0,0,0],
    [0,5,4,3,3, 0,0,0,0,0],
    [3,0,2,3,3, 0,0,0,0,0],
    [3,2,3,3,3, 0,0,0,0,0],
    [1,3,1,3,0, 0,0,0,0,0],
  ];
  return { players: names, kills: k, isEmpty: false };
}

function buildHeatmap() {
  // Spread sample points around de_ancient playable area so the coord fix
  // can be eyeballed visually.
  const out: Array<{ worldX: number; worldY: number; worldZ: number; killerSide: 'CT' | 'T' }> = [];
  const rng = mulberry32(0xbada55);
  for (let i = 0; i < 40; i++) {
    out.push({
      worldX: -2500 + rng() * 4200,
      worldY: -2200 + rng() * 4000,
      worldZ: 0,
      killerSide: rng() > 0.5 ? 'CT' : 'T',
    });
  }
  return out;
}

function mulberry32(seed: number): () => number {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

await mkdir('data', { recursive: true });
const { primary, deep } = await renderScoreboardPng(summary, { debugHtmlPath: 'data/sample-scoreboard.html' });
await writeFile('data/sample-scoreboard.png', primary);
await writeFile('data/sample-scoreboard-deep.png', deep);
console.log(`Wrote data/sample-scoreboard.png (${primary.length}B) + data/sample-scoreboard-deep.png (${deep.length}B)`);
await closeRenderer();
