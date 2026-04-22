import type { Damage, Match, Shot } from '../../analyzer/types.ts';

export interface AimRow {
  name: string;
  steamId: string;
  teamLetter: 'A' | 'B';
  shots: number;
  hitPct: number;
  hsAcc: number;
  /** Headshot kills as a percentage of total kills (distinct from hsAcc). */
  hsPct: number;
  sprayAcc: number;
  tapAcc: number;
  movingPct: number;
  avgDist: number;
  flashKills: number;
  blindKills: number;
}

export interface AimPanel {
  rows: AimRow[];
  bestTap: { name: string; acc: number } | null;
  bestSpray: { name: string; acc: number } | null;
  topShooter: { name: string; shots: number } | null;
}

const SPRAY_TICK_GAP = 10;
const MOVING_SPEED_THRESHOLD = 100;
const MIN_TAP_SHOTS = 20;
const MIN_SPRAY_SHOTS = 50;
const HEAD_HITGROUP = 1;

/**
 * Derive per-player aim/accuracy stats from raw shot + damage + kill events.
 *
 * Hit detection pairs each `damages[]` entry with the shooter's most recent
 * shot; this is approximate (multi-pellet shotguns and the rare cross-frame
 * damage event stretch the definition), but good enough for a summary panel.
 *
 * Shotgun shots and bot-controlled shots are excluded to keep the numbers
 * honest — a single Nova pull yields up to 9 damage events per trigger.
 */
export function computeAim(match: Match): AimPanel {
  const shots = (match.shots ?? []).filter((s) => !s.isPlayerControllingBot && !isShotgun(s.weaponName));
  const damages = match.damages ?? [];
  const kills = match.kills ?? [];

  const shotsByPlayer = indexBy(shots, (s) => s.playerSteamId);
  const damagesByPlayer = indexBy(damages, (d) => d.attackerSteamId);

  const rows: AimRow[] = [];
  for (const p of match.players) {
    const teamLetter: 'A' | 'B' = p.teamName === match.teamA.name ? 'A' : 'B';
    const pShots = shotsByPlayer.get(p.steamId) ?? [];
    const pDamages = (damagesByPlayer.get(p.steamId) ?? []).filter(
      (d) => !isShotgun(d.weaponName),
    );

    const { tap, spray } = classifyBursts(pShots);
    const { tapHits, sprayHits } = matchHitsToBursts(pShots, pDamages);

    const hitCount = pDamages.length;
    const hsCount = pDamages.filter((d) => d.hitgroup === HEAD_HITGROUP).length;
    const movingCount = pShots.filter((s) => shotSpeed(s) > MOVING_SPEED_THRESHOLD).length;

    const killsByPlayer = kills.filter((k) => k.killerSteamId === p.steamId);
    const dists: number[] = [];
    for (const k of killsByPlayer) {
      if (!k.killerPosition || !k.victimPosition) continue;
      const dx = k.killerPosition.x - k.victimPosition.x;
      const dy = k.killerPosition.y - k.victimPosition.y;
      const dz = k.killerPosition.z - k.victimPosition.z;
      dists.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    const avgDist = dists.length === 0 ? 0 : dists.reduce((a, b) => a + b, 0) / dists.length;

    const flashKills = killsByPlayer.filter((k) => k.isAssistedFlash).length;
    const blindKills = killsByPlayer.filter((k) => k.isKillerBlinded).length;
    const hsKillCount = killsByPlayer.filter((k) => k.isHeadshot).length;

    rows.push({
      name: p.name,
      steamId: p.steamId,
      teamLetter,
      shots: pShots.length,
      hitPct: pShots.length === 0 ? 0 : round1((hitCount / pShots.length) * 100),
      hsAcc: pShots.length === 0 ? 0 : round1((hsCount / pShots.length) * 100),
      hsPct: killsByPlayer.length === 0 ? 0 : round1((hsKillCount / killsByPlayer.length) * 100),
      tapAcc: tap === 0 ? 0 : round1((tapHits / tap) * 100),
      sprayAcc: spray === 0 ? 0 : round1((sprayHits / spray) * 100),
      movingPct: pShots.length === 0 ? 0 : round1((movingCount / pShots.length) * 100),
      avgDist: Math.round(avgDist),
      flashKills,
      blindKills,
    });
  }

  rows.sort((a, b) => {
    if (a.teamLetter !== b.teamLetter) return a.teamLetter.localeCompare(b.teamLetter);
    return b.hitPct - a.hitPct;
  });

  // Qualifying records — require minimum sample sizes for fairness.
  const tapEligible = rows.filter((r) => r.shots >= MIN_TAP_SHOTS);
  const sprayEligible = rows.filter((r) => r.shots >= MIN_SPRAY_SHOTS);
  const bestTap = tapEligible.length
    ? pickBest(tapEligible, (r) => r.tapAcc, (r) => ({ name: r.name, acc: r.tapAcc }))
    : null;
  const bestSpray = sprayEligible.length
    ? pickBest(sprayEligible, (r) => r.sprayAcc, (r) => ({ name: r.name, acc: r.sprayAcc }))
    : null;
  const topShooter =
    rows.length === 0
      ? null
      : pickBest(rows, (r) => r.shots, (r) => ({ name: r.name, shots: r.shots }));

  return { rows, bestTap, bestSpray, topShooter };
}

export function isAimEmpty(panel: AimPanel): boolean {
  return panel.rows.every((r) => r.shots === 0);
}

/** Group shots into bursts by tick gap. First shot in each burst = tap. */
function classifyBursts(shots: Shot[]): { tap: number; spray: number } {
  const sorted = [...shots].sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));
  let tap = 0;
  let spray = 0;
  let prevTick: number | null = null;
  for (const s of sorted) {
    const t = s.tick;
    if (t === undefined) continue;
    if (prevTick === null || t - prevTick > SPRAY_TICK_GAP) tap += 1;
    else spray += 1;
    prevTick = t;
  }
  return { tap, spray };
}

