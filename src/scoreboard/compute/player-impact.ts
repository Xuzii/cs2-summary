import type { Match } from '../../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../../analyzer/types.ts';

export interface PlayerImpactRound {
  n: number;
  dmg: number;
  kills: number;
  firstKill: boolean;
  multiKill: boolean;
  clutchWon: boolean;
  won: boolean;
}

export type PlayerImpactMap = Record<string, PlayerImpactRound[]>;

/**
 * Per-player, per-round impact line: damage, kills, flags for first kill /
 * multi-kill / clutch win, and whether their side won the round.
 */
export function computePlayerImpact(match: Match): PlayerImpactMap {
  const rounds = match.rounds ?? [];
  if (rounds.length === 0) return {};
  const kills = match.kills ?? [];
  const damages = match.damages ?? [];
  const clutches = match.clutches ?? [];
  const bySteam = new Map<string, string>();
  const teamBySteam = new Map<string, 'A' | 'B'>();
  for (const p of match.players) {
    bySteam.set(p.steamId, p.name);
    teamBySteam.set(p.steamId, p.teamName === match.teamA.name ? 'A' : 'B');
  }

  const out: PlayerImpactMap = {};
  for (const p of match.players) out[p.name] = [];

  for (const r of rounds) {
    const n = r.number;
    if (!n) continue;
    const roundKills = kills.filter((k) => k.roundNumber === n);
    const firstKillKillerId = roundKills
      .slice()
      .sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0))[0]?.killerSteamId;

    for (const p of match.players) {
      const playerTeam = teamBySteam.get(p.steamId)!;
      const playerSide =
        playerTeam === 'A' ? (r.teamASide === TEAM_SIDE_CT ? 'CT' : 'T') : r.teamBSide === TEAM_SIDE_CT ? 'CT' : 'T';
      const winnerSide = r.winnerSide === TEAM_SIDE_CT ? 'CT' : r.winnerSide === TEAM_SIDE_T ? 'T' : null;
      const playerKills = roundKills.filter((k) => k.killerSteamId === p.steamId).length;
      const dmg = damages
        .filter((d) => d.roundNumber === n && d.attackerSteamId === p.steamId)
        .reduce((sum, d) => sum + (d.healthDamage ?? 0), 0);
      const clutchWon = clutches.some((c) => c.roundNumber === n && c.clutcherSteamId === p.steamId && c.won);
      out[p.name]!.push({
        n,
        dmg,
        kills: playerKills,
        firstKill: firstKillKillerId === p.steamId,
        multiKill: playerKills >= 3,
        clutchWon,
        won: winnerSide !== null && winnerSide === playerSide,
      });
    }
  }

  return out;
}
