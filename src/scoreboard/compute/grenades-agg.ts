import type { Match } from '../../analyzer/types.ts';

export interface GrenadeByType {
  smoke: number;
  flash: number;
  he: number;
  molotov: number;
  decoy: number;
}

export interface GrenadeTopThrower {
  name: string;
  count: number;
}

export interface GrenadesAgg {
  total: number;
  byType: GrenadeByType;
  topThrowers: GrenadeTopThrower[];
}

function normType(raw: string | undefined): keyof GrenadeByType | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes('smoke')) return 'smoke';
  if (s.includes('flash')) return 'flash';
  if (s.includes('he') || s === 'hegrenade') return 'he';
  if (s.includes('molot') || s.includes('incgren') || s.includes('incendiary')) return 'molotov';
  if (s.includes('decoy')) return 'decoy';
  return null;
}

export function computeGrenadesAgg(match: Match): GrenadesAgg {
  const g = match.grenades ?? [];
  const byType: GrenadeByType = { smoke: 0, flash: 0, he: 0, molotov: 0, decoy: 0 };
  const perThrower = new Map<string, number>();
  for (const n of g) {
    const t = normType(n.type);
    if (!t) continue;
    byType[t] += 1;
    const name = n.throwerName;
    if (name) perThrower.set(name, (perThrower.get(name) ?? 0) + 1);
  }
  const topThrowers = [...perThrower.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  return {
    total: byType.smoke + byType.flash + byType.he + byType.molotov + byType.decoy,
    byType,
    topThrowers,
  };
}
