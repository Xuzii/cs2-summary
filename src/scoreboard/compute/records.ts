import type { Kill, Match, Round } from '../../analyzer/types.ts';

export interface WeaponCount {
  weapon: string;
  kills: number;
}

export interface KillRecord {
  player: string;
  weapon: string;
  /** Map-unit distance between killer and victim at time of kill. */
  distance: number;
  roundNumber: number | null;
}

export interface RoundLenRecord {
  roundNumber: number;
  durationSec: number;
  winnerSide: 'CT' | 'T' | null;
}

export interface BestRoundRecord {
  player: string;
  teamLetter: 'A' | 'B';
  kills: number;
  roundNumber: number;
}

export interface NoveltyCounts {
  wallbangs: number;
  noScopes: number;
  throughSmoke: number;
  collaterals: number;
  blindKills: number;
}

export interface MatchRecords {
  topWeapons: WeaponCount[];
  fastestRound: RoundLenRecord | null;
  slowestRound: RoundLenRecord | null;
  longestKill: KillRecord | null;
  bestRound: BestRoundRecord | null;
  novelty: NoveltyCounts;
}

/**
 * Derive per-match "records" highlights from the raw kills + rounds arrays.
 * Most fields degrade to null/zero when the parser didn't emit enough data
 * (short demo, no positions enabled, etc.) so callers can hide rows.
 */
export function computeRecords(match: Match): MatchRecords {
  const kills = match.kills ?? [];
  const rounds = match.rounds ?? [];

  return {
    topWeapons: topWeapons(kills, 6),
    fastestRound: extremumRound(rounds, 'min'),
    slowestRound: extremumRound(rounds, 'max'),
    longestKill: longestKill(kills),
    bestRound: bestSingleRound(match),
    novelty: tallyNovelty(kills),
  };
}

export function isRecordsEmpty(r: MatchRecords): boolean {
  return (
    r.topWeapons.length === 0 &&
    r.fastestRound === null &&
    r.slowestRound === null &&
    r.longestKill === null &&
    r.bestRound === null &&
    r.novelty.wallbangs === 0 &&
    r.novelty.noScopes === 0 &&
    r.novelty.throughSmoke === 0 &&
    r.novelty.collaterals === 0 &&
    r.novelty.blindKills === 0
  );
}

function topWeapons(kills: Kill[], n: number): WeaponCount[] {
  const counts = new Map<string, number>();
  for (const k of kills) {
    const w = (k.weaponName ?? '').trim();
    if (!w) continue;
    if (w === 'World' || w === 'Unknown') continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([weapon, count]) => ({ weapon, kills: count }))
    .sort((a, b) => b.kills - a.kills)
    .slice(0, n);
}

function extremumRound(rounds: Round[], mode: 'min' | 'max'): RoundLenRecord | null {
  let pick: { round: Round; duration: number } | null = null;
  for (const r of rounds) {
    if (r.duration === undefined || !Number.isFinite(r.duration) || r.duration <= 0) continue;
    if (!pick) {
      pick = { round: r, duration: r.duration };
      continue;
    }
    if (mode === 'min' && r.duration < pick.duration) pick = { round: r, duration: r.duration };
    if (mode === 'max' && r.duration > pick.duration) pick = { round: r, duration: r.duration };
  }
  if (!pick) return null;
  const winnerSide = pick.round.winnerSide === 3 ? 'CT' : pick.round.winnerSide === 2 ? 'T' : null;
  return { roundNumber: pick.round.number, durationSec: round1(pick.duration), winnerSide };
}

function longestKill(kills: Kill[]): KillRecord | null {
  let best: { kill: Kill; dist: number } | null = null;
  for (const k of kills) {
    const kp = k.killerPosition;
    const vp = k.victimPosition;
    if (!kp || !vp) continue;
    const dx = kp.x - vp.x;
    const dy = kp.y - vp.y;
    const dz = kp.z - vp.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!best || d > best.dist) best = { kill: k, dist: d };
  }
  if (!best) return null;
  return {
    player: best.kill.killerName,
    weapon: best.kill.weaponName ?? '',
    distance: Math.round(best.dist),
    roundNumber: best.kill.roundNumber ?? null,
  };
}

function bestSingleRound(match: Match): BestRoundRecord | null {
  const kills = match.kills ?? [];
  if (kills.length === 0) return null;

  const tally = new Map<string, Map<string, number>>(); // round -> (steamId -> count)
  for (const k of kills) {
    const round = k.roundNumber;
    if (round === undefined) continue;
    const roundKey = String(round);
    let byPlayer = tally.get(roundKey);
    if (!byPlayer) {
      byPlayer = new Map();
      tally.set(roundKey, byPlayer);
    }
    byPlayer.set(k.killerSteamId, (byPlayer.get(k.killerSteamId) ?? 0) + 1);
  }

  let best: { steamId: string; round: number; kills: number } | null = null;
  for (const [roundKey, byPlayer] of tally) {
    const round = Number(roundKey);
    for (const [steamId, count] of byPlayer) {
      if (!best || count > best.kills) best = { steamId, round, kills: count };
    }
  }
  if (!best) return null;

  const player = match.players.find((p) => p.steamId === best!.steamId);
  if (!player) return null;
  const teamLetter: 'A' | 'B' = player.teamName === match.teamA.name ? 'A' : 'B';
  return { player: player.name, teamLetter, kills: best.kills, roundNumber: best.round };
}

function tallyNovelty(kills: Kill[]): NoveltyCounts {
  let wallbangs = 0;
  let noScopes = 0;
  let throughSmoke = 0;
  let collaterals = 0;
  let blindKills = 0;
  // Collateral = same killer kills multiple victims on the same tick.
  const perTick = new Map<string, number>();

  for (const k of kills) {
    if (k.isWallbang) wallbangs += 1;
    if (k.isNoScope) noScopes += 1;
    if (k.isKillerBlinded) blindKills += 1;
    if (k.isThroughSmoke) throughSmoke += 1;
    if (k.tick !== undefined) {
      const key = `${k.killerSteamId}@${k.tick}`;
      perTick.set(key, (perTick.get(key) ?? 0) + 1);
    }
  }
  for (const count of perTick.values()) {
    if (count > 1) collaterals += count;
  }
  return { wallbangs, noScopes, throughSmoke, collaterals, blindKills };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
