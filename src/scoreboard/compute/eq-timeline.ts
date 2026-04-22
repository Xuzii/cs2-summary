import type { Match } from '../../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../../analyzer/types.ts';

export interface EqTimelineEntry {
  n: number;
  eqA: number;
  eqB: number;
  winner: 'CT' | 'T';
}

export function computeEqTimeline(match: Match): EqTimelineEntry[] {
  const rounds = match.rounds ?? [];
  return rounds.map((r, idx) => ({
    n: r.number || idx + 1,
    eqA: r.teamAEquipmentValue ?? 0,
    eqB: r.teamBEquipmentValue ?? 0,
    winner: r.winnerSide === TEAM_SIDE_CT ? 'CT' : r.winnerSide === TEAM_SIDE_T ? 'T' : 'T',
  }));
}
