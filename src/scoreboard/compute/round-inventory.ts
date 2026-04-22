import type { Match } from '../../analyzer/types.ts';

export interface RoundInventoryEntry {
  hp: number;
  armor: number;
  helmet: boolean;
  primary: string | null;
  secondary: string;
  nades: string[];
  money: number;
}

export type RoundInventoryMap = Record<number, Record<string, RoundInventoryEntry>>;

/**
 * Approximate per-round inventory snapshots. The analyzer doesn't give us
 * freeze-end loadouts directly, so we infer from per-round econ type + the
 * player's start money.
 *
 * This is a coarse approximation; good enough for the viewer's HP/inv sidebar
 * but not authoritative for e.g. "which exact rifle did X have at plant time".
 */
export function computeRoundInventory(match: Match): RoundInventoryMap {
  const rounds = match.rounds ?? [];
  const out: RoundInventoryMap = {};
  const teamAName = match.teamA.name;

  for (const r of rounds) {
    const n = r.number;
    if (!n) continue;
    const entries: Record<string, RoundInventoryEntry> = {};
    for (const p of match.players) {
      const onA = p.teamName === teamAName;
      const econ = onA ? r.teamAEconomyType ?? 'full' : r.teamBEconomyType ?? 'full';
      const isEco = /eco/i.test(econ);
      const isForce = /force|semi/i.test(econ);
      const isPistol = /pistol/i.test(econ);
      const primary = isEco || isPistol ? null : isForce ? 'mp9' : 'ak47';
      const secondary = 'usp_s';
      const nades = isEco ? [] : isForce ? ['flash'] : ['flash', 'smoke'];
      const money = onA ? r.teamAStartMoney ?? 0 : r.teamBStartMoney ?? 0;
      entries[p.name] = {
        hp: 100,
        armor: isEco || isPistol ? 0 : 100,
        helmet: !isEco && !isPistol && !isForce,
        primary,
        secondary,
        nades,
        money: Math.max(0, Math.round(money / 5)),
      };
    }
    out[n] = entries;
  }
  return out;
}
