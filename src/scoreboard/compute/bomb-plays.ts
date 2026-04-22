import type { Match } from '../../analyzer/types.ts';

export interface BombPlays {
  plantsA: number;
  plantsB: number;
  plantsTotal: number;
  defuses: number;
  topPlanter: { name: string; count: number } | null;
  topDefuser: { name: string; count: number } | null;
}

/**
 * Match-wide bomb play aggregates. Site breakdown (A vs B) requires
 * `match.bombsPlanted[]` with a `site` field; when the parser omits that
 * the panel degrades to the per-site-agnostic `plantsTotal`.
 */
export function computeBombPlays(match: Match): BombPlays {
  const plants = match.bombsPlanted ?? [];
  const defuses = match.bombsDefused ?? [];

  let plantsA = 0;
  let plantsB = 0;
  const planterByPlayer = new Map<string, number>();
  for (const p of plants) {
    if (p.site === 'A') plantsA += 1;
    else if (p.site === 'B') plantsB += 1;
    if (p.playerSteamId) {
      planterByPlayer.set(p.playerSteamId, (planterByPlayer.get(p.playerSteamId) ?? 0) + 1);
    }
  }

  const defuserByPlayer = new Map<string, number>();
  for (const d of defuses) {
    if (!d.playerSteamId) continue;
    defuserByPlayer.set(d.playerSteamId, (defuserByPlayer.get(d.playerSteamId) ?? 0) + 1);
  }

  // If the event array is empty or lacks steam IDs, fall back to per-player
  // aggregate counts (bombPlantedCount / bombDefusedCount) which most parser
  // variants populate.
  if (planterByPlayer.size === 0) {
    for (const p of match.players) {
      if (p.bombPlantedCount && p.bombPlantedCount > 0) {
        planterByPlayer.set(p.steamId, p.bombPlantedCount);
      }
    }
  }
  if (defuserByPlayer.size === 0) {
    for (const p of match.players) {
      if (p.bombDefusedCount && p.bombDefusedCount > 0) {
        defuserByPlayer.set(p.steamId, p.bombDefusedCount);
      }
    }
  }

  const plantsTotalFallback = [...planterByPlayer.values()].reduce((a, b) => a + b, 0);
  const plantsTotal = plants.length > 0 ? plants.length : plantsTotalFallback;
  const defusesTotal =
    defuses.length > 0 ? defuses.length : [...defuserByPlayer.values()].reduce((a, b) => a + b, 0);

  const topPlanter = bestOf(planterByPlayer, match);
  const topDefuser = bestOf(defuserByPlayer, match);

  return {
    plantsA,
    plantsB,
    plantsTotal,
    defuses: defusesTotal,
    topPlanter,
    topDefuser,
  };
}

export function isBombPlaysEmpty(b: BombPlays): boolean {
  return b.plantsTotal === 0 && b.defuses === 0;
}

function bestOf(
  counts: Map<string, number>,
  match: Match,
): { name: string; count: number } | null {
  if (counts.size === 0) return null;
  let bestId: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestId = id;
      bestCount = count;
    }
  }
  if (!bestId) return null;
  const player = match.players.find((p) => p.steamId === bestId);
  return { name: player?.name ?? 'Unknown', count: bestCount };
}
