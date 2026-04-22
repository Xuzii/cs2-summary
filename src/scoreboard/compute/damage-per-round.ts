import type { Match } from '../../analyzer/types.ts';

export type DamagePerRound = Record<string, number[]>;

/** {[playerName]: [r1Dmg, r2Dmg, ...]} — zero-filled to round count. */
export function computeDamagePerRound(match: Match): DamagePerRound {
  const rounds = match.rounds ?? [];
  const roundCount = rounds.length;
  const playerBySteam = new Map<string, string>();
  for (const p of match.players) playerBySteam.set(p.steamId, p.name);

  const out: DamagePerRound = {};
  for (const p of match.players) out[p.name] = new Array(roundCount).fill(0);

  const damages = match.damages ?? [];
  const minRound = rounds.length > 0 ? (rounds[0]!.number ?? 1) : 1;

  for (const d of damages) {
    if (d.roundNumber === undefined) continue;
    const name = playerBySteam.get(d.attackerSteamId);
    if (!name) continue;
    const idx = d.roundNumber - minRound;
    if (idx < 0 || idx >= roundCount) continue;
    const arr = out[name];
    if (!arr) continue;
    arr[idx] = (arr[idx] ?? 0) + (d.healthDamage ?? 0);
  }

  return out;
}
