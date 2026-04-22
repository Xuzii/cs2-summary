import type { Match } from '../../analyzer/types.ts';

export interface BodyHitGroup {
  head: number;
  chest: number;
  stomach: number;
  legs: number;
  arms: number;
  shots: number;
  hits: number;
}

export type BodyAccuracyMap = Record<string, BodyHitGroup>;

/**
 * Per-player hit-group distribution (% of hits that landed on each region).
 * hitgroup enum per analyzer: 0=generic, 1=head, 2=chest, 3=stomach,
 * 4=left arm, 5=right arm, 6=left leg, 7=right leg, 8=neck, 10=gear.
 */
export function computeBodyAccuracy(match: Match): BodyAccuracyMap {
  const damages = match.damages ?? [];
  const shots = match.shots ?? [];

  const playerBySteamId = new Map<string, string>();
  for (const p of match.players) playerBySteamId.set(p.steamId, p.name);

  const out: BodyAccuracyMap = {};
  for (const p of match.players) {
    out[p.name] = { head: 0, chest: 0, stomach: 0, legs: 0, arms: 0, shots: 0, hits: 0 };
  }

  const raw: Record<string, { head: number; chest: number; stomach: number; legs: number; arms: number; hits: number }> = {};
  for (const p of match.players) {
    raw[p.name] = { head: 0, chest: 0, stomach: 0, legs: 0, arms: 0, hits: 0 };
  }

  for (const d of damages) {
    const name = playerBySteamId.get(d.attackerSteamId);
    if (!name) continue;
    const acc = raw[name];
    if (!acc) continue;
    acc.hits += 1;
    const hg = d.hitgroup ?? 0;
    if (hg === 1 || hg === 8) acc.head += 1;
    else if (hg === 2) acc.chest += 1;
    else if (hg === 3) acc.stomach += 1;
    else if (hg === 4 || hg === 5) acc.arms += 1;
    else if (hg === 6 || hg === 7) acc.legs += 1;
    else acc.chest += 1; // generic/torso default
  }

  const shotsByPlayer = new Map<string, number>();
  for (const s of shots) {
    const name = playerBySteamId.get(s.playerSteamId);
    if (!name) continue;
    shotsByPlayer.set(name, (shotsByPlayer.get(name) ?? 0) + 1);
  }

  for (const [name, v] of Object.entries(raw)) {
    const totalRegion = v.head + v.chest + v.stomach + v.legs + v.arms;
    const pct = (count: number): number => (totalRegion > 0 ? Math.round((count / totalRegion) * 100) : 0);
    out[name] = {
      head: pct(v.head),
      chest: pct(v.chest),
      stomach: pct(v.stomach),
      legs: pct(v.legs),
      arms: pct(v.arms),
      shots: shotsByPlayer.get(name) ?? 0,
      hits: v.hits,
    };
  }

  return out;
}

export function isBodyAccuracyEmpty(map: BodyAccuracyMap): boolean {
  return Object.values(map).every((v) => v.hits === 0 && v.shots === 0);
}
