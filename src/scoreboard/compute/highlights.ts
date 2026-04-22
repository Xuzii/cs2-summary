import type { Match, MatchPlayer } from '../../analyzer/types.ts';

export interface Highlight {
  /** Short tag like "MVP" or "ACE". */
  label: string;
  player: string;
  detail: string;
}

/**
 * Pick a handful of standout moments for a match. Each highlight is independent;
 * if the data needed for one is missing, the others still render. At most ~6
 * entries so the panel stays compact.
 */
export function computeHighlights(match: Match): Highlight[] {
  const out: Highlight[] = [];

  const mvp = pickBy(match.players, (p) => rating(p));
  if (mvp) {
    out.push({
      label: 'MVP',
      player: mvp.name,
      detail: `${mvp.killCount}k · ${round2(rating(mvp))} rating · ${round1(mvp.averageDamagePerRound)} ADR`,
    });
  }

  const topFragger = pickBy(match.players, (p) => p.killCount);
  if (topFragger && topFragger !== mvp) {
    out.push({
      label: 'Top fragger',
      player: topFragger.name,
      detail: `${topFragger.killCount} kills · ${round1(topFragger.headshotPercentage)}% HS`,
    });
  }

  const bestEntry = pickBestEntry(match);
  if (bestEntry) out.push(bestEntry);

  const clutchHero = pickClutchHero(match);
  if (clutchHero) out.push(clutchHero);

  const utilKing = pickUtilityLeader(match);
  if (utilKing) out.push(utilKing);

  const multikill = pickMultikill(match);
  if (multikill) out.push(multikill);

  return out;
}

function pickBestEntry(match: Match): Highlight | undefined {
  const ranked = match.players
    .map((p) => {
      const attempts = (p.firstKillCount ?? 0) + (p.firstDeathCount ?? 0);
      if (attempts < 3) return null;
      const pct = ((p.firstKillCount ?? 0) / attempts) * 100;
      return { p, attempts, wins: p.firstKillCount ?? 0, pct };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .sort((a, b) => b.wins - a.wins || b.pct - a.pct);
  const top = ranked[0];
  if (!top) return undefined;
  return {
    label: 'Best entry',
    player: top.p.name,
    detail: `${top.wins}/${top.attempts} opening duels (${round1(top.pct)}%)`,
  };
}

function pickClutchHero(match: Match): Highlight | undefined {
  // Prefer the per-round clutch array (shows size of clutch) when present.
  if (match.clutches && match.clutches.length > 0) {
    const wonClutches = match.clutches.filter((c) => c.won);
    if (wonClutches.length > 0) {
      // Biggest wins first.
      const bySize = [...wonClutches].sort((a, b) => b.opponentsCount - a.opponentsCount);
      const byPlayer = new Map<string, { wins: number; biggest: number }>();
      for (const c of wonClutches) {
        const prev = byPlayer.get(c.clutcherSteamId) ?? { wins: 0, biggest: 0 };
        prev.wins += 1;
        prev.biggest = Math.max(prev.biggest, c.opponentsCount);
        byPlayer.set(c.clutcherSteamId, prev);
      }
      // Hero: the one who won the biggest clutch; tiebreak by total wins.
      const heroId = bySize[0]!.clutcherSteamId;
      const hero = match.players.find((p) => p.steamId === heroId);
      const stat = byPlayer.get(heroId)!;
      if (hero) {
        return {
          label: 'Clutch',
          player: hero.name,
          detail: `1v${bySize[0]!.opponentsCount} win · ${stat.wins}× clutch total`,
        };
      }
    }
  }

  // Fallback: aggregate counters on the player object.
  const ranked = match.players
    .map((p) => {
      const wins = p.clutchWonCount ?? p.oneVsOneWonCount ?? 0;
      const attempts = p.clutchCount ?? p.oneVsOneCount ?? 0;
      return { p, wins, attempts };
    })
    .filter((v) => v.wins > 0)
    .sort((a, b) => b.wins - a.wins);
  const top = ranked[0];
  if (!top) return undefined;
  return {
    label: 'Clutch',
    player: top.p.name,
    detail: top.attempts > 0 ? `${top.wins}/${top.attempts} clutches` : `${top.wins} clutches`,
  };
}

function pickUtilityLeader(match: Match): Highlight | undefined {
  // Prefer flash impact (enemies flashed or flash assists), fall back to HE damage.
  const withFlash = match.players
    .map((p) => ({ p, flashed: p.enemiesFlashedCount ?? 0, assists: p.flashAssistCount ?? 0 }))
    .filter((v) => v.flashed > 0 || v.assists > 0)
    .sort((a, b) => b.flashed + b.assists * 2 - (a.flashed + a.assists * 2));
  if (withFlash.length > 0) {
    const top = withFlash[0]!;
    const parts: string[] = [];
    if (top.flashed > 0) parts.push(`${top.flashed} enemies flashed`);
    if (top.assists > 0) parts.push(`${top.assists} flash assists`);
    return { label: 'Utility', player: top.p.name, detail: parts.join(' · ') };
  }

  const topNader = pickBy(match.players, (p) => p.utilityDamage ?? 0);
  if (topNader && (topNader.utilityDamage ?? 0) > 0) {
    return {
      label: 'Utility',
      player: topNader.name,
      detail: `${topNader.utilityDamage} utility damage`,
    };
  }
  return undefined;
}

function pickMultikill(match: Match): Highlight | undefined {
  // Best multikill in the match, with tiebreak by count of that tier.
  for (const [size, key, label] of [
    [5, 'fiveKillCount', 'ACE'],
    [4, 'fourKillCount', '4K'],
    [3, 'threeKillCount', '3K'],
  ] as const) {
    const ranked = match.players
      .map((p) => ({ p, n: (p[key] as number | undefined) ?? 0 }))
      .filter((v) => v.n > 0)
      .sort((a, b) => b.n - a.n);
    const top = ranked[0];
    if (top) {
      return {
        label,
        player: top.p.name,
        detail: top.n > 1 ? `${top.n}× ${size}k rounds` : `clutch ${size}k`,
      };
    }
  }
  return undefined;
}

function rating(p: MatchPlayer): number {
  return p.hltvRating2 ?? p.hltvRating ?? 0;
}

function pickBy<T>(arr: T[], score: (v: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = -Infinity;
  for (const v of arr) {
    const s = score(v);
    if (s > bestScore) {
      best = v;
      bestScore = s;
    }
  }
  return best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
