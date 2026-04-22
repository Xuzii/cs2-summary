import type { Match } from '../../analyzer/types.ts';

export type FlashMatrix = Record<string, Record<string, number>>;

/** {[thrower]: {[victim]: count}} — symmetric & team-inclusive. */
export function computeFlashMatrix(match: Match): FlashMatrix {
  const out: FlashMatrix = {};
  for (const p of match.players) out[p.name] = {};

  const bySteam = new Map<string, string>();
  for (const p of match.players) bySteam.set(p.steamId, p.name);

  const blinds = match.playerBlinds ?? [];
  for (const b of blinds) {
    const throwerName = b.flasherSteamId ? bySteam.get(b.flasherSteamId) : undefined;
    const victimName = b.flashedSteamId ? bySteam.get(b.flashedSteamId) : undefined;
    if (!throwerName || !victimName) continue;
    const row = out[throwerName];
    if (!row) continue;
    row[victimName] = (row[victimName] ?? 0) + 1;
  }

  return out;
}

export function isFlashMatrixEmpty(m: FlashMatrix): boolean {
  for (const row of Object.values(m)) {
    for (const v of Object.values(row)) if (v > 0) return false;
  }
  return true;
}
