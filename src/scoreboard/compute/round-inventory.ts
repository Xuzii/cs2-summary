import type { Match, PlayerPositionFrame, Round } from '../../analyzer/types.ts';

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
 * Per-round starting inventory snapshot per player.
 *
 * Real data when available — uses the earliest `PlayerPositionFrame` in the
 * live round for HP/armor/helmet/money/primary, and scans the round's frames
 * for any pistol the player drew to identify secondary. Nades come from
 * `match.grenades` (throws attributed to this player in this round) and are
 * a lower bound on what they went in with — a player who died holding an
 * unthrown smoke won't have it counted.
 *
 * Falls back to the legacy econ-type approximation for any round/player
 * lacking position frames (demos captured without -positions).
 */
export function computeRoundInventory(match: Match): RoundInventoryMap {
  const rounds = match.rounds ?? [];
  const out: RoundInventoryMap = {};
  const teamAName = match.teamA.name;

  const framesByRound = bucketFramesByRound(match.playerPositions ?? []);
  const nadesByRoundPlayer = buildNadeIndex(match);

  for (const r of rounds) {
    const n = r.number;
    if (!n) continue;
    const entries: Record<string, RoundInventoryEntry> = {};
    const roundFrames = framesByRound.get(n);

    for (const p of match.players) {
      const onA = p.teamName === teamAName;
      const econ = onA ? r.teamAEconomyType ?? 'full' : r.teamBEconomyType ?? 'full';
      const teamSide = onA ? r.teamASide : r.teamBSide;

      const playerFrames = roundFrames?.filter((f) => f.steamId === p.steamId) ?? [];
      const startFrame = pickStartFrame(playerFrames, r);

      const fallback = econFallback(econ, onA ? r.teamAStartMoney : r.teamBStartMoney);

      const hp = startFrame?.health ?? fallback.hp;
      const armor = startFrame?.armor ?? fallback.armor;
      const helmet = startFrame?.hasHelmet ?? fallback.helmet;
      const money = startFrame?.money ?? fallback.money;
      const primary = classifyPrimary(startFrame?.activeWeaponName) ?? fallback.primary;
      const secondary = pickSecondary(playerFrames, teamSide) ?? fallback.secondary;
      const nades = nadesByRoundPlayer.get(`${n}::${p.steamId}`) ?? [];

      entries[p.name] = {
        hp: clamp(hp, 0, 100),
        armor: clamp(armor, 0, 100),
        helmet: !!helmet,
        primary,
        secondary,
        nades,
        money: Math.max(0, Math.round(money)),
      };
    }
    out[n] = entries;
  }
  return out;
}

function bucketFramesByRound(frames: PlayerPositionFrame[]): Map<number, PlayerPositionFrame[]> {
  const out = new Map<number, PlayerPositionFrame[]>();
  for (const f of frames) {
    const n = f.roundNumber;
    if (n === undefined) continue;
    let arr = out.get(n);
    if (!arr) {
      arr = [];
      out.set(n, arr);
    }
    arr.push(f);
  }
  return out;
}

/**
 * Pick the earliest frame in the live round as the "going in" snapshot.
 * Prefer the first frame with tick >= startTick; fall back to the earliest
 * frame we have for this player in this round.
 */
function pickStartFrame(
  playerFrames: PlayerPositionFrame[],
  round: Round,
): PlayerPositionFrame | undefined {
  if (playerFrames.length === 0) return undefined;
  const startTick = round.startTick;
  if (startTick !== undefined) {
    let best: PlayerPositionFrame | undefined;
    let bestDelta = Infinity;
    for (const f of playerFrames) {
      if (f.tick === undefined) continue;
      const delta = f.tick - startTick;
      if (delta < 0) continue;
      if (delta < bestDelta) {
        best = f;
        bestDelta = delta;
      }
    }
    if (best) return best;
  }
  let earliest = playerFrames[0]!;
  for (const f of playerFrames) {
    if ((f.tick ?? Infinity) < (earliest.tick ?? Infinity)) earliest = f;
  }
  return earliest;
}

/**
 * Build (roundNumber::steamId → string[]) index of grenade labels thrown by
 * each player in each round. Labels are normalized to the same vocabulary the
 * UI's `.nade.{flash|smoke|he|molotov|decoy}` CSS expects.
 */
