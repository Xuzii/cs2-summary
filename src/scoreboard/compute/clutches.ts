import type { Match } from '../../analyzer/types.ts';

export interface ClutchMultiRow {
  name: string;
  steamId: string;
  teamLetter: 'A' | 'B';
  /** vs-one up to vs-five: won/attempted counts (attempts 0 when the event never triggered). */
  v1: { won: number; att: number };
  v2: { won: number; att: number };
  v3: { won: number; att: number };
  v4: { won: number; att: number };
  v5: { won: number; att: number };
  twoK: number;
  threeK: number;
  fourK: number;
  ace: number;
}

/**
 * Per-player clutch (1v1..1v5) and multi-kill (2k/3k/4k/ace) aggregates.
 *
 * Clutch buckets come from `match.clutches[]` when available (parser emits
 * per-scenario events with `opponentsCount`) and fall back to the flat
 * `MatchPlayer.oneVsOneCount/WonCount` + `clutchCount/WonCount` aggregates,
 * which lump 1v2..1v5 together so they all land in v2.
 *
 * Multi-kill counts come straight from `MatchPlayer.twoKillCount`..`fiveKillCount`.
 */
export function computeClutchMulti(match: Match): ClutchMultiRow[] {
  const byPlayer = new Map<string, ClutchMultiRow>();
  for (const p of match.players) {
    const teamLetter: 'A' | 'B' = p.teamName === match.teamA.name ? 'A' : 'B';
    byPlayer.set(p.steamId, {
      name: p.name,
      steamId: p.steamId,
      teamLetter,
      v1: { won: 0, att: 0 },
      v2: { won: 0, att: 0 },
      v3: { won: 0, att: 0 },
      v4: { won: 0, att: 0 },
      v5: { won: 0, att: 0 },
      twoK: p.twoKillCount ?? 0,
      threeK: p.threeKillCount ?? 0,
      fourK: p.fourKillCount ?? 0,
      ace: p.fiveKillCount ?? 0,
    });
  }

  const clutches = match.clutches ?? [];
  if (clutches.length > 0) {
    for (const c of clutches) {
      const row = byPlayer.get(c.clutcherSteamId);
      if (!row) continue;
      const bucket = bucketFor(row, c.opponentsCount);
      if (!bucket) continue;
      bucket.att += 1;
      if (c.won) bucket.won += 1;
    }
  } else {
    // Fall back to per-player aggregates when the parser doesn't emit events.
    for (const p of match.players) {
      const row = byPlayer.get(p.steamId);
      if (!row) continue;
      if (p.oneVsOneCount !== undefined) {
        row.v1.att = p.oneVsOneCount;
        row.v1.won = p.oneVsOneWonCount ?? 0;
      }
      if (p.clutchCount !== undefined) {
        const totalAtt = p.clutchCount;
        const totalWon = p.clutchWonCount ?? 0;
        const v1Att = row.v1.att;
        const v1Won = row.v1.won;
        // Remainder lands in v2 as a "1v2+" bucket we can't further split.
        row.v2.att = Math.max(0, totalAtt - v1Att);
        row.v2.won = Math.max(0, totalWon - v1Won);
      }
    }
  }

  return [...byPlayer.values()].sort((a, b) => {
    if (a.teamLetter !== b.teamLetter) return a.teamLetter.localeCompare(b.teamLetter);
    const scoreA = a.v1.won * 2 + a.v2.won * 3 + a.v3.won * 4 + a.v4.won * 5 + a.v5.won * 6 + a.ace * 4 + a.fourK * 3 + a.threeK * 2 + a.twoK;
    const scoreB = b.v1.won * 2 + b.v2.won * 3 + b.v3.won * 4 + b.v4.won * 5 + b.v5.won * 6 + b.ace * 4 + b.fourK * 3 + b.threeK * 2 + b.twoK;
    return scoreB - scoreA;
  });
}

export function isClutchMultiEmpty(rows: ClutchMultiRow[]): boolean {
  return rows.every(
    (r) =>
      r.v1.att + r.v2.att + r.v3.att + r.v4.att + r.v5.att === 0 &&
      r.twoK + r.threeK + r.fourK + r.ace === 0,
  );
}

function bucketFor(row: ClutchMultiRow, opponents: number): ClutchMultiRow['v1'] | null {
  switch (opponents) {
    case 1:
      return row.v1;
    case 2:
      return row.v2;
    case 3:
      return row.v3;
    case 4:
      return row.v4;
    case 5:
      return row.v5;
    default:
      return null;
  }
}
