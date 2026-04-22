import type { Match } from '../../analyzer/types.ts';

export interface DuelMatrixPlayer {
  steamId: string;
  name: string;
  teamLetter: 'A' | 'B';
}

export interface DuelMatrix {
  players: DuelMatrixPlayer[];
  /** kills[killerIdx][victimIdx] — kill counts in that head-to-head. */
  kills: number[][];
  /** True when there are no kill events to aggregate. */
  isEmpty: boolean;
}

/**
 * Build a square matrix of kill counts between every pair of players. Rows =
 * killer, cols = victim. Diagonal stays zero (self-kills don't count).
 *
 * Player order: team A first (sorted by name), then team B. This keeps visually
 * adjacent groupings in the rendered grid.
 */
export function computeDuelMatrix(match: Match): DuelMatrix {
  const teamA = match.players
    .filter((p) => p.teamName === match.teamA.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  const teamB = match.players
    .filter((p) => p.teamName === match.teamB.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  const players: DuelMatrixPlayer[] = [
    ...teamA.map((p) => ({ steamId: p.steamId, name: p.name, teamLetter: 'A' as const })),
    ...teamB.map((p) => ({ steamId: p.steamId, name: p.name, teamLetter: 'B' as const })),
  ];

  const indexById = new Map(players.map((p, i) => [p.steamId, i]));
  const kills: number[][] = players.map(() => players.map(() => 0));

  const events = match.kills ?? [];
  for (const k of events) {
    const killerIdx = indexById.get(k.killerSteamId);
    const victimIdx = indexById.get(k.victimSteamId);
    if (killerIdx === undefined || victimIdx === undefined) continue;
    if (killerIdx === victimIdx) continue;
    kills[killerIdx]![victimIdx]! += 1;
  }

  return { players, kills, isEmpty: events.length === 0 };
}
