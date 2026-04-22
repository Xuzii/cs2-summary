import type { Match, Kill } from '../../analyzer/types.ts';
import { TEAM_SIDE_CT, TEAM_SIDE_T } from '../../analyzer/types.ts';

export interface OpeningSpatialEntry {
  n: number;
  x: number;
  y: number;
  winnerSide: 'CT' | 'T';
  killer: string;
  victim: string;
  weapon: string;
}

export function computeOpeningsSpatial(match: Match): OpeningSpatialEntry[] {
  const kills = match.kills ?? [];
  const byRound = new Map<number, Kill>();
  for (const k of kills) {
    if (!k.isFirstKill || k.roundNumber === undefined) continue;
    const existing = byRound.get(k.roundNumber);
    if (!existing || (k.tick ?? 0) < (existing.tick ?? 0)) byRound.set(k.roundNumber, k);
  }

  const out: OpeningSpatialEntry[] = [];
  for (const [n, k] of [...byRound.entries()].sort((a, b) => a[0] - b[0])) {
    const kp = k.killerPosition;
    const vp = k.victimPosition;
    const x = kp && vp ? (kp.x + vp.x) / 2 : kp?.x ?? vp?.x ?? 0;
    const y = kp && vp ? (kp.y + vp.y) / 2 : kp?.y ?? vp?.y ?? 0;
    const side = k.killerSide === TEAM_SIDE_CT ? 'CT' : k.killerSide === TEAM_SIDE_T ? 'T' : 'T';
    out.push({
      n,
      x,
      y,
      winnerSide: side,
      killer: k.killerName,
      victim: k.victimName,
      weapon: k.weaponName ?? '',
    });
  }
  return out;
}