/**
 * For each damage event, find the attacker's most recent shot (within a
 * reasonable tick window) and credit the hit to that shot's burst position.
 * Approximate, but avoids an O(n²) join.
 */
function matchHitsToBursts(shots: Shot[], damages: Damage[]): { tapHits: number; sprayHits: number } {
  const sortedShots = [...shots].sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));
  let tapHits = 0;
  let sprayHits = 0;
  const dmgSorted = [...damages].sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));

  // Two-pointer walk: for each damage tick, advance shotIdx to the latest shot
  // at or before that tick. Classify that shot by whether it starts a burst.
  let shotIdx = -1;
  for (const d of dmgSorted) {
    const dTick = d.tick ?? 0;
    while (shotIdx + 1 < sortedShots.length && (sortedShots[shotIdx + 1]?.tick ?? 0) <= dTick) {
      shotIdx += 1;
    }
    if (shotIdx < 0) continue;
    const prev = shotIdx > 0 ? sortedShots[shotIdx - 1] : undefined;
    const cur = sortedShots[shotIdx];
    if (!cur) continue;
    const isTap =
      prev === undefined || prev.tick === undefined || cur.tick === undefined
        ? true
        : cur.tick - prev.tick > SPRAY_TICK_GAP;
    if (isTap) tapHits += 1;
    else sprayHits += 1;
  }
  return { tapHits, sprayHits };
}

function shotSpeed(s: Shot): number {
  const vx = s.velocityX ?? 0;
  const vy = s.velocityY ?? 0;
  return Math.sqrt(vx * vx + vy * vy);
}

function isShotgun(weaponName: string | undefined): boolean {
  if (!weaponName) return false;
  const lower = weaponName.toLowerCase();
  return lower.includes('nova') || lower.includes('xm1014') || lower.includes('mag-7') || lower.includes('mag7') || lower.includes('sawed');
}

function indexBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    let list = map.get(k);
    if (!list) {
      list = [];
      map.set(k, list);
    }
    list.push(item);
  }
  return map;
}

function pickBest<T, R>(rows: T[], score: (r: T) => number, project: (r: T) => R): R | null {
  if (rows.length === 0) return null;
  let best = rows[0]!;
  let bestScore = score(best);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const s = score(r);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return project(best);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