function buildNadeIndex(match: Match): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const g of match.grenades ?? []) {
    if (!g.roundNumber || !g.throwerSteamId || !g.type) continue;
    const label = normalizeGrenadeLabel(g.type);
    if (!label) continue;
    const key = `${g.roundNumber}::${g.throwerSteamId}`;
    let arr = out.get(key);
    if (!arr) {
      arr = [];
      out.set(key, arr);
    }
    arr.push(label);
  }
  return out;
}

function normalizeGrenadeLabel(raw: string): string | null {
  const s = raw.toLowerCase();
  if (s.includes('smoke')) return 'smoke';
  if (s.includes('flash')) return 'flash';
  if (s.includes('molot') || s.includes('incgren') || s.includes('incendiary') || s.includes('inc_')) return 'molotov';
  if (s.includes('decoy')) return 'decoy';
  if (s.includes('he') || s === 'hegrenade') return 'he';
  return null;
}

// Primary weapon classification. Reject-list approach: anything not on the
// non-primary list that the parser exposes as activeWeaponName is treated as a
// primary. Covers cs-demo-analyzer's lowercase snake_case weapon names.
const NON_PRIMARY = new Set<string>([
  'knife',
  'knife_t',
  'knife_ct',
  'knife_default_ct',
  'knife_default_t',
  'knife_karambit',
  'knife_bayonet',
  'knife_butterfly',
  'knife_flip',
  'knife_gut',
  'knife_tactical',
  'knife_falchion',
  'knife_survival_bowie',
  'knife_ursus',
  'knife_gypsy_jackknife',
  'knife_stiletto',
  'knife_widowmaker',
  'knife_css',
  'knife_cord',
  'knife_canis',
  'knife_outdoor',
  'knife_skeleton',
  'knife_m9_bayonet',
  'knife_push',
  'knife_nomad',
  'knife_kukri',
  'bayonet',
  'taser',
  'zeus',
  'c4',
  'glock',
  'usp_s',
  'p2000',
  'hkp2000',
  'p250',
  'fiveseven',
  'tec9',
  'cz75a',
  'deagle',
  'elite',
  'revolver',
  'flashbang',
  'smokegrenade',
  'hegrenade',
  'molotov',
  'incgrenade',
  'decoy',
]);

const PISTOLS = new Set<string>([
  'glock',
  'usp_s',
  'p2000',
  'hkp2000',
  'p250',
  'fiveseven',
  'tec9',
  'cz75a',
  'deagle',
  'elite',
  'revolver',
]);

function classifyPrimary(weapon: string | undefined): string | null {
  if (!weapon) return null;
  const w = weapon.toLowerCase().replace(/^weapon_/, '');
  if (NON_PRIMARY.has(w)) return null;
  return w;
}

function pickSecondary(frames: PlayerPositionFrame[], side: number | undefined): string | null {
  for (const f of frames) {
    const w = f.activeWeaponName?.toLowerCase().replace(/^weapon_/, '');
    if (w && PISTOLS.has(w)) return w;
  }
  // Side default: T=Glock (2), CT=USP-S (3). Fall back to USP-S if unknown.
  if (side === 2) return 'glock';
  if (side === 3) return 'usp_s';
  return null;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Legacy econ-type-derived snapshot, used as a per-field fallback when real
 * per-tick data isn't available for this (round, player). Kept so demos
 * captured without -positions don't regress to blank rows.
 */
function econFallback(econ: string, teamStartMoney: number | undefined): {
  hp: number;
  armor: number;
  helmet: boolean;
  primary: string | null;
  secondary: string;
  money: number;
} {
  const isEco = /eco/i.test(econ);
  const isForce = /force|semi/i.test(econ);
  const isPistol = /pistol/i.test(econ);
  return {
    hp: 100,
    armor: isEco || isPistol ? 0 : 100,
    helmet: !isEco && !isPistol && !isForce,
    primary: isEco || isPistol ? null : isForce ? 'mp9' : 'ak47',
    secondary: 'usp_s',
    money: Math.max(0, Math.round(((teamStartMoney ?? 0) / 5))),
  };
}
