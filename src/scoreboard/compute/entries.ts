import type { Match } from '../../analyzer/types.ts';

export interface EntryTradeRow {
  name: string;
  steamId: string;
  teamLetter: 'A' | 'B';
  firstKills: number;
  firstDeaths: number;
  tradeKills: number;
  tradeDeaths: number;
  utilityDamage: number;
  utilPerRound: number;
  /** Total health damage dealt across the match (sum of damages[].healthDamage). */
  dmgGiven: number;
  /** Total health damage received across the match. */
  dmgTaken: number;
}

/**
 * Per-player entry + trade aggregate panel. Complements the main scoreboard
 * (FK is shown there too) by adding first-death, trade kill, trade death, and
 * total utility damage so readers can judge entry effectiveness vs whiffed.
 *
 * All fields come from `MatchPlayer` aggregates when present; missing counts
 * degrade to zero (empty row). `utilityDamage` total is preserved here
 * alongside `averageUtilityDamagePerRound` for convenience.
 */
export function computeEntryTrade(match: Match): EntryTradeRow[] {
  const damages = match.damages ?? [];
  const givenBy = new Map<string, number>();
  const takenBy = new Map<string, number>();
  for (const d of damages) {
    const hp = d.healthDamage ?? 0;
    if (hp <= 0) continue;
    if (d.attackerSteamId) givenBy.set(d.attackerSteamId, (givenBy.get(d.attackerSteamId) ?? 0) + hp);
    if (d.victimSteamId) takenBy.set(d.victimSteamId, (takenBy.get(d.victimSteamId) ?? 0) + hp);
  }

  return match.players
    .map((p): EntryTradeRow => {
      const teamLetter: 'A' | 'B' = p.teamName === match.teamA.name ? 'A' : 'B';
      return {
        name: p.name,
        steamId: p.steamId,
        teamLetter,
        firstKills: p.firstKillCount ?? 0,
        firstDeaths: p.firstDeathCount ?? 0,
        tradeKills: p.tradeKillCount ?? 0,
        tradeDeaths: p.tradeDeathCount ?? 0,
        utilityDamage: p.utilityDamage ?? 0,
        utilPerRound: round1(p.averageUtilityDamagePerRound ?? 0),
        dmgGiven: givenBy.get(p.steamId) ?? 0,
        dmgTaken: takenBy.get(p.steamId) ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.teamLetter !== b.teamLetter) return a.teamLetter.localeCompare(b.teamLetter);
      const scoreA = a.firstKills * 3 - a.firstDeaths + a.tradeKills + a.utilityDamage / 50;
      const scoreB = b.firstKills * 3 - b.firstDeaths + b.tradeKills + b.utilityDamage / 50;
      return scoreB - scoreA;
    });
}

export function isEntryTradeEmpty(rows: EntryTradeRow[]): boolean {
  return rows.every(
    (r) => r.firstKills === 0 && r.firstDeaths === 0 && r.tradeKills === 0 && r.utilityDamage === 0,
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
