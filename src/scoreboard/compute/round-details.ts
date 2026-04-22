import type { Match, Kill, Damage } from '../../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../../analyzer/types.ts';

export interface RoundDetailKill {
  t: number;
  killer: string;
  killerSide: 'CT' | 'T';
  victim: string;
  victimSide: 'CT' | 'T';
  weapon: string;
  headshot: boolean;
  wallbang: boolean;
  firstKill: boolean;
}

export interface RoundDetailTopDamage {
  name: string;
  dmg: number;
}

export interface RoundDetailBomb {
  planted: boolean;
  site?: 'A' | 'B';
  defused?: boolean;
}

export interface RoundDetail {
  n: number;
  winner: 'CT' | 'T';
  halftime?: boolean;
  endReason: string;
  duration: number;
  kills: RoundDetailKill[];
  bomb: RoundDetailBomb;
  econA: string;
  econB: string;
  eqA: number;
  eqB: number;
  topDamage: RoundDetailTopDamage[];
  bombPlantT?: number;
  bombDefuseT?: number;
  damageDealt: Record<string, number>;
}

const TICK_DEFAULT = 64;

function sideOf(s: number | undefined): 'CT' | 'T' {
  if (s === TEAM_SIDE_CT) return 'CT';
  return 'T';
}

function prettyEndReason(raw: string | undefined): string {
  if (!raw) return 'Eliminated';
  const s = raw.toLowerCase();
  if (s.includes('bomb') && (s.includes('explod') || s.includes('detonat'))) return 'Bomb detonated';
  if (s.includes('defus')) return 'Bomb defused';
  if (s.includes('time')) return 'Time ran out';
  if (s.includes('ct') || s.includes('t_') || s.includes('elim') || s.includes('kill')) return 'Eliminated';
  return 'Eliminated';
}

function canonicalEcon(raw: string | undefined): string {
  if (!raw) return 'full';
  const s = raw.toLowerCase();
  if (s.includes('pistol')) return 'pistol';
  if (s.includes('eco')) return 'eco';
  if (s.includes('force') || s.includes('semi')) return 'force';
  return 'full';
}

export function computeRoundDetails(match: Match): RoundDetail[] {
  const rounds = match.rounds ?? [];
  if (rounds.length === 0) return [];

  const tickrate = match.tickrate && match.tickrate > 0 ? match.tickrate : TICK_DEFAULT;
  const kills = match.kills ?? [];
  const damages = match.damages ?? [];
  const bombsPlanted = match.bombsPlanted ?? [];
  const bombsDefused = match.bombsDefused ?? [];

  const killsByRound = new Map<number, Kill[]>();
  for (const k of kills) {
    const n = k.roundNumber ?? 0;
    if (!killsByRound.has(n)) killsByRound.set(n, []);
    killsByRound.get(n)!.push(k);
  }

  const damagesByRound = new Map<number, Damage[]>();
  for (const d of damages) {
    const n = d.roundNumber ?? 0;
    if (!damagesByRound.has(n)) damagesByRound.set(n, []);
    damagesByRound.get(n)!.push(d);
  }

  const playerBySteamId = new Map<string, string>();
  for (const p of match.players) playerBySteamId.set(p.steamId, p.name);
  const allNames = match.players.map((p) => p.name);

  // Halftime index
  const firstHalfRounds =
    match.teamA.scoreFirstHalf !== undefined && match.teamB.scoreFirstHalf !== undefined
      ? match.teamA.scoreFirstHalf + match.teamB.scoreFirstHalf
      : Math.floor((match.maxRounds ?? rounds.length) / 2);

  return rounds.map((r, idx) => {
    const n = r.number || idx + 1;
    const winnerSide = sideOf(r.winnerSide);
    const startTick = r.startTick ?? 0;
    const duration = r.duration ?? 0;
    const rKills = (killsByRound.get(n) ?? []).slice().sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));

    const detailKills: RoundDetailKill[] = rKills.map((k, ki) => ({
      t: k.tick && startTick ? Math.max(0, (k.tick - startTick) / tickrate) : 0,
      killer: k.killerName,
      killerSide: sideOf(k.killerSide),
      victim: k.victimName,
      victimSide: sideOf(k.victimSide),
      weapon: k.weaponName ?? '',
      headshot: !!k.isHeadshot,
      wallbang: !!k.isWallbang,
      firstKill: ki === 0,
    }));

    // Per-player damage dealt this round
    const damageDealt: Record<string, number> = {};
    for (const name of allNames) damageDealt[name] = 0;
    for (const d of damagesByRound.get(n) ?? []) {
      const name = playerBySteamId.get(d.attackerSteamId);
      if (!name) continue;
      damageDealt[name] = (damageDealt[name] ?? 0) + (d.healthDamage ?? 0);
    }

    const topDamage: RoundDetailTopDamage[] = Object.entries(damageDealt)
      .map(([name, dmg]) => ({ name, dmg }))
      .sort((a, b) => b.dmg - a.dmg)
      .slice(0, 5);

    // Bomb events
    const plant = bombsPlanted.find((b) => b.roundNumber === n);
    const defuse = bombsDefused.find((b) => b.roundNumber === n);
    const plantT = plant && plant.tick && startTick ? (plant.tick - startTick) / tickrate : undefined;
    const defuseT = defuse && defuse.tick && startTick ? (defuse.tick - startTick) / tickrate : undefined;

    return {
      n,
      winner: winnerSide,
      halftime: idx + 1 === firstHalfRounds ? true : undefined,
      endReason: prettyEndReason(r.endReason),
      duration,
      kills: detailKills,
      bomb: {
        planted: !!plant,
        site: plant?.site ?? r.bombSite,
        defused: !!defuse,
      },
      econA: canonicalEcon(r.teamAEconomyType),
      econB: canonicalEcon(r.teamBEconomyType),
      eqA: r.teamAEquipmentValue ?? 0,
      eqB: r.teamBEquipmentValue ?? 0,
      topDamage,
      bombPlantT: plantT,
      bombDefuseT: defuseT,
      damageDealt,
    };
  });
}
