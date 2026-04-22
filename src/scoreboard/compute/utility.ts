import type { Match } from '../../analyzer/types.ts';

export interface UtilityRow {
  name: string;
  steamId: string;
  teamLetter: 'A' | 'B';
  heDamage: number;
  heDamagePerRound: number;
  flashThrown: number;
  enemiesFlashed: number;
  /** Total seconds of enemy blindness inflicted. */
  blindTime: number;
  flashAssists: number;
  smokes: number;
  molotovs: number;
}

/**
 * Per-player utility stats. The csda parser doesn't aggregate flash/smoke/HE
 * counts on the player object, so we derive them from the event arrays that
 * load-match.ts unifies: `grenades` (all thrown grenades), `playerBlinds`
 * (each flash-enemy event), `kills` (flash-assist attribution).
 */
export function computeUtility(match: Match): UtilityRow[] {
  const agg = aggregateEvents(match);

  return match.players
    .map((p) => {
      const teamLetter: 'A' | 'B' = p.teamName === match.teamA.name ? 'A' : 'B';
      const ev = agg.get(p.steamId) ?? blank();
      return {
        name: p.name,
        steamId: p.steamId,
        teamLetter,
        heDamage: p.utilityDamage ?? 0,
        heDamagePerRound: round1(p.averageUtilityDamagePerRound ?? 0),
        flashThrown: p.flashThrownCount ?? ev.flashThrown,
        enemiesFlashed: p.enemiesFlashedCount ?? ev.enemiesFlashed,
        blindTime: round1(p.blindTimeInflicted ?? ev.blindTime),
        flashAssists: p.flashAssistCount ?? ev.flashAssists,
        smokes: p.smokeThrownCount ?? ev.smokes,
        molotovs: p.molotovThrownCount ?? ev.molotovs,
      };
    })
    .sort((a, b) => {
      if (a.teamLetter !== b.teamLetter) return a.teamLetter.localeCompare(b.teamLetter);
      const aScore = a.heDamage + a.enemiesFlashed * 10 + a.flashAssists * 25;
      const bScore = b.heDamage + b.enemiesFlashed * 10 + b.flashAssists * 25;
      return bScore - aScore;
    });
}

export function isUtilityDataEmpty(rows: UtilityRow[]): boolean {
  return rows.every(
    (r) => r.heDamage === 0 && r.enemiesFlashed === 0 && r.flashAssists === 0 && r.smokes === 0,
  );
}

interface Counts {
  flashThrown: number;
  smokes: number;
  molotovs: number;
  enemiesFlashed: number;
  blindTime: number;
  flashAssists: number;
}
function blank(): Counts {
  return { flashThrown: 0, smokes: 0, molotovs: 0, enemiesFlashed: 0, blindTime: 0, flashAssists: 0 };
}

function aggregateEvents(match: Match): Map<string, Counts> {
  const out = new Map<string, Counts>();
  const get = (id: string) => {
    let v = out.get(id);
    if (!v) {
      v = blank();
      out.set(id, v);
    }
    return v;
  };

  for (const g of match.grenades ?? []) {
    const id = g.throwerSteamId;
    if (!id) continue;
    const type = (g.type ?? '').toLowerCase();
    if (type.includes('flash')) get(id).flashThrown += 1;
    else if (type.includes('smoke')) get(id).smokes += 1;
    else if (type.includes('molot') || type.includes('inferno') || type.includes('incend'))
      get(id).molotovs += 1;
  }

  for (const b of match.playerBlinds ?? []) {
    const flasher = b.flasherSteamId;
    const flashed = b.flashedSteamId;
    if (!flasher || !flashed) continue;
    // Only count enemies — a teamflash shouldn't credit the flasher.
    if (b.flasherSide !== undefined && b.flashedSide !== undefined && b.flasherSide === b.flashedSide) continue;
    const c = get(flasher);
    c.enemiesFlashed += 1;
    c.blindTime += b.duration ?? 0;
  }

  for (const k of match.kills ?? []) {
    if (!k.isAssistedFlash) continue;
    const assister = k.assisterSteamId;
    if (!assister) continue;
    get(assister).flashAssists += 1;
  }

  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
